import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, mkdtemp, mkdir, writeFile, rm, symlink, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { JSDOM } from "jsdom";
import { pluginModule, pluginPackage } from "../shared/plugin-module.mjs";
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
test("document lifecycle distinguishes a load from edits and supports ordered, once, removed and cross-plugin listeners", async () => {
  let text="first", id="one"; const events=[], states={};
  const run=new PluginRuntime({getMarkdown:()=>text,getPath:()=>'/tmp/'+id+'.md',getDocumentId:()=>id,getSelection:()=>'',insert(){},replace(){},setReadOnly(){},notify(){},changed:(id,state)=>states[id]=state,saveConfig(){}});
  const definition={id:'events',name:'events',description:'',config:{},factory:c=>class extends c.BasePlugin {process(){
    const e=this.utils.eventHub, removed=()=>events.push('removed'); e.on('fileEdited',()=>events.push('late'),10); e.on('fileEdited',()=>events.push('early'),-1);
    e.once('fileEdited',()=>events.push('once')); e.on('fileEdited',removed); e.off('fileEdited',removed);
    e.on('fileContentLoaded',path=>events.push('load:'+path)); e.on('shared',()=>events.push('shared'));
  }}};
  try {
    await run.setEnabled(definition,true); run.documentChanged(); text='second'; run.documentChanged(); run.documentChanged(); text='third'; run.documentChanged(); id='two'; run.documentChanged();
    assert.deepEqual(events,['load:/tmp/one.md','early','once','late','early','late','load:/tmp/two.md']);
    await run.setEnabled({id:'sender',name:'sender',description:'',config:{},factory:c=>class extends c.BasePlugin {call(){this.utils.eventHub.emit('shared')}}},true);
    await run.invoke('sender'); assert.equal(events.at(-1),'shared');
  } finally {await run.destroy();}
});
test("async event failures release only the failed plugin's resources", async()=>{
  const run=runtime();
  try {
    await run.value.setEnabled({id:'async',name:'async',description:'',config:{},factory:c=>class extends c.BasePlugin { process(){ c.File.lock(); this.utils.insertStyle('async','p{color:red}'); this.utils.eventHub.on('fileEdited',async()=>{throw new Error('async failed')}); } }},true);
    await run.value.setEnabled(await definition('dark',{DARK_DEFAULT:true}),true);
    run.value.event('fileEdited'); await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(run.states.async.status,'error'); assert.match(run.states.async.error,/async failed/); assert.equal(document.querySelector('style[data-plugin="async"]'),null); assert.equal(run.locks.at(-1),false); assert.equal(run.states.dark.status,'ready');
  } finally {await run.value.destroy();}
});
test("dynamic hotkeys support arrays, pause, unregister and IME guards; timers stop on disable",async()=>{
  const run=runtime();let calls=0,ticks=0;
  const plugin={id:'resources',name:'resources',description:'',config:{},factory:c=>class extends c.BasePlugin {process(){
    this.utils.hotkeyHub.registerSingle(['ctrl+alt+x','ctrl+alt+y'],()=>calls++);
    c.setInterval(()=>ticks++,3); c.window.setTimeout(()=>ticks+=1000,100);
  } call(action){this.utils.hotkeyHub[action==='unregister'?'unregister':action]('ctrl+alt+x')}}};
  const press=(extra={})=>document.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'x',code:'KeyX',ctrlKey:true,altKey:true,...extra}));
  try {
    await run.value.setEnabled(plugin,true); press(); assert.equal(calls,1); press({keyCode:229}); press({isComposing:true}); assert.equal(calls,1);
    await run.value.invoke('resources','pause'); press(); assert.equal(calls,1); await run.value.invoke('resources','resume'); press(); assert.equal(calls,2);
    await run.value.invoke('resources','unregister'); press(); assert.equal(calls,2);
    await new Promise(resolve=>setTimeout(resolve,12)); assert.ok(ticks>0); await run.value.setEnabled(plugin,false); const stopped=ticks; await new Promise(resolve=>setTimeout(resolve,110)); assert.equal(ticks,stopped);
  }finally {await run.value.destroy();}
});
test("pinned original list-folding plugin preserves folded lists across DOM replacement without touching Markdown",async()=>{
  const root=document.getElementById('write'), original=root.innerHTML, run=runtime();
  root.innerHTML='<ul data-cid="list"><li>first</li><li>second</li></ul>';
  try {
    const plugin=await definition('collapse_list',{RECORD_COLLAPSE:true,TRIANGLE_COLOR:''}); await run.value.setEnabled(plugin,true); assert.equal(run.states.collapse_list.status,'ready');
    const list=root.querySelector('ul'); list.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:-18,clientY:0})); assert.ok(list.classList.contains('plugin-collapsed-list'));
    root.innerHTML='<ul data-cid="list"><li>first</li><li>changed</li></ul>'; run.value.documentChanged(); assert.ok(root.querySelector('ul').classList.contains('plugin-collapsed-list')); assert.equal(root.textContent,'firstchanged');
    await run.value.invoke('collapse_list','record_collapse_state'); assert.equal(run.saved.at(-1).config.RECORD_COLLAPSE,false);
    await run.value.setEnabled(plugin,false); assert.equal(document.querySelector('style[data-plugin="collapse_list"]'),null);
  }finally {await run.value.destroy();root.innerHTML=original;}
});
test("plugin commands retain labels, checked/disabled states and selection metadata",async()=>{
  const run=runtime();let invoked;
  try {
    await run.value.setEnabled({id:'commands',name:'commands',description:'',config:{},factory:c=>class extends c.BasePlugin {
      staticActions=[{act_value:'static',act_name:'Static command'}];
      getDynamicActions(anchor,meta){meta.target=anchor;return [{act_value:'dynamic',act_name:'Dynamic command',act_state:true},{act_value:'unavailable',act_disabled:true}];}
      call(action,meta){invoked={action,target:meta.target};}
    }},true);
    const actions=run.value.actions('commands');assert.deepEqual(actions.map(x=>x.name),['Static command','Dynamic command','unavailable']);assert.equal(actions[1].checked,true);assert.equal(actions[2].disabled,true);
    await run.value.invoke('commands','dynamic');assert.equal(invoked.action,'dynamic');assert.equal(invoked.target,document.getElementById('write'));
  }finally {await run.value.destroy();}
});
test("late cleanup from a failed plugin cannot overwrite a newly enabled instance",async()=>{
  const run=runtime();let release;
  const first={id:'race',name:'race',description:'',config:{version:1},factory:c=>class extends c.BasePlugin {
    process(){this.utils.eventHub.on('fail',async()=>{throw Error('old instance')});}
    destroy(){return new Promise(resolve=>release=resolve);}
  }};
  try {
    await run.value.setEnabled(first,true);run.value.event('fail');await Promise.resolve();
    await run.value.setEnabled({...first,config:{version:2},factory:c=>class extends c.BasePlugin{}},true);
    release();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(run.states.race.status,'ready');
  }finally {await run.value.destroy();}
});
test("plugin edit events wait for composition and observe only committed Markdown",async()=>{
  let text='original',composing=false;const seen=[];
  const run=new PluginRuntime({getMarkdown:()=>text,getPath:()=>'/tmp/test.md',getSelection:()=>'',composing:()=>composing,insert(){},replace(){},setReadOnly(){},notify(){},changed(){},saveConfig(){}});
  try {
    await run.setEnabled({id:'events',name:'events',description:'',config:{},factory:c=>class extends c.BasePlugin{process(){this.utils.eventHub.on('fileEdited',()=>seen.push(this.utils.getCurrentFileContent()));}}},true);
    run.documentChanged();composing=true;text='originalni';run.documentChanged();assert.deepEqual(seen,[]);
    composing=false;text='original你';run.documentChanged();run.documentChanged();assert.deepEqual(seen,['original你']);
  }finally {await run.destroy();}
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
test("folder installation resolves nested CommonJS, JSON and CSS, caches modules, and owns helper timers",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'open-typora-package-')), profile=path.join(root,'profile'), folder=path.join(root,'source');await mkdir(profile);
  await cp(new URL('./fixtures/plugin-package',import.meta.url),folder,{recursive:true});
  let text='original'; const states={};
  const run=new PluginRuntime({getMarkdown:()=>text,getPath:()=>'/tmp/doc.md',getSelection:()=>'',insert:value=>text+=value,replace:value=>text=value,setReadOnly(){},notify(){},changed:(id,state)=>states[id]=state,saveConfig(){}});
  try {
    const installed=await installPlugin(folder,profile);assert.equal((await installPlugin(folder,profile)).id,installed.id);
    const compiled=await readFile(path.join(profile,'plugins',installed.id+'.mjs'),'utf8');
    await rm(folder,{recursive:true}); // The installed copy is independent of source.
    const sandbox=vm.createContext({});new vm.Script(compiled.replace('export default function(context)','globalThis.factory = function(context)')).runInContext(sandbox);
    const definition={...installed,description:'',config:{},factory:sandbox.factory};await run.setEnabled(definition,true);assert.equal(states[installed.id].status,'ready');
    assert.equal(window.packageProbe.cached,true);assert.match(window.packageProbe.marker,/__ENTRY__/);assert.match(document.querySelector(`style[data-plugin="${installed.id}"]`).textContent,/package-fixture/);
    await run.invoke(installed.id);assert.equal(text,'original插件中文😀42');
    await new Promise(resolve=>setTimeout(resolve,60));assert.ok(window.packageProbe.ticks>0);
    await run.setEnabled(definition,false);const stopped=window.packageProbe.ticks;await new Promise(resolve=>setTimeout(resolve,60));assert.equal(window.packageProbe.ticks,stopped);
    assert.equal(document.querySelector(`style[data-plugin="${installed.id}"]`),null);
  } finally {await run.destroy();await rm(root,{recursive:true,force:true});}
});
test("folder module loading supports circular CommonJS and rejects external or escaping requests",()=>{
  const files={'index.js':"exports.initial='A'; const b=require('./b'); module.exports.plugin=class { constructor(){this.seen=b.seen} };",'b.js':"exports.seen=require('./index').initial;"};
  const sandbox=vm.createContext({});const execute=code=>{new vm.Script(code.replace('export default function(context)','globalThis.factory=function(context)')).runInContext(sandbox);return sandbox.factory({require:name=>{throw Error('Unsupported '+name)}});};
  assert.equal(new (execute(pluginPackage('index.js',files)))().seen,'A');
  assert.throws(()=>execute(pluginPackage('index.js',{'index.js':"require('../outside');"})),/文件夹之外/);
  assert.throws(()=>execute(pluginPackage('index.js',{'index.js':"require('node:fs');"})),/Unsupported node:fs/);
  assert.throws(()=>execute(pluginPackage('index.js',{'index.js':"require('./missing');"})),/缺少模块/);
});
test("folder installation refuses symlinks, invalid entry paths and excessive bundles without partial records",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'open-typora-package-limits-')),profile=path.join(root,'profile'),folder=path.join(root,'source');await mkdir(profile);await mkdir(folder);
  try {
    await writeFile(path.join(folder,'index.js'),'module.exports.plugin=class {};');
    await writeFile(path.join(folder,'package.json'),'{"main":"../outside.js"}');await assert.rejects(installPlugin(folder,profile),/文件夹内/);
    await rm(path.join(folder,'package.json'));await symlink(path.join(root,'outside.js'),path.join(folder,'link.js'));await assert.rejects(installPlugin(folder,profile),/符号链接/);
    await rm(path.join(folder,'link.js'));for(let i=0;i<64;i++)await writeFile(path.join(folder,i+'.js'),'');
    await assert.rejects(installPlugin(folder,profile),/64/);assert.deepEqual(await plugins(profile),[]);
  } finally {await rm(root,{recursive:true,force:true});}
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


