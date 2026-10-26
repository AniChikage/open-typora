import { _electron as electron, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { installPlugin } from "../electron/plugins.mjs";

const data=await mkdtemp(path.join(os.tmpdir(),"open-typora-ime-"));
const qa=process.env.OPEN_TYPORA_QA_DIR || path.join(data,"evidence"); await mkdir(qa,{recursive:true});
const file=path.join(data,"中文输入验收.md"), profile=path.join(data,"profile"); await mkdir(profile);
const original='# IME acceptance\n\n输入区：end\n\n- 列表：end\n\n| A | B |\n| --- | --- |\n| 单元格：end | value |\n\n```text\n代码：end\n```\n';
await writeFile(file,original);
const pluginFile=path.join(data,"IME-probe.js");
await writeFile(pluginFile,`class Probe extends BasePlugin {
  process() {
    window.imeProbe={loads:0,edits:0,attempts:0};
    this.utils.eventHub.on('fileContentLoaded',()=>window.imeProbe.loads++);
    this.utils.eventHub.on('fileEdited',()=>window.imeProbe.edits++);
    this.utils.entities.eWrite.addEventListener('compositionstart',()=>setTimeout(()=>{
      window.imeProbe.attempts++;
      this.utils.insertText('UNWANTED'); this.utils.editCurrentFile(text=>'UNWANTED'+text);
    },10));
  }
} module.exports={plugin:Probe};`);
await installPlugin(pluginFile,profile);
const env={...process.env,OPEN_TYPORA_DATA_DIR:profile}; delete env.ELECTRON_RUN_AS_NODE; delete env.OPEN_TYPORA_DEV_URL;
let app,page; const checks=[],errors=[];
try {
  app=await electron.launch({...(process.env.OPEN_TYPORA_EXECUTABLE?{executablePath:process.env.OPEN_TYPORA_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env,timeout:30000});
  page=await app.firstWindow(); page.on('pageerror',e=>errors.push(e.message));
  console.log('IME: launched');
  await expect(page.getByRole('button',{name:'欢迎.md',exact:true})).toBeVisible({timeout:20000});
  await page.getByRole('button',{name:'更多操作',exact:true}).click(); await page.getByRole('menuitem',{name:'插件管理…',exact:true}).click();
  await page.getByRole('checkbox',{name:'启用IME-probe',exact:true}).check();
  await expect.poll(()=>page.evaluate(()=>!!window.imeProbe)).toBe(true);
  await page.getByRole('dialog',{name:'插件管理',exact:true}).getByRole('button',{name:'完成',exact:true}).click();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  await page.getByRole('button',{name:'更多操作',exact:true}).click(); await page.getByRole('menuitem',{name:'打开文件',exact:true}).click();
  const surface=page.locator('.document-editor:not([hidden])'), root=surface.locator('.rich-document');
  await expect(root.getByRole('heading',{name:'IME acceptance',exact:true})).toBeVisible();
  console.log('IME: fixture and installed probe loaded');
  const cdp=await page.context().newCDPSession(page);
  await page.evaluate(()=>{window.imeEvents=[]; for(const type of ['compositionstart','compositionend','beforeinput','input']) document.addEventListener(type,event=>window.imeEvents.push({type,data:event.data,inputType:event.inputType,source:!!event.target.closest('.source-surface')}),true);});
  const mod=process.platform==='darwin'?'Meta':'Control';
  const saved=text=>expect.poll(()=>readFile(file,'utf8')).toBe(text);
  const point=async label=>root.evaluate((root,label)=>{const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while(node=walk.nextNode()){if(!node.parentElement.closest('.md-meta,.md-view,.md-ui')&&node.data.includes(label)){root.focus();getSelection().collapse(node,node.data.indexOf(label)+label.length);document.dispatchEvent(new Event('selectionchange'));return;}}throw Error('Missing '+label);},label);
  const mark=async text=>cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});
  for (const label of ['输入区：','列表：','单元格：']) {
    console.log('IME: checking '+label);
    await point(label); await mark('ni'); await mark('nihao');
    await page.waitForTimeout(100); assert.equal(await readFile(file,'utf8'),original);
    await expect(root).not.toContainText('UNWANTED');
    await cdp.send('Input.insertText',{text:'你好，中国'});
    const edited=original.replace(label,label+'你好，中国'); await saved(edited);
    await page.keyboard.press(`${mod}+z`); await saved(original); await page.keyboard.press(`${mod}+Shift+z`); await saved(edited); await page.keyboard.press(`${mod}+z`); await saved(original);
    checks.push(label+' browser IME composition, candidate replacement, commit, single undo/redo and plugin-write protection');
  }
  const beforeCancel=await page.evaluate(()=>window.imeProbe.attempts);
  await point('输入区：'); await mark('quxiao');
  // Let the delayed write run while composition is active. Cancelling first
  // would legitimately allow it to mutate the following test's document.
  await expect.poll(()=>page.evaluate(()=>window.imeProbe.attempts)).toBeGreaterThan(beforeCancel);
  await expect(root).not.toContainText('UNWANTED'); assert.equal(await readFile(file,'utf8'),original);
  await mark(''); await saved(original);
  checks.push('Cancelling marked text leaves the document unchanged');
  await root.locator('.fence-body').click();
  const code=root.locator('.fence-editing .cm-content'); await expect(code).toBeVisible();
  await code.press(mod==='Meta'?'Meta+ArrowLeft':'Home'); await code.press('ArrowRight'); await code.press('ArrowRight'); await code.press('ArrowRight');
  const beforeCode=await page.evaluate(()=>window.imeProbe.attempts);
  await mark('zhong'); await mark('zhongwen');
  await expect.poll(()=>page.evaluate(()=>window.imeProbe.attempts)).toBeGreaterThan(beforeCode);
  await expect(root).not.toContainText('UNWANTED'); assert.equal(await readFile(file,'utf8'),original);
  await cdp.send('Input.insertText',{text:'中文'});
  await saved(original.replace('代码：end','代码：中文end')); await page.keyboard.press(`${mod}+z`); await saved(original);
  checks.push('Local CodeMirror composition updates form one undo transaction');
  await root.getByRole('heading',{name:'IME acceptance',exact:true}).click(); await page.getByRole('button',{name:'源码',exact:true}).click();
  const source=surface.locator('.source-surface .cm-content'); await expect(source).toBeVisible();
  await source.press(mod==='Meta'?'Meta+ArrowUp':'Control+Home'); await source.press(mod==='Meta'?'Meta+ArrowRight':'End');
  await mark('zhong'); await mark('zhongwen'); await page.waitForTimeout(50);
  const editsBeforeCommit=await page.evaluate(()=>window.imeProbe.edits);
  await mark('zhongwenzi'); await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>window.imeProbe.edits),editsBeforeCommit,'Plugins must not observe provisional source edits');
  await page.getByRole('button',{name:'即时渲染',exact:true}).evaluate(button=>button.click());
  await expect(source).toBeVisible();
  await page.waitForTimeout(60);
  assert.equal(await source.evaluate(element=>element.contains(getSelection()?.anchorNode)),true,'Hidden documents must not steal the active composition selection');
  await cdp.send('Input.insertText',{text:'中文'});
  await expect(root).toBeVisible(); await saved(original.replace('# IME acceptance','# IME acceptance中文'));
  await page.keyboard.press(`${mod}+z`); await saved(original);
  checks.push('Source composition delays mode switching until commit and preserves one source-session undo');
  await page.getByRole('button',{name:'源码',exact:true}).click();
  await expect(source).toBeVisible(); await expect(source).toBeFocused();
  await source.press(mod==='Meta'?'Meta+ArrowUp':'Control+Home');
  await page.waitForTimeout(60);
  assert.equal(await source.evaluate(element=>element.contains(getSelection()?.anchorNode)),true,'An older mode transition must not steal the new source selection');
  await page.keyboard.insertText('redo'); await saved('redo'+original); await page.keyboard.press(`${mod}+z`); await saved(original);
  await mark('quxiao'); await mark(''); await page.waitForTimeout(50); await saved(original);
  await page.keyboard.press(`${mod}+Shift+z`); await saved('redo'+original); await page.keyboard.press(`${mod}+z`); await saved(original);
  checks.push('Cancelling source composition preserves the existing redo stack');
  await expect.poll(()=>page.evaluate(()=>window.imeProbe.edits)).toBeGreaterThan(0);
  assert.equal(await page.evaluate(()=>window.imeProbe.loads),1);
  await page.getByRole('button',{name:'即时渲染',exact:true}).click();
  const repeatFile=path.join(data,'重复中文选区.md'),prefix='# Replacement\n\n',repeatSource=prefix+'同\n\n同\n';await writeFile(repeatFile,repeatSource);
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},repeatFile);
  await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'打开文件',exact:true}).click();
  await expect(root.getByRole('heading',{name:'Replacement',exact:true})).toBeVisible();
  for(const candidate of ['同','同同','中文😀']) {
    await root.evaluate(root=>{const nodes=root.querySelectorAll(':scope > p');root.focus();getSelection().setBaseAndExtent(nodes[0].firstChild,0,nodes[1].firstChild,1);document.dispatchEvent(new Event('selectionchange'));});
    await mark('tong');await page.waitForTimeout(100);assert.equal(await readFile(repeatFile,'utf8'),repeatSource);
    await cdp.send('Input.insertText',{text:candidate});await expect.poll(()=>readFile(repeatFile,'utf8')).toBe(prefix+candidate+'\n');
    await page.keyboard.press(`${mod}+z`);await expect.poll(()=>readFile(repeatFile,'utf8')).toBe(repeatSource);
  }
  checks.push('Repeated Chinese and emoji replace the selected paragraphs, preserve the surrounding Markdown and undo once');
  assert.deepEqual(errors,[]); assert.equal(await page.locator('vite-error-overlay').count(),0);
  await page.screenshot({path:path.join(qa,'ime-and-plugins.png')});
  await writeFile(path.join(qa,'ime-results.json'),JSON.stringify({platform:process.platform,checks,errors,mechanism:'Chromium Input.imeSetComposition and Input.insertText; not physical IME candidate acceptance'},null,2));
  for(const check of checks) console.log('PASS: '+check);
} catch(error) { console.error(await page?.evaluate(()=>({events:window.imeEvents?.slice(-18),text:document.querySelector('.document-editor:not([hidden]) .source-surface')?.textContent,selection:getSelection()?.toString(),alerts:[...document.querySelectorAll('[role="alert"]')].map(x=>x.textContent)})).catch(()=>null)); await page?.screenshot({path:path.join(qa,'ime-failure.png')}).catch(()=>{});throw error; }
finally {if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
