import {_electron as electron, expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const directory=await mkdtemp(path.join(os.tmpdir(),'open-typora-community-'));
const profile=path.join(directory,'profile'); await mkdir(profile);
const qa=process.env.OPEN_TYPORA_QA_DIR||path.join(directory,'evidence'); await mkdir(qa,{recursive:true});
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=';
const markdown='# Community plugins\n\nFirst paragraph **bold 中文** and *emphasis*.\n\nSecond paragraph stays intact.\n\n- first item\n- second item\n\n- [ ] preserve task\n\n![pixel]('+image+')\n\n| A | B |\n| --- | --- |\n| cell 中文 | stable |\n\n```text\ncode 中文\n```\n';
const documents=await Promise.all(['A.md','B.md'].map(async(name: string,i)=>{const file=path.join(directory,name);await writeFile(file,markdown);return {id:'community-'+i,name,path:file,content:markdown,savedContent:markdown,lineEnding:'\n',encoding:'utf-8',bom:false};}));
await writeFile(path.join(profile,'session.json'),JSON.stringify({version:1,documents,activeId:documents[0].id}));
const env: Record<string, string>={...process.env,OPEN_TYPORA_DATA_DIR:profile}; delete env.ELECTRON_RUN_AS_NODE;delete env.OPEN_TYPORA_DEV_URL;
const names=['列表折叠','只读模式','无图阅读','段落聚焦','常显语法标记','反色夜间模式'];
let app!: import("playwright").ElectronApplication, page!: import("playwright").Page;const errors: string[]=[],checks: string[]=[];
const pane=()=>page.locator('.document-editor[data-active="true"]');
const root=()=>pane().locator('.rich-document');
const card=(name: string)=>page.locator('.plugin-card').filter({has:page.getByRole('heading',{name,exact:true})});
async function command(action: string){await app.evaluate(({BrowserWindow},action: string)=>BrowserWindow.getAllWindows()[0].webContents.send('app:command',{action}),action);}
async function manager(){const dialog=page.getByRole('dialog',{name:'插件管理',exact:true});if(!await dialog.isVisible())await command('plugins');await expect(dialog).toBeVisible();return dialog;}
async function closeManager(){await (await manager()).getByRole('button',{name:'完成',exact:true}).click();}
async function enable(name: string,value=true){await manager();const box=card(name).getByRole('checkbox',{name:'启用'+name,exact:true});await expect(box).toBeEnabled();await box.setChecked(value);await expect(card(name).locator('.plugin-toggle')).toContainText(value?'已启用':'未启用');await expect(card(name)).not.toContainText('加载失败');}
async function unchanged(){for(const document of documents)assert.equal(await readFile(document.path,'utf8'),markdown);}
async function stop(){if(app){await app.evaluate(({BrowserWindow,app})=>{for(const window of BrowserWindow.getAllWindows())window.webContents.session.flushStorageData();app.exit(0);}).catch(()=>{});await app.close().catch(()=>{});app=null!;}}
async function launch(){app=await electron.launch({...(process.env.OPEN_TYPORA_EXECUTABLE?{executablePath:process.env.OPEN_TYPORA_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env,timeout:60000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1300,height:900});await page.emulateMedia({colorScheme:'light'});await expect(page.getByRole('tab',{name:'A.md',exact:true})).toBeVisible({timeout:20000});}
async function fold(){const list=root().locator(':scope > ul').first();await expect(root()).toHaveAttribute('id','write');const box=await list.boundingBox();assert.ok(box);console.log('FOLD-TARGET',await pane().getAttribute('data-document-id'));await page.mouse.click(box.x-11,box.y+4);await expect(list).toHaveClass(/plugin-collapsed-list/);await expect(list.locator(':scope > li').nth(1)).toBeHidden();}
try{
 await launch();assert.match(await page.title(),/A\.md — Open Typora/);await expect(root().getByRole('heading',{name:'Community plugins',exact:true})).toBeVisible();
 await enable('列表折叠');await closeManager();await fold();
 await page.getByRole('tab',{name:'B.md',exact:true}).click();await expect(pane()).toHaveAttribute('data-document-id','community-1');await fold();
 await command('split-right');await expect(page.locator('.document-editor:not([hidden])')).toHaveCount(2);
 const other=page.locator('.document-editor[data-document-id="community-0"]');await other.locator('.rich-document > p').first().click();await expect(other).toHaveAttribute('data-active','true');
 const list=other.locator('.rich-document > ul').first();await expect(other.locator('.rich-document')).toHaveAttribute('id','write');const bounds=await list.boundingBox();await page.mouse.click(bounds!.x-11,bounds!.y+4);await expect(list).not.toHaveClass(/plugin-collapsed-list/);
 await enable('列表折叠',false);await closeManager();await expect(root().locator(':scope > ul > li').nth(1)).toBeVisible();await command('close-pane');await unchanged();
 checks.push('Pinned upstream list-folding works after tab and split-pane switches; disabling restores visibility without changing either file.');

 await enable('无图阅读');await closeManager();await page.mouse.move(10,10);
 const inlineImage=root().locator('.md-image').first();await expect.poll(()=>inlineImage.evaluate(el=>getComputedStyle(el).opacity)).toBe('0');await inlineImage.hover();await expect.poll(()=>inlineImage.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
 await manager();await card('无图阅读').getByRole('button',{name:'切换效果',exact:true}).click();await closeManager();await page.mouse.move(10,10);await expect.poll(()=>inlineImage.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');await enable('无图阅读',false);
 checks.push('No-image mode actually hides images, hover reveals them and toggle/disable restores their visibility.');

 await enable('段落聚焦');await closeManager();await root().getByRole('heading',{name:'Community plugins',exact:true}).click();await page.mouse.move(10,10);
 const paragraph=root().locator(':scope > p').first();await expect.poll(()=>paragraph.evaluate(el=>getComputedStyle(el).filter)).toBe('blur(3px)');await paragraph.hover();await expect.poll(()=>paragraph.evaluate(el=>getComputedStyle(el).filter)).toBe('none');await enable('段落聚焦',false);
 await enable('常显语法标记');await closeManager();await root().getByRole('heading',{name:'Community plugins',exact:true}).click();const marker=root().locator('[md-inline="strong"] .md-meta').first();await expect(marker).toBeVisible();await expect.poll(()=>marker.evaluate(el=>getComputedStyle(el).display)).toBe('inline');await enable('常显语法标记',false);
 await enable('反色夜间模式');await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).filter)).toContain('invert');await card('反色夜间模式').getByRole('button',{name:'切换效果',exact:true}).click();await expect.poll(()=>page.evaluate(()=>document.documentElement.classList.contains('plugin-dark'))).toBe(false);await card('反色夜间模式').getByRole('button',{name:'切换效果',exact:true}).click();await enable('反色夜间模式',false);
 checks.push('Paragraph focus, static Markdown markers and dark inversion produce real computed styles and unload cleanly.');

 await enable('只读模式');await closeManager();await expect(root()).toHaveAttribute('contenteditable','false');await expect(root().getByRole('checkbox')).toBeDisabled();
 await command('source');await expect(pane().locator('.source-surface .cm-content')).toHaveAttribute('contenteditable','false');await pane().locator('.source-surface .cm-content').click();await page.keyboard.insertText('MUST-NOT-INSERT');await command('save');await unchanged();await command('source');
 await enable('只读模式',false);await closeManager();await expect(root()).toHaveAttribute('contenteditable','true');await expect(root().getByRole('checkbox')).toBeEnabled();
 checks.push('Read-only mode protects rendered/source text and task checkboxes; disabling releases the lock.');

 for(const name of names)await enable(name);await page.screenshot({path:path.join(qa,'community-plugins-enabled.png')});await closeManager();await unchanged();await stop();await launch();
 await manager();for(const name of names)await expect(card(name).getByRole('checkbox',{name:'启用'+name,exact:true})).toBeChecked();await expect(root()).toHaveAttribute('contenteditable','false');
 for(const name of names)await enable(name,false);await closeManager();await expect(page.locator('style[data-plugin]')).toHaveCount(0);await expect(root()).toHaveAttribute('contenteditable','true');assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('plugin-dark')),false);await unchanged();
 checks.push('All six community plugins coexist, persist enabled/config state across restart, and disabling releases styles, lock and root effects.');
 assert.deepEqual(errors,[]);await expect(page.locator('vite-error-overlay')).toHaveCount(0);await page.screenshot({path:path.join(qa,'community-plugins-clean.png')});
 await writeFile(path.join(qa,'community-plugins-results.json'),JSON.stringify({platform:process.platform,profile,upstreamRevision:'4a856129a9dbefaa963bfba4aacd3e5484bde60a',plugins:names,checks,errors,browser:'Browser plugin not available; existing Electron/Playwright workflow'},null,2));for(const check of checks)console.log('PASS: '+check);
}catch(error){console.error('COMMUNITY-PLUGIN-FAILURE',JSON.stringify({checks,errors,message:String(error)}));await page?.screenshot({path:path.join(qa,'community-plugins-failure.png')}).catch(()=>{});throw error;}
finally{await stop();}
