import DOMPurify from "dompurify";
import { adaptThemeCss } from "../themes.ts";
import type { PluginDefinition, PluginState, PluginAction } from "./types.ts";
import { PluginEvents } from "./events.ts";
import { imeKey } from "../editor/composition.ts";
import { StateRecorder } from "./stateRecorder.ts";

interface Options {
  getMarkdown(): string; getPath(): string | null; getSelection(): string;
  insert(text: string): void; replace(text: string): void;
  setReadOnly(value: boolean): void; notify(message: string): void;
  changed(id: string, state: PluginState): void;
  saveConfig(id: string, config: Record<string, any>): void;
  getDocumentId?(): string;
  composing?(): boolean;
  reservedHotkeys?: string[];
}
interface Running {
  definition: PluginDefinition; plugin: any; disposed: boolean;
  cleanup: (() => void)[]; styles: Map<string, HTMLStyleElement>;
  events: PluginEvents;
  shortcuts: { hotkey: string; callback: () => unknown }[];
  shortcutsPaused?: boolean;
  file: any;
  actionMeta?: Record<string,unknown>;
  recorder?: StateRecorder;
}
export function matchesHotkey(event: KeyboardEvent, shortcut: string, mac = /Mac/.test(navigator.platform)) {
  const parts = shortcut.toLowerCase().split(/[+-]/).map(x => x.trim()).filter(Boolean), key = parts.pop();
  const mod = parts.includes("mod"), meta = parts.includes("meta") || parts.includes("command") || (mod && mac);
  const ctrl = parts.includes("ctrl") || parts.includes("control") || (mod && !mac);
  const physical = event.code?.startsWith("Key") ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
  return key === physical && event.metaKey === meta && event.ctrlKey === ctrl && event.altKey === (parts.includes("alt") || parts.includes("option")) && event.shiftKey === parts.includes("shift");
}
function hotkeySignature(shortcut: string, mac = /Mac/.test(navigator.platform)) {
  const parts = shortcut.toLowerCase().split(/[+-]/).map(value => value.trim()).filter(Boolean), key = parts.pop();
  const allowed = ["mod", "meta", "command", "ctrl", "control", "alt", "option", "shift"];
  if (!key || parts.some(part => !allowed.includes(part))) throw new Error(`无法识别快捷键：${shortcut}`);
  return [parts.includes("meta") || parts.includes("command") || (mac && parts.includes("mod")), parts.includes("ctrl") || parts.includes("control") || (!mac && parts.includes("mod")), parts.includes("alt") || parts.includes("option"), parts.includes("shift"), key].join(":");
}
export class PluginRuntime {
  private running = new Map<string, Running>();
  private queues = new Map<string, Promise<void>>();
  private locks = new Set<Running>();
  private stopped = false;
  private observer: MutationObserver;
  private options: Options;
  private previousDocument: { id: string; path: string | null; text: string } | null = null;
  private anchor: Element | null = null;
  constructor(options: Options) {
    this.options = options;
    document.addEventListener("keydown", this.keydown, true);
    document.addEventListener("selectionchange", this.focus);
    this.observer = new MutationObserver(() => this.syncDOM());
    this.observer.observe(document.getElementById("root") || document.body, { childList: true, subtree: true });
    this.syncDOM();
  }
  private write = () => document.querySelector<HTMLElement>('.document-editor:not([hidden]) .rich-document') || document.querySelector<HTMLElement>(".rich-document");
  private focus = () => {
    const root = this.write(), anchor = window.getSelection()?.anchorNode;
    if (!root || !anchor || !root.contains(anchor)) return;
    this.anchor = anchor.nodeType === 1 ? anchor as Element : anchor.parentElement;
    let block = anchor.nodeType === 1 ? anchor as Element : anchor.parentElement;
    while (block?.parentElement && block.parentElement !== root) block = block.parentElement;
    for (const child of root.children) child.classList.toggle("md-focus", child === block);
  };
  private syncDOM() {
    const root = this.write();
    for (const other of document.querySelectorAll('.rich-document[id="write"]')) if (other !== root) other.removeAttribute("id");
    if (!root) return;
    root.id = "write";
    for (const child of root.children) child.setAttribute("cid", child.getAttribute("data-cid") || child.getAttribute("data-leaf") || "block");
    for (const element of root.querySelectorAll("ul,ol")) { element.setAttribute("mdtype","list"); element.classList.add(element.tagName === "UL" ? "ul-list" : "ol-list"); }
    for (const item of this.running.values()) item.recorder?.sync();
    const aliases: Record<string, string> = { s: "del", sub: "subscript", sup: "superscript", math: "inline_math", mark: "highlight" };
    for (const inline of root.querySelectorAll<HTMLElement>(".md-inline[data-mark]")) {
      const mark = inline.dataset.mark!; inline.setAttribute("md-inline", aliases[mark] || mark);
      inline.classList.add("md-pair-s");
      if (mark === "image") inline.classList.add("md-image", "md-img-loaded");
      if (mark === "link") inline.classList.add("md-link");
      if (mark === "math") inline.classList.add("md-inline-math");
    }
    this.focus();
  }
  documentChanged() {
    if (this.options.composing?.()) return;
    this.syncDOM();
    const next = { id: this.options.getDocumentId?.() || this.options.getPath() || "untitled", path: this.options.getPath(), text: this.options.getMarkdown() };
    const previous = this.previousDocument;
    this.previousDocument = next;
    for (const item of this.running.values()) {
      item.file?.freshLock();
      if (!previous || previous.id !== next.id || previous.path !== next.path) {
        for (const type of ["beforeFileOpen", "fileOpened", "otherFileOpened", "fileContentLoaded"]) this.publish(item, type, next.path);
      } else if (previous.text !== next.text) this.publish(item, "fileEdited", next.path);
    }
  }
  event(name: string, ...args: any[]) { for (const item of this.running.values()) this.publish(item,name,...args); }
  actions(id: string): PluginAction[] {
    const item=this.running.get(id); if (!item || item.disposed) return [];
    const meta={}, root=this.write(), anchor=this.anchor && root?.contains(this.anchor) ? this.anchor : root;
    try {
      const list=[...(item.plugin.staticActions || []), ...(item.plugin.getDynamicActions?.(anchor,meta) || [])];
      item.actionMeta=meta;
      return list.filter(action=>typeof action.act_value==='string').map(action=>({value:action.act_value,name:String(action.act_name || action.act_value),disabled:!!action.act_disabled,checked:typeof action.act_state==='boolean'?action.act_state:undefined}));
    } catch(error) {void this.fail(item,error);return [];}
  }
  private publish(item: Running, name: string, ...args: any[]) {
    if (!item.disposed) item.events.emit(name,...args);
  }
  private keydown = (event: KeyboardEvent) => {
    if (imeKey(event) || this.options.composing?.() || (event.target instanceof Element && event.target.closest('input,textarea,select,[role="dialog"]'))) return;
    for (const item of this.running.values()) for (const shortcut of item.shortcutsPaused ? [] : item.shortcuts) {
      if (matchesHotkey(event, shortcut.hotkey)) {
        event.preventDefault(); event.stopImmediatePropagation();
        void this.invoke(item.definition.id, undefined, shortcut.callback); return;
      }
    }
  };
  private async fail(item: Running, error: unknown) {
    if (item.disposed) return;
    await this.dispose(item);
    if (this.stopped || this.running.has(item.definition.id)) return;
    this.options.changed(item.definition.id, { enabled: false, status: "error", error: error instanceof Error ? error.message : String(error) });
  }
  private context(item: Running) {
    const own = (cleanup: () => void) => { if (item.disposed) cleanup(); else item.cleanup.push(cleanup); };
    const insert = (text: string) => { if (!item.disposed) this.options.insert(text); };
    const recorder = new StateRecorder(this.write, () => this.options.getDocumentId?.() || this.options.getPath() || "untitled");
    item.recorder = recorder; own(() => recorder.clear());
    const track = <T extends object>(target: T): T => new Proxy(target, { get: (object, key) => {
      if (key === "addEventListener") return (name: string, fn: EventListener, opts?: boolean | AddEventListenerOptions) => { (object as EventTarget).addEventListener(name, fn, opts); own(() => (object as EventTarget).removeEventListener(name, fn, opts)); };
      if (key === "classList") {
        const list = (object as Element).classList;
        return new Proxy(list, { get(list, prop) {
          if (["add", "remove", "toggle"].includes(String(prop))) return (...args: any[]) => {
            if (item.disposed) return;
            const names = prop === "toggle" ? [args[0]] : args;
            const previous = names.map(name => list.contains(name));
            const result = (list[prop as "toggle"] as any)(...args);
            own(() => names.forEach((name, i) => list.toggle(name, previous[i]))); return result;
          };
          const value = Reflect.get(list, prop, list); return typeof value === "function" ? value.bind(list) : value;
        } });
      }
      const value = Reflect.get(object, key, object); return typeof value === "function" ? value.bind(object) : value;
    } });
    const scopedDocument = new Proxy(document, { get: (target, key) => {
      if (key === "documentElement" || key === "body") return track(target[key]);
      if (key === "addEventListener") return (name: string, fn: EventListener, opts?: boolean | AddEventListenerOptions) => { target.addEventListener(name, fn, opts); own(() => target.removeEventListener(name, fn, opts)); };
      const value = Reflect.get(target, key, target); return typeof value === "function" ? value.bind(target) : value;
    } });
    const insertStyle = (name: string, css: string) => {
      if (item.disposed) return;
      let style = item.styles.get(name);
      if (!style) { style = document.createElement("style"); style.dataset.plugin = item.definition.id; item.styles.set(name, style); document.head.append(style); }
      style.textContent = adaptThemeCss(css).replace(/(\d+)\s+ms\b/g, "$1ms");
    };
    const eventType = Object.fromEntries(["allPluginsHadInjected", "fileContentLoaded", "fileEdited", "beforeFileOpen", "fileOpened", "otherFileOpened", "beforeToggleSourceMode", "afterToggleSidebar", "toggleSettingPage", "outlineUpdated"].map(name => [name,name]));
    const on = (name: string, callback: (...args: any[]) => unknown, order = 0, once = false) =>
      item.disposed ? () => {} : item.events.on(name, callback, order, once);
    const activeTimers = new Map<number,boolean>();
    own(() => { for (const [id,repeat] of activeTimers) repeat ? window.clearInterval(id) : window.clearTimeout(id); activeTimers.clear(); });
    const timed = (repeat: boolean, callback: (...args: any[]) => unknown, delay = 0, ...args: any[]) => {
      if (item.disposed) return 0;
      const invoke = () => { if (!repeat) activeTimers.delete(id); if (!item.disposed) { try { Promise.resolve(callback(...args)).catch(error => this.fail(item,error)); } catch(error) { void this.fail(item,error); } } };
      const id = repeat ? window.setInterval(invoke,delay) : window.setTimeout(invoke,delay);
      activeTimers.set(id,repeat); return id;
    };
    const clearTimer = (id: number) => { window.clearTimeout(id); window.clearInterval(id); activeTimers.delete(id); };
    const timers = { setTimeout: (callback: (...args: any[]) => unknown, delay?: number, ...args: any[]) => timed(false,callback,delay,...args), setInterval: (callback: (...args: any[]) => unknown, delay?: number, ...args: any[]) => timed(true,callback,delay,...args), clearTimeout: clearTimer, clearInterval: clearTimer };
    const scopedWindow = new Proxy(window, { get(target,key) {
      if (key in timers) return timers[key as keyof typeof timers];
      if (key === "document") return scopedDocument;
      if (key === "addEventListener") return (name: string, fn: EventListener, opts?: boolean | AddEventListenerOptions) => { target.addEventListener(name,fn,opts); own(() => target.removeEventListener(name,fn,opts)); };
      const value = Reflect.get(target,key,target); return typeof value === "function" ? value.bind(target) : value;
    } });
    const register = (bindings: any) => {
      if (item.disposed) return;
      for (const binding of Array.isArray(bindings) ? bindings : [bindings]) {
        if (Array.isArray(binding)) { register(binding); continue; }
        if (!binding?.hotkey || typeof binding.callback !== "function") continue;
        for (const hotkey of Array.isArray(binding.hotkey) ? binding.hotkey : [binding.hotkey]) {
          const signature = hotkeySignature(hotkey);
          if (this.options.reservedHotkeys?.some(key => hotkeySignature(key) === signature)) throw new Error(`快捷键 ${hotkey} 已被编辑器使用，请在插件设置中更换。`);
          for (const other of this.running.values()) if (other !== item && other.shortcuts.some(entry => hotkeySignature(entry.hotkey) === signature)) throw new Error(`快捷键 ${hotkey} 已被其他插件使用。`);
          item.shortcuts = item.shortcuts.filter(entry => hotkeySignature(entry.hotkey) !== signature);
          item.shortcuts.push({ hotkey, callback: binding.callback });
        }
      }
    };
    const file: any = {
      lock: () => { if (item.disposed) return; this.locks.add(item); this.options.setReadOnly(true); },
      unlock: () => { if (item.disposed) return; this.locks.delete(item); this.options.setReadOnly(this.locks.size > 0); },
      freshLock() {},
      getFilePath: () => this.options.getPath(),
      editor: { getMarkdown: () => this.options.getMarkdown(), getValue: () => this.options.getMarkdown(), getSelection: () => this.options.getSelection(), insertText: insert },
    };
    Object.defineProperty(file, "isLocked", { configurable: true, enumerable: true, get: () => this.locks.size > 0, set: value => value ? file.lock() : file.unlock() });
    item.file = file;
    const entities = { get eWrite() { const root = document.getElementById("write"); if (!root) throw new Error("请先打开文档。"); return track(root); }, get eContent() { return document.querySelector(".writing-area"); }, querySelectorAllInWrite: (selector: string) => this.write()?.querySelectorAll(selector) || [] };
    const utils: any = {
      PLUGIN_LOAD_ABORT: Symbol("PLUGIN_LOAD_ABORT"), supportHasSelector: CSS.supports("selector(:has(*))"), entities,
      insertStyle, upsertStyle: insertStyle, removeStyle: (name: string) => { item.styles.get(name)?.remove(); item.styles.delete(name); },
      notification: { show: (message: string) => { if (!item.disposed) this.options.notify(String(message)); } },
      eventHub: { eventType, on, addEventListener: on, off: item.events.off, removeEventListener: item.events.off, once: (name: string, callback: (...args: any[]) => unknown, order?: number) => on(name,callback,order,true), emit: (name: string, ...args: any[]) => { if (!item.disposed) this.event(name,...args); }, publishEvent: (name: string, ...args: any[]) => { if (!item.disposed) this.event(name,...args); } },
      hotkeyHub: { register, registerSingle: (hotkey: string | string[], callback: () => unknown) => register({hotkey,callback}), unregister: (hotkey: string) => { const signature = hotkeySignature(hotkey); item.shortcuts = item.shortcuts.filter(entry => hotkeySignature(entry.hotkey) !== signature); }, pause: () => { item.shortcutsPaused = true; }, resume: () => { item.shortcutsPaused = false; } },
      settings: {
        save: async (_name: string, values: Record<string, any>) => { if (item.disposed) return; Object.assign(item.plugin.config, values); this.options.saveConfig(item.definition.id, {...values}); },
        autoSave: (plugin: any) => { plugin.config = new Proxy(plugin.config, { set: (target,key,value) => { if (Object.is(target[key],value)) return true; Reflect.set(target,key,value); if (!item.disposed) this.options.saveConfig(item.definition.id,{...target}); return true; } }); },
      },
      stateRecorder: recorder,
      metaKeyPressed: (event: MouseEvent) => event.metaKey || event.ctrlKey,
      getCurrentFilePath: () => this.options.getPath(), getFilePath: () => this.options.getPath(), getCurrentFileContent: () => this.options.getMarkdown(),
      getSelection: () => this.options.getSelection(), insertText: insert,
      editCurrentFile: async (change: (text: string) => string) => {
        if (item.disposed) return;
        const text = change(this.options.getMarkdown());
        if (!item.disposed) this.options.replace(text);
      },
      waitUntil: async (predicate: () => any) => { for (let i = 0; i < 100 && !item.disposed; i++) { const value = predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 30)); } throw new Error("插件等待的编辑器接口不可用。"); },
      debounce: (callback: (...args: any[]) => unknown, delay = 100) => { let timer: number; return (...args: any[]) => { timers.clearTimeout(timer); timer = timers.setTimeout(callback,delay,...args); }; },
      throttle: (callback: (...args: any[]) => unknown, delay = 100) => { let last = -Infinity; return (...args: any[]) => { const now = Date.now(); if (!item.disposed && now-last >= delay) { last=now; return callback(...args); } }; },
      decorator: { afterCall: (target: () => any, name: string, callback: (...args: any[]) => void) => {
        if (item.disposed) return;
        const object = target(), original = object[name]; if (typeof original !== "function") throw new Error(`尚不支持接口：${name}`);
        object[name] = function(...args: any[]) { const result = original.apply(this, args); if (!item.disposed) callback(...args); return result; };
        own(() => { object[name] = original; });
      } },
    };
    class BasePlugin {
      fixedName: string; config: any; i18n: any; utils = utils; pluginName: string;
      constructor(name: string, config: any, i18n: any) { this.fixedName = name; this.config = config; this.i18n = i18n; this.pluginName = config.NAME || item.definition.name; }
      prepare() {} init() {} style() {} html() {} hotkey() {} process() {} postprocess() {} call(_action?: string, _meta?: any) {}
    }
    const jquery = (selector: string) => {
      const nodes = document.querySelectorAll<HTMLElement>(selector);
      return { removeClass: (name: string) => nodes.forEach(node => track(node).classList.remove(name)), addClass: (name: string) => nodes.forEach(node => track(node).classList.add(name)), get: (i: number) => nodes[i], length: nodes.length };
    };
    class BaseCustomPlugin extends BasePlugin {
      callback(_anchor?: Element) {}
      call() { const anchor = window.getSelection()?.anchorNode?.parentElement || document.getElementById("write"); return this.callback(anchor || undefined); }
    }
    return { BasePlugin, BaseCustomPlugin, utils, File: file, $: jquery, document: scopedDocument, window: scopedWindow, ...timers,
      require: (name: string) => { throw new Error(`尚不支持模块「${name}」。当前兼容层不提供 Node/Electron 或外部模块。`); } };
  }
  setEnabled(definition: PluginDefinition, enabled: boolean) {
    const previous = this.queues.get(definition.id) || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      if (this.stopped) return;
      const current = this.running.get(definition.id);
      if (enabled && current && JSON.stringify(current.definition.config) === JSON.stringify(definition.config)) return;
      if (current) await this.dispose(current);
      if (!enabled) { this.options.changed(definition.id, { enabled: false, status: "disabled" }); return; }
      const item: Running = { definition: { ...definition, config: structuredClone(definition.config) }, plugin: null, disposed: false, cleanup: [], styles: new Map(), events: new PluginEvents(error => { void this.fail(item,error); }), shortcuts: [], file: null };
      this.running.set(definition.id, item); this.options.changed(definition.id, { enabled: true, status: "loading" });
      try {
        this.syncDOM();
        const factory = definition.factory || (definition.url ? (await import(/* @vite-ignore */ definition.url)).default : undefined);
        if (item.disposed || this.stopped) return;
        if (!factory) throw new Error("插件缺少入口。");
        const context = this.context(item), Constructor = factory(context);
        if (typeof Constructor !== "function") throw new Error("插件需要导出 module.exports.plugin 类。");
        const labels: Record<string,string> = { modeEnabled: "已开启", modeDisabled: "已关闭", pluginName: definition.name, "$label.RECORD_COLLAPSE": "记住折叠状态" };
        const plugin = new Constructor(definition.id, item.definition.config, { t: (key: string) => labels[key] || key, fillActions: (actions: any[]) => actions.map(action=>({...action,act_name:action.act_name || labels[action.act_value] || action.act_value})) }); item.plugin = plugin;
        if (await plugin.prepare?.() === context.utils.PLUGIN_LOAD_ABORT) throw new Error("此插件不支持当前环境。");
        if (item.disposed || this.stopped) return;
        await plugin.init?.();
        if (item.disposed || this.stopped) return;
        const style = plugin.style?.(); if (typeof style === "string") context.utils.insertStyle(definition.id, style); else if (style) throw new Error("插件使用了尚未支持的外部样式资源。");
        const html = plugin.html?.(); if (html) { const node = document.createElement("div"); node.innerHTML = DOMPurify.sanitize(html); document.body.append(node); item.cleanup.push(() => node.remove()); }
        context.utils.hotkeyHub.register(plugin.hotkey?.());
        await plugin.process?.();
        if (item.disposed || this.stopped) return;
        await plugin.postprocess?.();
        this.publish(item, "allPluginsHadInjected");
        await Promise.resolve();
        if (!item.disposed && !this.stopped) this.options.changed(definition.id, { enabled: true, status: "ready" });
      } catch (error) { await this.fail(item, error); }
    });
    this.queues.set(definition.id, next); return next;
  }
  async invoke(id: string, action?: string, callback?: () => unknown) {
    const item = this.running.get(id); if (!item || item.disposed) return;
    try { await (callback ? callback() : item.plugin.call?.(action || (id === "static_markers" ? "toggle_state" : undefined), item.actionMeta)); } catch (error) { await this.fail(item, error); }
  }
  private async dispose(item: Running) {
    if (item.disposed) return;
    item.disposed = true;
    // Release effects before awaiting plugin teardown: its promise may outlive
    // a replacement instance, or never settle. Late host calls are inert.
    for (const cleanup of item.cleanup.reverse()) { try { cleanup(); } catch {} }
    for (const style of item.styles.values()) style.remove();
    item.events.clear(); item.shortcuts = [];
    this.locks.delete(item); this.options.setReadOnly(this.locks.size > 0);
    if (this.running.get(item.definition.id) === item) this.running.delete(item.definition.id);
    const label = document.getElementById("footer-word-count-label"); if (!this.locks.size && label) delete label.dataset.value;
    try { await item.plugin?.destroy?.(); } catch { /* Owned resources were already released. */ }
  }
  async destroy() {
    this.stopped = true; this.observer.disconnect(); document.removeEventListener("keydown", this.keydown, true); document.removeEventListener("selectionchange", this.focus);
    const disposing = [...this.running.values()].map(item => this.dispose(item));
    await Promise.all([...this.queues.values(), ...disposing].map(task => task.catch(() => {})));
  }
}