test("disabled plugins cannot mutate documents or reacquire locks from pending async commands", async()=>{
  let release, captured; const edits=[],locks=[];
  const run=new PluginRuntime({getMarkdown:()=>'original',getPath:()=>null,getSelection:()=>'',insert:text=>edits.push(text),replace:text=>edits.push(text),setReadOnly:value=>locks.push(value),notify(){},changed(){},saveConfig(){}});
  const plugin={id:'late-command',name:'late-command',description:'',config:{},factory:c=>class extends c.BasePlugin {
    process(){captured=c;}
    async call(){await new Promise(resolve=>release=resolve);this.utils.insertText('stale');await this.utils.editCurrentFile(()=>'stale');c.File.editor.insertText('stale');c.File.lock();}
  }};
  try {
    await run.setEnabled(plugin,true); const pending=run.invoke(plugin.id);
    await run.setEnabled(plugin,false); release(); await pending;
    assert.deepEqual(edits,[]); assert.equal(locks.at(-1),false);
    let events=0; captured.document.addEventListener('late-probe',()=>events++);
    document.dispatchEvent(new Event('late-probe')); assert.equal(events,0);
    const timer=captured.setInterval(()=>{},1000); captured.clearInterval(timer); assert.equal(timer,0);
  } finally {await run.destroy();}
});
test("failed plugin cleanup releases effects immediately and cannot unlock its replacement",async()=>{
  const run=runtime(); let release;
  const first={id:'lock-race',name:'lock-race',description:'',config:{version:1},factory:c=>class extends c.BasePlugin {
    process(){c.File.lock();c.document.documentElement.classList.add('old-effect');this.utils.eventHub.on('fail-now',()=>{throw Error('failed')});}
    destroy(){return new Promise(resolve=>release=resolve);}
  }};
  try {
    await run.value.setEnabled(first,true);run.value.event('fail-now');await Promise.resolve();
    assert.equal(document.documentElement.classList.contains('old-effect'),false);
    await run.value.setEnabled({...first,config:{version:2},factory:c=>class extends c.BasePlugin {process(){c.File.lock();}}},true);
    assert.equal(run.locks.at(-1),true);release();await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(run.locks.at(-1),true);assert.equal(run.states[first.id].status,'ready');
  } finally {release?.(); await run.value.destroy();}
});

test("host shutdown invalidates plugin APIs even while initialization is awaiting",async()=>{
  let release, started; const edits=[], locks=[];
  const ready=new Promise(resolve=>started=resolve);
  const run=new PluginRuntime({getMarkdown:()=>'original',getPath:()=>null,getSelection:()=>'',insert:text=>edits.push(text),replace:text=>edits.push(text),setReadOnly:value=>locks.push(value),notify(){},changed(){},saveConfig(){}});
  const enabling=run.setEnabled({id:'shutdown',name:'shutdown',description:'',config:{},factory:c=>class extends c.BasePlugin {
    async init(){c.File.lock();started();await new Promise(resolve=>release=resolve);this.utils.insertText('late');c.File.lock();}
    process(){edits.push('process should not run');}
  }},true);
  await ready;const stopped=run.destroy();assert.equal(locks.at(-1),false);release();await Promise.all([enabling,stopped]);
  assert.deepEqual(edits,[]);assert.equal(locks.at(-1),false);
});
