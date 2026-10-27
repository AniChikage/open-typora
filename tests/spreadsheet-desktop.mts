import { _electron as electron, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
const directory=await realpath(await mkdtemp(path.join(os.tmpdir(),'open-typora-spreadsheet-'))),profile=path.join(directory,'profile');await mkdir(profile);
const qa=process.env.OPEN_TYPORA_QA_DIR||path.join(directory,'evidence');await mkdir(qa,{recursive:true});
const original=['# Spreadsheet QA\n\nBefore after\n','# Source QA\n','```text\nCODE\n```\n','| A | B |\n| --- | --- |\n| x | y |\n'];
original.push('| Key | Value |\n| --- | --- |\n'+Array.from({length:12000},(_,i)=>`| row-${i} | value-${i} |`).join('\n')+'\n');
original.push('# Delayed clipboard QA\n');
const names=['Rich.md','Source.md','Code.md','Grid.md','Big-grid.md','Delayed.md'];
const records=original.map((content,index)=>({id:'sheet-'+index,name:names[index],path:path.join(directory,names[index]),content,savedContent:content,diskHash:createHash('sha256').update(content).digest('hex'),lineEnding:'\n' as const,encoding:'utf-8',bom:false}));
for(const record of records)await writeFile(record.path,record.content);
await writeFile(path.join(profile,'session.json'),JSON.stringify({version:1,documents:records,activeId:records[0].id}));
const plain='项目\t数量\t备注\n苹果\t2\t含|分隔符\n香蕉\t\t第一行';
const html='<html><head><meta name="ProgId" content="Excel.Sheet"></head><body><table><tr><td>项目</td><td>数量</td><td>备注</td></tr><tr><td>苹果</td><td>2</td><td>含|分隔符</td></tr><tr><td>香蕉</td><td></td><td>第一行</td></tr></table></body></html>';
const markdown='| 项目 | 数量 | 备注 |\n| --- | --- | --- |\n| 苹果 | 2 | 含\\|分隔符 |\n| 香蕉 |  | 第一行 |';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=';
const env: Record<string,string>={...process.env,OPEN_TYPORA_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.OPEN_TYPORA_DEV_URL;
let app: import('playwright').ElectronApplication|undefined,page: import('playwright').Page|undefined;
const checks:string[]=[],errors:string[]=[];const pushCheck=checks.push.bind(checks);checks.push=(...items:string[])=>{for(const item of items)console.log('PASS '+item);return pushCheck(...items);};let clipboardSaved=false;const mod=process.platform==='darwin'?'Meta':'Control';
const pane=(index:number)=>page!.locator(`.document-editor[data-document-id="sheet-${index}"]`);
async function command(action:string){await app!.evaluate(({BrowserWindow},action:string)=>BrowserWindow.getAllWindows()[0].webContents.send('app:command',{action}),action);}
async function save(index:number,text:string){await command('save');await expect.poll(()=>readFile(records[index].path,'utf8')).toBe(text);await expect.poll(async()=>{const value=JSON.parse(await readFile(path.join(profile,'session.json'),'utf8'));const record=value.documents.find((x:{id:string})=>x.id===records[index].id);return {content:record.content,saved:record.savedContent};}).toEqual({content:text,saved:text});}
async function point(index:number,text:string,offset:number){await pane(index).locator('.rich-document').evaluate((root:HTMLElement,{text,offset})=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))if(!node.parentElement!.closest('.md-meta,.md-view')&&(node as Text).data.includes(text)){root.focus();const at=(node as Text).data.indexOf(text)+offset;getSelection()!.setBaseAndExtent(node,at,node,at);document.dispatchEvent(new Event('selectionchange'));return;}throw Error('Missing clipboard target');},{text,offset});}
async function putClipboard(plain:string,html='',image=false){await app!.evaluate(async({clipboard,ClipboardItem},{plain,html,image,png})=>{const formats:Record<string,string|Blob>={};if(plain||!image)formats['text/plain']=plain;if(html)formats['text/html']=html;if(image)formats['image/png']=new Blob([Buffer.from(png,'base64')],{type:'image/png'});await clipboard.write([new ClipboardItem(formats)]);globalThis.__sheetClipboardOwnership={plain,html,image,png};},{plain,html,image,png});}
async function paste(){if(process.platform==='darwin'){await app!.evaluate(({app,BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.show();app.focus({steal:true});window.focus();window.webContents.focus();});await expect.poll(()=>app!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.isFocused())).toBe(true);}await app!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.paste());}
try{
 app=await electron.launch({...(process.env.OPEN_TYPORA_EXECUTABLE?{executablePath:process.env.OPEN_TYPORA_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env,timeout:30000});page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>{const events:unknown[]=[];document.addEventListener('paste',event=>{events.push({trusted:event.isTrusted,types:[...(event.clipboardData?.types||[])],files:event.clipboardData?.files.length||0,plainLength:event.clipboardData?.getData('text/plain').length||0,htmlLength:event.clipboardData?.getData('text/html').length||0});document.documentElement.dataset.clipboardQa=JSON.stringify(events);},true);});
 await app.evaluate(async({clipboard})=>{globalThis.__sheetClipboard=await clipboard.read();});clipboardSaved=true;
 await expect(page.getByRole('tab',{name:names[0],exact:true})).toBeVisible({timeout:20000});
 await putClipboard(plain,html,true);await point(0,'Before after',7);await paste();
 await expect(pane(0).locator('table')).toHaveCount(1);await expect(pane(0).locator('img')).toHaveCount(0);await expect(pane(0).locator('tbody tr')).toHaveCount(2);
 const pasted=original[0].replace('Before after','Before \n\n'+markdown+'\n\nafter');await save(0,pasted);
 await command('undo');await save(0,original[0]);await command('redo');await save(0,pasted);
 checks.push('Native clipboard HTML+PNG becomes an editable GFM table between intact paragraphs; save/recovery bytes and single undo/redo match.');
 if(process.env.OPEN_TYPORA_TEST_HIDDEN!=='1')await page.screenshot({path:path.join(qa,'spreadsheet-rich.png')});
 await page.getByRole('tab',{name:names[1],exact:true}).click();await command('source');const source=pane(1).locator('.source-surface .cm-content');await expect(source).toBeVisible();await source.click();await page.keyboard.press(`${mod}+a`);await paste();await save(1,markdown);
 await command('undo');await save(1,original[1]);await command('redo');await save(1,markdown);
 await source.click();await page.keyboard.press(`${mod}+a`);await command('paste-plain');await save(1,plain);
 checks.push('Source-mode normal paste converts the range; plain-text paste retains literal TSV; each paste is one undo transaction.');
 await app.evaluate(({ipcMain},{plain,html})=>{ipcMain.removeHandler('document:readClipboardFormats');ipcMain.handle('document:readClipboardFormats',()=>({ok:true,value:{text:plain,html}}));},{plain,html});
 await putClipboard('','',true);await source.click();await page.keyboard.press(`${mod}+a`);await paste();await save(1,markdown);await command('undo');await save(1,plain);
 checks.push('A trusted source paste that exposes only PNG recovers the original HTML table through the native clipboard bridge and undoes once.');
 await page.getByRole('tab',{name:names[5],exact:true}).click();await command('source');const delayedSource=pane(5).locator('.source-surface .cm-content');await expect(delayedSource).toBeVisible();await putClipboard('','',true);
 await app.evaluate(({ipcMain},{plain,html})=>{ipcMain.removeHandler('document:readClipboardFormats');ipcMain.handle('document:readClipboardFormats',()=>new Promise(resolve=>{globalThis.__sheetReleaseClipboard=()=>{resolve({ok:true,value:{text:plain,html}});globalThis.__sheetReleaseClipboard=undefined;};}));},{plain,html});
 await delayedSource.click();await page.keyboard.press(`${mod}+a`);await paste();await expect.poll(()=>app!.evaluate(()=>!!globalThis.__sheetReleaseClipboard)).toBe(true);
 await page.keyboard.insertText('Typed while clipboard was pending');await save(5,'Typed while clipboard was pending');await app.evaluate(()=>globalThis.__sheetReleaseClipboard?.());await expect(page.locator('.toast')).toContainText('粘贴期间文档或选区已变化');await save(5,'Typed while clipboard was pending');
 checks.push('A delayed native clipboard response cannot overwrite text or a selection changed after the paste.');
 await app.evaluate(({ipcMain},{plain,html})=>{ipcMain.removeHandler('document:readClipboardFormats');ipcMain.handle('document:readClipboardFormats',()=>({ok:true,value:{text:plain,html}}));},{plain,html});await putClipboard('','',true);

 await page.getByRole('tab',{name:names[2],exact:true}).click();await command('source');const code=pane(2).locator('.source-surface .cm-content');await expect(code).toBeVisible();await code.click();await page.keyboard.press(`${mod}+a`);await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowDown');await paste();await save(2,'```text\n'+plain+'CODE\n```\n');await command('undo');await save(2,original[2]);
 checks.push('Pasting a spreadsheet into a source code fence keeps its literal TSV and never inserts the image alternative or a table.');
 await page.getByRole('tab',{name:names[3],exact:true}).click();await command('source');await command('source');await putClipboard('"第一行\n第二行"\t"A\tB"\n"说""好"""\t尾\n');await point(3,'x',0);await paste();await expect(pane(3).locator('tbody tr')).toHaveCount(2);
 await save(3,'| A | B |\n| --- | --- |\n| 第一行<br>第二行 | A\tB |\n| 说"好" | 尾 |\n');await command('undo');await save(3,original[3]);
 checks.push('Quoted TSV fills/expands an existing rich table without shifting embedded tabs/newlines; one undo restores the exact table.');
 await page.getByRole('tab',{name:names[4],exact:true}).click();
 await app.evaluate(({BrowserWindow},record)=>BrowserWindow.getAllWindows()[0].webContents.send('app:command',{action:'opened',document:record,line:10003}),records[4]);
 await expect(pane(4).locator('tr[data-source-row="10002"]')).toBeVisible();await point(4,'row-10000',0);await putClipboard('远处\t替换\n下一行\t保留');await paste();
 await save(4,original[4].replace('| row-10000 | value-10000 |\n| row-10001 | value-10001 |','| 远处 | 替换 |\n| 下一行 | 保留 |'));await command('undo');await save(4,original[4]);
 checks.push('Pasting at row 10000 in a virtualized 12000-row table changes only the correct source rectangle and undoes exactly.');
 assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0);
 await writeFile(path.join(qa,'spreadsheet-results.json'),JSON.stringify({platform:process.platform,environment:'Browser plugin not available; existing Electron/Playwright desktop workflow',viewport:{width:1280,height:900},checks,errors,profile},null,2));console.log(checks.map(x=>'PASS '+x).join('\n'));
}catch(error){const metadata=await page?.locator('html').getAttribute('data-clipboard-qa').catch(()=>null);await writeFile(path.join(qa,'clipboard-events.json'),metadata||'[]');console.error('Clipboard event metadata: '+metadata);if(process.env.OPEN_TYPORA_TEST_HIDDEN!=='1')await page?.screenshot({path:path.join(qa,'spreadsheet-failure.png')}).catch(()=>{});throw error;}
finally{if(app){if(clipboardSaved)await app.evaluate(async({clipboard})=>{const owned=globalThis.__sheetClipboardOwnership,item=(await clipboard.read())[0],text=await clipboard.readText(),html=item?.types.includes('text/html')?await(await item.getType('text/html')).text():'',image=!!item?.types.includes('image/png');let unchanged=!!owned&&text===owned.plain&&html===owned.html&&image===owned.image;if(unchanged&&image){const blob=await item.getType('image/png');unchanged=blob.size===Buffer.from(owned!.png,'base64').length&&Buffer.from(await blob.arrayBuffer()).toString('base64')===owned!.png;}if(unchanged){if(globalThis.__sheetClipboard?.length)await clipboard.write(globalThis.__sheetClipboard);else clipboard.clear();}}).catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
