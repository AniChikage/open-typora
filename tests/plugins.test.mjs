import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { JSDOM } from "jsdom";
import { pluginModule } from "../shared/plugin-module.mjs";
import { installPlugin, plugins } from "../electron/plugins.mjs";
import { installTheme, themes } from "../electron/interchange.mjs";
import { pluginResource } from "../electron/resources.mjs";

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"><div class="document-editor"><div class="rich-document"><p data-cid="a"><span class="md-inline" data-mark="strong"><span class="md-meta">**</span><strong>Example</strong><span class="md-meta">**</span></span></p><p data-cid="b">Other paragraph <span class="md-inline" data-mark="image"><img></span></p><p><input type="checkbox"></p></div></div></div><span id="footer-word-count-label"></span></body></html>', { url: "http://localhost" });
for (const key of ["window", "document", "Element", "HTMLElement", "MutationObserver", "Event", "KeyboardEvent", "MouseEvent", "Node"]) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.CSS = { supports: () => true };
const { PluginRuntime } = await import("../src/plugins/runtime.ts");
const { builtInThemes, applyTheme } = await import("../src/themes.ts");
const source = async name => readFile(new URL(`../third-party/typora-plugins/${name}.js`, import.meta.url), "utf8");
async function factory(name) {
  const text = pluginModule(await source(name)).replace("export default function(context)", "globalThis.factory = function(context)");
  const sandbox = vm.createContext({ queueMicrotask, MouseEvent }); new vm.Script(text).runInContext(sandbox); return sandbox.factory;
}
function runtime() {
  const states = {}, locks = [], saved = [];
  const value = new PluginRuntime({ getMarkdown: () => "# Source", getPath: () => "/tmp/source.md", getSelection: () => "Example", insert() {}, replace() {}, setReadOnly: value => locks.push(value), notify() {}, changed: (id, state) => { states[id] = state; }, saveConfig: (id, config) => saved.push({ id, config }) });
  return { value, states, locks, saved };
}
const definition = async (id, config) => ({ id, name: id, description: "upstream fixture", factory: await factory(id), config });
test("unmodified upstream mode plugins run their lifecycle, apply real DOM effects and clean up", async () => {
  const run = runtime();
  try {
    const dark = await definition("dark", { DARK_DEFAULT: true, HOTKEY: "mod+alt+d" });
    await run.value.setEnabled(dark, true); assert.equal(run.states.dark.status, "ready"); assert.equal(document.documentElement.classList.contains("plugin-dark"), true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "d", code: "KeyD", ctrlKey: true, altKey: true, bubbles: true, cancelable: true })); await Promise.resolve();
    assert.equal(document.documentElement.classList.contains("plugin-dark"), false);
    await run.value.invoke("dark"); assert.equal(document.documentElement.classList.contains("plugin-dark"), true);
    await run.value.setEnabled(dark, false); assert.equal(document.documentElement.classList.contains("plugin-dark"), false);
    const image = await definition("no_image", { NO_IMAGE_DEFAULT: true, SHOW_ON_HOVER: true, TRANSITION_DURATION: 200, TRANSITION_DELAY: 0 });
    await run.value.setEnabled(image, true); assert.equal(run.states.no_image.status, "ready");
    assert.match(document.querySelector('style[data-plugin="no_image"]').textContent, /opacity: 0/);
    assert.match(document.querySelector('style[data-plugin="no_image"]').textContent, /200ms/);
    assert.equal(document.querySelector(".md-image"), document.querySelector('[data-mark="image"]'));
    await run.value.setEnabled(image, false); assert.equal(document.querySelector('style[data-plugin="no_image"]'), null);
    const blur = await definition("blur", { BLUR_DEFAULT: true, BLUR_TYPE: "blur", BLUR_LEVEL: 3, RESTORE_ON_HOVER: true });
    await run.value.setEnabled(blur, true); assert.match(document.querySelector('style[data-plugin="blur"]').textContent, /blur\(3px\)/); assert.ok(document.querySelector('#write > [cid]'));
    await run.value.setEnabled(blur, false);
    const markers = await definition("static_markers", { STATIC_DEFAULT: true, STATIC_MARKERS: ["strong", "em"] });
    await run.value.setEnabled(markers, true); assert.equal(run.states.static_markers.status, "ready"); assert.ok(document.querySelector('[md-inline="strong"].md-pair-s')); assert.match(document.querySelector('style[data-plugin="static_markers"]').textContent, /display: inline/);
    await run.value.invoke("static_markers"); assert.equal(run.saved.at(-1).config.STATIC_DEFAULT, false);
  } finally { await run.value.destroy(); }
  assert.equal(document.querySelector("style[data-plugin]"), null);
});
test("original read-only plugin locks, toggles, survives document refresh and releases the editor on disable", async () => {
  const run = runtime(), plugin = await definition("read_only", { READ_ONLY_DEFAULT: true, SHOW_TEXT: "只读", REMAIN_AVAILABLE_MENU_KEY: [] });
  try {
    await run.value.setEnabled(plugin, true); assert.equal(run.states.read_only.status, "ready"); assert.equal(run.locks.at(-1), true);
    assert.equal(document.querySelector('input[type="checkbox"]').disabled, true); assert.match(document.getElementById("footer-word-count-label").dataset.value, /只读/);
    run.value.documentChanged(); assert.equal(run.locks.at(-1), true);
    await run.value.invoke("read_only"); assert.equal(run.locks.at(-1), false);
    await run.value.invoke("read_only"); assert.equal(run.locks.at(-1), true);
    await run.value.setEnabled(plugin, false); assert.equal(run.locks.at(-1), false);
    await run.value.setEnabled(plugin, true); assert.equal(run.states.read_only.status, "ready");
  } finally { await run.value.destroy(); }
  assert.equal(run.locks.at(-1), false);
});
test("a failing plugin is isolated and removes styles and locks without stopping other plugins", async () => {
  const run = runtime();
  try {
    await run.value.setEnabled({ id: "failure", name: "failure", description: "", config: {}, factory: context => class extends context.BasePlugin { style() { return "p{color:red}"; } process() { context.File.lock(); context.require("fs"); } } }, true);
    assert.equal(run.states.failure.status, "error"); assert.match(run.states.failure.error, /fs/); assert.equal(run.locks.at(-1), false); assert.equal(document.querySelector('style[data-plugin="failure"]'), null);
    await run.value.setEnabled(await definition("dark", { DARK_DEFAULT: false }), true); assert.equal(run.states.dark.status, "ready");
  } finally { await run.value.destroy(); }
});
test("rapid enable/disable requests settle in the final requested state without leaked effects", async () => {
  const run = runtime(), plugin = await definition("dark", { DARK_DEFAULT: true });
  await Promise.all([run.value.setEnabled(plugin, true), run.value.setEnabled(plugin, false), run.value.setEnabled(plugin, true), run.value.setEnabled(plugin, false)]);
  assert.equal(run.states.dark.status, "disabled"); assert.equal(document.documentElement.classList.contains("plugin-dark"), false); await run.value.destroy();
});
test("reserved editor shortcuts fail visibly instead of overriding editing commands", async () => {
  const states = {};
  const run = new PluginRuntime({ getMarkdown:()=>"",getPath:()=>null,getSelection:()=>"",insert(){},replace(){},setReadOnly(){},notify(){},changed:(id,state)=>states[id]=state,saveConfig(){},reservedHotkeys:["Mod-Alt-B"] });
  try { await run.setEnabled(await definition("blur",{BLUR_DEFAULT:true,BLUR_TYPE:"blur",BLUR_LEVEL:3,HOTKEY:"mod+alt+b"}),true); assert.equal(states.blur.status,"error"); assert.match(states.blur.error,/编辑器使用/); assert.equal(document.querySelector('style[data-plugin="blur"]'),null); } finally { await run.destroy(); }
});
test("six built-in themes apply to the editor and exported styles without altering document content", () => {
  const original = document.getElementById("write").innerHTML;
  assert.equal(builtInThemes.length, 6);
  for (const theme of builtInThemes) { const clear = applyTheme(theme.id); assert.equal(document.documentElement.dataset.appearance, theme.dark ? "dark" : "light"); assert.match(document.querySelector('style[data-custom-theme]').textContent, new RegExp(theme.paper)); clear(); }
  assert.equal(document.getElementById("write").innerHTML, original);
});
test("local CommonJS installation preserves original source, is content addressed and rejects invalid input", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "open-typora-plugins-"));
  try {
    const entry = path.join(root, "example.js"), directory = path.join(root, "profile"); await mkdir(directory); const original = await source("dark"); await writeFile(entry, original);
    const installed = await installPlugin(entry, directory); assert.equal((await installPlugin(entry, directory)).id, installed.id);
    assert.deepEqual(await plugins(directory), [installed]); assert.ok((await readFile(path.join(directory,"plugins",installed.id+".mjs"), "utf8")).includes(original));
    const resource = await pluginResource(installed.url,directory); assert.equal(resource.mime,"application/javascript"); assert.ok(resource.bytes.toString().includes(original));
    await assert.rejects(pluginResource('opentypora://app/_plugins/../../example.js',directory));
    await assert.rejects(pluginResource('opentypora://other/_plugins/'+installed.id+'.mjs',directory));
    await writeFile(path.join(directory, "plugins", "local-" + "a".repeat(64) + ".json"), '{"id":"../../escape","name":"bad"}'); assert.equal((await plugins(directory)).length, 1);
    await writeFile(entry, Buffer.from([0xff, 0xfe])); await assert.rejects(installPlugin(entry, directory));
    await writeFile(entry, "\0"); await assert.rejects(installPlugin(entry, directory));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("Windows theme installation embeds local imports, fonts and images and refuses cycles and path escapes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "open-typora-theme-"));
  try {
    const theme = path.join(root, "theme"), profile = path.join(root, "profile"); await mkdir(theme); await mkdir(profile);
    await writeFile(path.join(theme, "font.woff2"), "owned font"); await writeFile(path.join(theme, "image.png"), "owned image"); await writeFile(path.join(theme, "type.css"), '@font-face{font-family:Owned;src:url("font.woff2")}');
    const css = path.join(theme, "main.css"); await writeFile(css, '@import "type.css"; #write{background-image:url(image.png)}');
    await installTheme(css, profile); const installed = (await themes(profile))[0].css; assert.match(installed, /data:font\/woff2;base64/); assert.match(installed, /data:image\/png;base64/); assert.ok(!installed.includes("@import"));
    await writeFile(css, '@import "main.css";'); await assert.rejects(installTheme(css, profile), /循环/);
    await writeFile(path.join(root, "outside.png"), "outside"); await writeFile(css, '#write{background:url(../outside.png)}'); await assert.rejects(installTheme(css, profile), /之外/);
    await symlink(path.join(root, "outside.png"), path.join(theme, "link.png")); await writeFile(css, '#write{background:url(link.png)}'); await assert.rejects(installTheme(css, profile), /之外/);
    await writeFile(css, '#write{background:url(https://example.com/a.png)}'); await assert.rejects(installTheme(css, profile), /本地/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
