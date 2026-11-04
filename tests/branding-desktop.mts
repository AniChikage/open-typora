import { _electron as electron, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DocumentStore } from '../build/runtime/electron/store.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'markdown-lane-upgrade-'));
const profile=path.join(root,'profile'), file=path.join(root,'文档.md');
await mkdir(profile); await writeFile(file,'磁盘原文');
const env: Record<string,string>={...process.env,OPEN_TYPORA_DATA_DIR:profile};
delete env.OPEN_MARKDOWN_LANE_DATA_DIR; delete env.ELECTRON_RUN_AS_NODE;
let app: import('playwright').ElectronApplication | undefined;
const errors: string[]=[];
const launch=async()=>{
 app=await electron.launch({args:[process.cwd()],env,timeout:30000});
 const page=await app.firstWindow(); page.on('pageerror',e=>errors.push(e.message));
 await expect(page.locator('.rich-document').first()).toBeVisible({timeout:20000});return page;
};
try {
 let page=await launch();
 await page.evaluate(()=>{
   localStorage.clear();
   localStorage.setItem('open-typora-preferences',JSON.stringify({language:'en',fontSize:20}));
   localStorage.setItem('open-typora-theme','dark');
   localStorage.setItem('open-typora-autosave','false');
   localStorage.setItem('open-typora-count-unit','words');
   localStorage.setItem('open-typora-plugins-v1','{"dark":true}');
 });
 await app!.close(); app=undefined;
 const store=new DocumentStore(profile), record=await store.open(file);
 await store.persist({documents:[{...record,content:'未保存的草稿：你好，中国'}],activeId:record.id});
 page=await launch();
 await expect(page.locator('.rich-document').first()).toContainText('未保存的草稿：你好，中国');
 assert.match(await page.title(),/Open Markdown Lane/);
 assert.equal(await app!.evaluate(({app})=>app.getPath('userData')),profile);
 await expect.poll(()=>page.locator('html').getAttribute('lang')).toBe('en');
 const saved=await page.evaluate(()=>Object.fromEntries(['preferences','theme','autosave','plugins-v1'].map(key=>[key,localStorage.getItem('open-markdown-lane-'+key)])));
 assert.equal(saved.theme,'dark'); assert.equal(saved.autosave,'false');
 assert.equal(JSON.parse(saved.preferences!).fontSize,20); assert.equal(JSON.parse(saved['plugins-v1']!).dark,true);
 assert.equal(await readFile(file,'utf8'),'磁盘原文');
 const qa=process.env.OPEN_MARKDOWN_LANE_QA_DIR || root;await mkdir(qa,{recursive:true});
 await page.screenshot({path:path.join(qa,'upgrade-restored.png')});
 assert.deepEqual(errors,[]);
 console.log('PASS: old environment override, English preferences, theme, autosave, plugin preferences and dirty session survive the rename; disk bytes unchanged; new window title; no runtime errors');
} finally {await app?.close();}
