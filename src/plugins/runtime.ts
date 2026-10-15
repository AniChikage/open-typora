import DOMPurify from "dompurify";
import { adaptThemeCss } from "../themes.ts";
import type { PluginDefinition, PluginState } from "./types.ts";

interface Options {
  getMarkdown(): string; getPath(): string | null; getSelection(): string;
  insert(text: string): void; replace(text: string): void;
  setReadOnly(value: boolean): void; notify(message: string): void;
  changed(id: string, state: PluginState): void;
  saveConfig(id: string, config: Record<string, any>): void;
  reservedHotkeys?: string[];
}
interface Running {
  definition: PluginDefinition; plugin: any; disposed: boolean;
  cleanup: (() => void)[]; styles: Map<string, HTMLStyleElement>;
  events: Map<string, Set<(...args: any[]) => void>>;
  shortcuts: { hotkey: string; callback: () => unknown }[];
  file: any;
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
  private locks = new Set<string>();
  private stopped = false;
  private observer: MutationObserver;
  private options: Options;
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
    this.syncDOM();
    for (const item of this.running.values()) {
      item.file?.freshLock();
      for (const type of ["fileContentLoaded", "fileEdited"]) this.publish(item, type);
    }
  }
  private publish(item: Running, name: string, ...args: any[]) {
    for (const callback of item.events.get(name) || []) {
      try { callback(...args); } catch (error) { void this.fail(item, error); }
    }
  }
  private keydown = (event: KeyboardEvent) => {
    if (event.isComposing || (event.target instanceof Element && event.target.closest('input,textarea,select,[role="dialog"]'))) return;
    for (const item of this.running.values()) for (const shortcut of item.shortcuts) {
      if (matchesHotkey(event, shortcut.hotkey)) {
        event.preventDefault(); event.stopImmediatePropagation();
        void this.invoke(item.definition.id, undefined, shortcut.callback); return;
      }
    }
  };
  private async fail(item: Running, error: unknown) {
    await this.dispose(item);
    this.options.changed(item.definition.id, { enabled: false, status: "error", error: error instanceof Error ? error.message : String(error) });
  }
  private context(item: Running) {
    const own = (cleanup: () => void) => item.cleanup.push(cleanup);
    const track = <T extends object>(target: T): T => new Proxy(target, { get: (object, key) => {
      if (key === "addEventListener") return (name: string, fn: EventListener, opts?: boolean | AddEventListenerOptions) => { (object as EventTarget).addEventListener(name, fn, opts); own(() => (object as EventTarget).removeEventListener(name, fn, opts)); };
      if (key === "classList") {
        const list = (object as Element).classList;
        return new Proxy(list, { get(list, prop) {
          if (["add", "remove", "toggle"].includes(String(prop))) return (...args: any[]) => {
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
    const eventType = { allPluginsHadInjected: "allPluginsHadInjected", fileContentLoaded: "fileContentLoaded", fileEdited: "fileEdited", beforeFileOpen: "beforeFileOpen" };
    const on = (name: string, callback: (...args: any[]) => void) => { if (!item.events.has(name)) item.events.set(name, new Set()); item.events.get(name)!.add(callback); return () => item.events.get(name)?.delete(callback); };
    const file: any = {
      lock: () => { this.locks.add(item.definition.id); this.options.setReadOnly(true); },
      unlock: () => { this.locks.delete(item.definition.id); this.options.setReadOnly(this.locks.size > 0); },
      freshLock() {},
      getFilePath: () => this.options.getPath(),
      editor: { getMarkdown: () => this.options.getMarkdown(), getValue: () => this.options.getMarkdown(), getSelection: () => this.options.getSelection(), insertText: (text: string) => this.options.insert(text) },
    };
    Object.defineProperty(file, "isLocked", { configurable: true, enumerable: true, get: () => this.locks.size > 0, set: value => value ? file.lock() : file.unlock() });
    item.file = file;
    const entities = { get eWrite() { const root = document.getElementById("write"); if (!root) throw new Error("请先打开文档。"); return track(root); }, get eContent() { return document.querySelector(".writing-area"); }, querySelectorAllInWrite: (selector: string) => this.write()?.querySelectorAll(selector) || [] };
    const utils: any = {
      PLUGIN_LOAD_ABORT: Symbol("PLUGIN_LOAD_ABORT"), supportHasSelector: CSS.supports("selector(:has(*))"), entities,
      insertStyle, upsertStyle: insertStyle, removeStyle: (name: string) => { item.styles.get(name)?.remove(); item.styles.delete(name); },
      notification: { show: (message: string) => this.options.notify(String(message)) },
      eventHub: { eventType, on, addEventListener: on, publishEvent: (name: string, ...args: any[]) => this.publish(item, name, ...args) },
      settings: { save: async (_name: string, values: Record<string, any>) => { Object.assign(item.plugin.config, values); this.options.saveConfig(item.definition.id, values); } },
      metaKeyPressed: (event: MouseEvent) => event.metaKey || event.ctrlKey,
      getCurrentFilePath: () => this.options.getPath(), getCurrentFileContent: () => this.options.getMarkdown(),
      getSelection: () => this.options.getSelection(), insertText: (text: string) => this.options.insert(text),
      editCurrentFile: async (change: (text: string) => string) => this.options.replace(change(this.options.getMarkdown())),
      waitUntil: async (predicate: () => any) => { for (let i = 0; i < 100 && !item.disposed; i++) { const value = predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 30)); } throw new Error("插件等待的编辑器接口不可用。"); },
      decorator: { afterCall: (target: () => any, name: string, callback: (...args: any[]) => void) => {
        const object = target(), original = object[name]; if (typeof original !== "function") throw new Error(`尚不支持接口：${name}`);
        object[name] = function(...args: any[]) { const result = original.apply(this, args); callback(...args); return result; };
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
    return { BasePlugin, BaseCustomPlugin, utils, File: file, $: jquery, document: scopedDocument, window,
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
      const item: Running = { definition: { ...definition, config: structuredClone(definition.config) }, plugin: null, disposed: false, cleanup: [], styles: new Map(), events: new Map(), shortcuts: [], file: null };
      this.running.set(definition.id, item); this.options.changed(definition.id, { enabled: true, status: "loading" });
      try {
        this.syncDOM();
        const factory = definition.factory || (definition.url ? (await import(/* @vite-ignore */ definition.url)).default : undefined);
        if (!factory) throw new Error("插件缺少入口。");
        const context = this.context(item), Constructor = factory(context);
        if (typeof Constructor !== "function") throw new Error("插件需要导出 module.exports.plugin 类。");
        const plugin = new Constructor(definition.id, item.definition.config, { t: (key: string) => ({ modeEnabled: "已开启", modeDisabled: "已关闭", pluginName: definition.name }[key] || key) }); item.plugin = plugin;
        if (await plugin.prepare?.() === context.utils.PLUGIN_LOAD_ABORT) throw new Error("此插件不支持当前环境。");
        await plugin.init?.();
        const style = plugin.style?.(); if (typeof style === "string") context.utils.insertStyle(definition.id, style); else if (style) throw new Error("插件使用了尚未支持的外部样式资源。");
        const html = plugin.html?.(); if (html) { const node = document.createElement("div"); node.innerHTML = DOMPurify.sanitize(html); document.body.append(node); item.cleanup.push(() => node.remove()); }
        const hotkeys = plugin.hotkey?.() || []; item.shortcuts = (Array.isArray(hotkeys) ? hotkeys : [hotkeys]).filter((binding: any) => binding?.hotkey && typeof binding.callback === "function");
        for (const shortcut of item.shortcuts) {
          const signature = hotkeySignature(shortcut.hotkey);
          if (this.options.reservedHotkeys?.some(key => hotkeySignature(key) === signature)) throw new Error(`快捷键 ${shortcut.hotkey} 已被编辑器使用，请在插件设置中更换。`);
          for (const other of this.running.values()) if (other !== item && other.shortcuts.some(binding => hotkeySignature(binding.hotkey) === signature)) throw new Error(`快捷键 ${shortcut.hotkey} 已被其他插件使用。`);
        }
        await plugin.process?.(); await plugin.postprocess?.(); this.publish(item, "allPluginsHadInjected");
        await Promise.resolve();
        if (!item.disposed && !this.stopped) this.options.changed(definition.id, { enabled: true, status: "ready" });
      } catch (error) { await this.fail(item, error); }
    });
    this.queues.set(definition.id, next); return next;
  }
  async invoke(id: string, action?: string, callback?: () => unknown) {
    const item = this.running.get(id); if (!item || item.disposed) return;
    try { await (callback ? callback() : item.plugin.call?.(action || (id === "static_markers" ? "toggle_state" : undefined))); } catch (error) { await this.fail(item, error); }
  }
  private async dispose(item: Running) {
    if (item.disposed) return;
    item.disposed = true;
    try { await item.plugin?.destroy?.(); } catch { /* Remaining owned resources are still released. */ }
    for (const cleanup of item.cleanup.reverse()) { try { cleanup(); } catch {} }
    for (const style of item.styles.values()) style.remove();
    item.events.clear(); item.shortcuts = [];
    this.locks.delete(item.definition.id); this.options.setReadOnly(this.locks.size > 0);
    if (this.running.get(item.definition.id) === item) this.running.delete(item.definition.id);
    const label = document.getElementById("footer-word-count-label"); if (!this.locks.size && label) delete label.dataset.value;
  }
  async destroy() {
    this.stopped = true; this.observer.disconnect(); document.removeEventListener("keydown", this.keydown, true); document.removeEventListener("selectionchange", this.focus);
    await Promise.all([...this.queues.values()].map(task => task.catch(() => {})));
    for (const item of this.running.values()) await this.dispose(item);
  }
}
