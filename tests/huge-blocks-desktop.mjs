import {_electron as electron,expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';import os from 'node:os';
const directory=await realpath(await mkdtemp(path.join(os.tmpdir(),'open-typora-huge-'))),profile=path.join(directory,'profile');await mkdir(profile);
const qa=process.env.OPEN_TYPORA_QA_DIR||path.join(directory,'evidence');await mkdir(qa,{recursive:true});
const code='# Giant code\n\n```javascript\n'+('const item = "stable value"; // 0123456789abcdef\n').repeat(740000)+'HUGE-CODE-END\n```\n\n# After code\n';
const rows=80000,table='| Key | A | B | C | D | Value |\n|---|---|---|---|---|---|\n'+Array.from({length:rows},(_,i)=>`| row-${i} | ${i===rows-1?'alpha $E=mc^2$':'alpha **bold**'} | beta 中文 | gamma 0123456789 | delta | ${i===rows-1?'LAST-TABLE-CELL':'stable value '+i} |`).join('\n')+'\n\n# After table\n';
assert.ok(Buffer.byteLength(code)>32*1024*1024);
const codeFile=path.join(directory,'Giant code.md'),tableFile=path.join(directory,'Giant table.md');await writeFile(codeFile,code);await writeFile(tableFile,table);
const digest=text=>createHash('sha256').update(text).digest('hex');
const env={...process.env,OPEN_TYPORA_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.OPEN_TYPORA_DEV_URL;
const mod=process.platform==='darwin'?'Meta':'Control',end=process.platform==='darwin'?'Meta+ArrowDown':'Control+End';
let app,page;const errors=[],timings={},checks=[];
async function launch(){app=await electron.launch({...(process.env.OPEN_TYPORA_EXECUTABLE?{executablePath:process.env.OPEN_TYPORA_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env,timeout:60000});page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1300,height:900});await expect(page.locator('.document-editor:not([hidden]) .rich-document').first()).toBeVisible({timeout:60000});}
async function command(action){await app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('app:command',{action}),action);}
async function open(file){await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await command('open');await expect(page.getByRole('tab',{name:path.basename(file),exact:true})).toHaveAttribute('aria-selected','true',{timeout:60000});}
async function saved(file,text){await command('save');await expect.poll(async()=>digest(await readFile(file)),{timeout:60000}).toBe(digest(text));}
async function pointCell(cell){await cell.click();await cell.evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);range.collapse(false);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});}
async function editCode(){const editable=page.locator('.large-code.fence-editing .cm-content');if(!await editable.count()){const preview=page.locator('.large-code .code-preview .cm-content');await preview.click();}await expect(editable).toBeVisible();await editable.press(end);await editable.press('ArrowUp');await editable.press('End');return editable;}
try{
 await launch();const started=Date.now();await open(codeFile);await expect(page.locator('.large-code .code-preview .cm-content')).toBeVisible({timeout:60000});console.log('PROBE: giant code opened');timings.codeOpenMs=Date.now()-started;
 assert.ok(await page.locator('.large-code .cm-line').count()<160);await expect(page.locator('.document-editor:not([hidden]) .source-surface')).toBeHidden();
 let editable=await editCode();const samples=[];for(let i=0;i<6;i++){const start=Date.now();await page.keyboard.insertText('中');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));samples.push(Date.now()-start);}
 timings.codeTypingSamplesMs=samples;console.log('PROBE: giant code typed',JSON.stringify(samples));await saved(codeFile,code.replace('HUGE-CODE-END','HUGE-CODE-END'+'中'.repeat(6)));
 await editable.press(`${mod}+z`);await saved(codeFile,code);console.log('PROBE: giant code exact undo passed');checks.push('32+ MiB file opens through native dialog, renders a bounded code viewport, types and undoes without changing fence or surrounding bytes.');
 editable=await editCode();const lineStarted=Date.now();await page.keyboard.press('Enter');await page.keyboard.insertText('const extra = `value`;');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));timings.codeNewlineMs=Date.now()-lineStarted;
 await saved(codeFile,code.replace('HUGE-CODE-END','HUGE-CODE-END\nconst extra = `value`;'));await editable.press(`${mod}+z`);await saved(codeFile,code);
 checks.push('A real Enter and backtick-containing code line in the 32+ MiB block undo to the exact original bytes.');
 editable=await editCode();const cdp=await page.context().newCDPSession(page);await cdp.send('Input.imeSetComposition',{text:'zhongguo',selectionStart:8,selectionEnd:8});await cdp.send('Input.insertText',{text:'中国'});await saved(codeFile,code.replace('HUGE-CODE-END','HUGE-CODE-END中国'));await editable.press(`${mod}+z`);await saved(codeFile,code);
 await page.screenshot({path:path.join(qa,'giant-code.png')});checks.push('Giant local code Chromium composition commits Chinese text and undoes once.');
 const at=Date.now();await open(tableFile);const large=page.locator('.md-large-table');await expect(large).toBeVisible({timeout:60000});timings.tableOpenMs=Date.now()-at;console.log('PROBE: giant table opened');
 assert.ok(await large.locator('td[data-unused],tr[data-source-row] td').count()<500);await expect(large.getByText('row-0',{exact:true})).toBeVisible();
 await large.evaluate(element=>element.scrollTop=element.scrollHeight);await expect(large.getByText('LAST-TABLE-CELL',{exact:true})).toBeInViewport({ratio:0.8,timeout:30000});
 await expect(large.locator('tr[data-source-row]').last().locator('.mathjax-node')).toHaveAttribute('data-ready','true',{timeout:30000});await expect(large.locator('tr[data-source-row]').last().locator('.mathjax-node svg').first()).toBeVisible();console.log('PROBE: final table row and formula rendered');const cell=large.getByText('LAST-TABLE-CELL',{exact:true});await pointCell(cell);
 const cellStart=Date.now();await page.keyboard.insertText('中文');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));timings.tableEditMs=Date.now()-cellStart;
 await saved(tableFile,table.replace('LAST-TABLE-CELL','LAST-TABLE-CELL中文'));console.log('PROBE: giant table Unicode saved');await page.keyboard.press(`${mod}+z`);await saved(tableFile,table);
 await pointCell(large.getByText('LAST-TABLE-CELL',{exact:true}));const eraseStarted=Date.now();await page.keyboard.press('Backspace');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));timings.tableBackspaceMs=Date.now()-eraseStarted;
 await saved(tableFile,table.replace('LAST-TABLE-CELL','LAST-TABLE-CEL'));await page.keyboard.press(`${mod}+z`);await saved(tableFile,table);
 await pointCell(large.getByText('LAST-TABLE-CELL',{exact:true}));await cdp.send('Input.imeSetComposition',{text:'zhongguo',selectionStart:8,selectionEnd:8});await cdp.send('Input.insertText',{text:'中国'});await saved(tableFile,table.replace('LAST-TABLE-CELL','LAST-TABLE-CELL中国'));console.log('PROBE: giant table composition saved');await page.keyboard.press(`${mod}+z`);await saved(tableFile,table);
 const appendStarted=Date.now();await large.getByText('LAST-TABLE-CELL',{exact:true}).click();await page.keyboard.press('Tab');
 await expect.poll(()=>page.evaluate(()=>Number(getSelection()?.anchorNode?.parentElement?.closest('tr[data-source-row]')?.dataset.sourceRow)),{timeout:10000}).toBe(rows+2);
 await page.keyboard.insertText('ADDED-ROW');await command('save');
 const appended=table.replace('\n\n# After table', '\n| ADDED-ROW |  |  |  |  |  |\n\n# After table');await saved(tableFile,appended);
 timings.tableAppendMs=Date.now()-appendStarted;assert.ok(timings.tableAppendMs<15000,`Appending a table row took ${timings.tableAppendMs} ms`);console.log('PROBE: giant table row appended',timings.tableAppendMs);
 await page.keyboard.press(`${mod}+z`);await page.keyboard.press(`${mod}+z`);await saved(tableFile,table);await page.screenshot({path:path.join(qa,'giant-table.png')});
 await large.evaluate(element=>element.scrollTop=element.scrollHeight/2);
 await expect.poll(()=>large.evaluate(element=>{const rect=element.getBoundingClientRect();return [...element.querySelectorAll('tbody tr[data-source-row]')].map(row=>({number:Number(row.dataset.sourceRow),rect:row.getBoundingClientRect()})).find(row=>row.number>20000&&row.number<60000&&row.rect.top>rect.top+80&&row.rect.bottom<rect.bottom-40)?.number;}),{timeout:30000}).toBeGreaterThan(20000);
 const sourceRow=await large.evaluate(element=>{const rect=element.getBoundingClientRect();return Number([...element.querySelectorAll('tbody tr[data-source-row]')].find(row=>{const box=row.getBoundingClientRect(),number=Number(row.dataset.sourceRow);return number>20000&&number<60000&&box.top>rect.top+80&&box.bottom<rect.bottom-40;}).dataset.sourceRow);});
 const bodyRow=sourceRow-2,value='stable value '+bodyRow,middleCell=large.locator(`tr[data-source-row="${sourceRow}"] td`).last().locator('.md-line');
 await pointCell(middleCell);await page.keyboard.insertText('👨‍👩‍👧‍👦');await saved(tableFile,table.replace(value+' |',value+'👨‍👩‍👧‍👦 |'));
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowRight');const middleErase=Date.now();await page.keyboard.press('Backspace');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));timings.tableMiddleBackspaceMs=Date.now()-middleErase;await saved(tableFile,table);
 await page.keyboard.press(`${mod}+z`);await saved(tableFile,table.replace(value+' |',value+'👨‍👩‍👧‍👦 |'));await page.keyboard.press(`${mod}+z`);await saved(tableFile,table);
 await pointCell(middleCell);const middleAppend=Date.now();await page.keyboard.press(`${mod}+Enter`);await page.keyboard.insertText('MIDDLE-ROW');
 const originalRow=table.split('\n')[sourceRow],emptyRow='|  |  |  |  |  | MIDDLE-ROW |';await saved(tableFile,table.replace(originalRow+'\n',originalRow+'\n'+emptyRow+'\n'));timings.tableMiddleInsertMs=Date.now()-middleAppend;
 await page.keyboard.press(`${mod}+z`);await page.keyboard.press(`${mod}+z`);await saved(tableFile,table);
 await page.screenshot({path:path.join(qa,'giant-table-middle.png')});
 checks.push('Middle-row emoji Backspace removes one complete grapheme, restores exactly with undo, and a local row insertion undoes without touching other rows.');
 checks.push('80,000-row table mounts bounded cells, reaches its final row, preserves Chinese composition, adds a logical row with Tab and undoes to exact original source.');
 await command('quick-open');const dialog=page.getByRole('dialog',{name:'快速打开',exact:true}),query=dialog.getByRole('combobox',{name:'搜索文档'});await expect(query).toBeFocused();
 await large.evaluate(element=>{element.scrollTop-=360;element.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(150);await expect(query).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();checks.push('A passive giant-table viewport refresh retains quick-open input focus and Escape closes its dialog.');
 await page.getByRole('tab',{name:'Giant code.md',exact:true}).click();editable=await editCode();await page.keyboard.insertText('RECOVER-ME');
 await expect.poll(async()=>{try{return JSON.parse(await readFile(path.join(profile,'session.json'),'utf8')).documents.find(record=>record.path===codeFile)?.content.includes('RECOVER-ME');}catch{return false;}},{timeout:60000,intervals:[500,1000]}).toBe(true);
 await app.close();app=null;await launch();await page.getByRole('tab',{name:'Giant code.md',exact:true}).click();await saved(codeFile,code.replace('HUGE-CODE-END','HUGE-CODE-ENDRECOVER-ME'));
 await command('source');await expect(page.locator('.document-editor:not([hidden]) .source-surface .cm-content')).toBeVisible({timeout:60000});await command('source');await expect(page.locator('.large-code')).toBeVisible({timeout:60000});await saved(codeFile,code.replace('HUGE-CODE-END','HUGE-CODE-ENDRECOVER-ME'));
 checks.push('Dirty 32+ MiB content survives session recovery and source/rendered round trips; saving after restart preserves every expected byte.');
 assert.deepEqual(errors,[]);await expect(page.locator('vite-error-overlay')).toHaveCount(0);
 const result={platform:process.platform,browser:'Browser plugin not available; existing Electron/Playwright workflow',codeBytes:Buffer.byteLength(code),tableBytes:Buffer.byteLength(table),tableRows:rows,timings,checks,errors};
 await writeFile(path.join(qa,'huge-blocks-results.json'),JSON.stringify(result,null,2));console.log(checks.map(check=>'PASS: '+check).join('\n'));console.log(JSON.stringify(timings));
}catch(error){try{console.log('DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({rows:[...document.querySelectorAll('.md-large-table tr[data-source-row]')].slice(-2).map(row=>({row:row.dataset.sourceRow,text:row.textContent,html:row.innerHTML.slice(0,1500)})),math:[...document.querySelectorAll('.md-large-table .mathjax-node')].map(el=>({html:el.innerHTML.slice(0,220),ready:el.dataset.ready,svgs:el.querySelectorAll('svg').length,rect:el.getBoundingClientRect().toJSON()}))}))));}catch{}await page?.screenshot({path:path.join(qa,'huge-blocks-failure.png')}).catch(()=>{});throw error;}finally{await app?.close();}
