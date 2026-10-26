import {_electron as electron,expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,realpath,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const directory=await realpath(await mkdtemp(path.join(os.tmpdir(),'open-typora-menus-'))),profile=path.join(directory,'profile');
const qa=process.env.OPEN_TYPORA_QA_DIR||path.join(directory,'evidence');await mkdir(profile);await mkdir(qa,{recursive:true});
const alpha='# Alpha\n\nFirst paragraph: alpha 中国.\n\nSecond paragraph: beta.\n';
const table='# Table\n\n| Key | Value |\n| --- | --- |\n| row-one | A |\n| row-two | B |\n\nAfter table.\n';
const big='| Key | Value |\n|---|---|\n'+Array.from({length:12000},(_,i)=>`| row-${i} | stable 中文 value ${i} ${'x'.repeat(30)} |`).join('\n')+'\n\n# End\n';
const texts=[alpha,table,big,'# Other\n\nKeep this file.\n'];
const names=['Alpha 中国.md','Table.md','Big table.md','Other.md'];
const records=[];
for(let i=0;i<names.length;i++){const file=path.join(directory,names[i]);await writeFile(file,texts[i]);records.push({id:'menus-'+i,path:file,name:names[i],content:texts[i],savedContent:texts[i],diskHash:createHash('sha256').update(texts[i]).digest('hex'),lineEnding:'\n',encoding:'utf-8',bom:false});}
await writeFile(path.join(profile,'session.json'),JSON.stringify({version:1,documents:records,activeId:records[0].id}));
const env={...process.env,OPEN_TYPORA_DATA_DIR:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.OPEN_TYPORA_DEV_URL;
const mod=process.platform==='darwin'?'Meta':'Control';
let app,page;const errors=[],checks=[];
const pane=id=>page.locator(`.document-editor[data-document-id="${id}"]`);
const tab=name=>page.getByRole('tab',{name,exact:true});
const menu=label=>page.getByRole('menu',{name:label,exact:true});
const item=(scope,label)=>scope.getByRole('menuitem',{name:label,exact:true});
async function command(action){await app.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('app:command',{action}),action);}
async function saved(file,text){await command('save');await expect.poll(()=>readFile(file,'utf8'),{timeout:20000}).toBe(text);}
async function tabMenu(name){await tab(name).click({button:'right'});await expect(menu('标签页菜单')).toBeVisible();return menu('标签页菜单');}
async function chooseTab(name,label){await item(await tabMenu(name),label).click();await expect(menu('标签页菜单')).toHaveCount(0);}
async function editorMenu(target,kind='正文编辑菜单'){await target.click({button:'right'});await expect(menu(kind)).toBeVisible();return menu(kind);}
async function chooseEditor(target,label,group,kind='正文编辑菜单'){
 const root=await editorMenu(target,kind);if(group){await item(root,group).click();await item(menu(group),label).click();}else await item(root,label).click();
 await expect(menu(kind)).toHaveCount(0);
}
async function selectText(id,text){await pane(id).locator('.rich-document').evaluate((root,text)=>{
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode()))if(!node.parentElement.closest('.md-meta,.md-view')&&node.data.includes(text)){const at=node.data.indexOf(text);root.focus();getSelection().setBaseAndExtent(node,at,node,at+text.length);document.dispatchEvent(new Event('selectionchange'));return;}
 throw new Error('Missing text '+text);
},text);}
async function selectedMenu(){const rect=await page.evaluate(()=>{const r=getSelection().getRangeAt(0).getBoundingClientRect();return {x:r.left+Math.min(3,r.width/2),y:r.top+r.height/2};});await page.mouse.click(rect.x,rect.y,{button:'right'});await expect(menu('正文编辑菜单')).toBeVisible();return menu('正文编辑菜单');}
try{
 app=await electron.launch({...(process.env.OPEN_TYPORA_EXECUTABLE?{executablePath:process.env.OPEN_TYPORA_EXECUTABLE,args:[]}:{args:[process.cwd()]}),env,timeout:60000});
 page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1300,height:900});
 await expect(tab(names[0])).toHaveAttribute('aria-selected','true',{timeout:20000});await expect(page.getByRole('tab')).toHaveCount(4);
 assert.match(await page.title(),/Alpha 中国\.md — Open Typora/);await expect(pane('menus-0').locator('.rich-document')).toContainText('First paragraph:');
 await command('autosave');
 await app.evaluate(async({clipboard,shell})=>{globalThis.__menuClipboard=await clipboard.read();globalThis.__menuReveals=[];shell.showItemInFolder=file=>globalThis.__menuReveals.push(['reveal',file]);shell.openPath=async file=>{globalThis.__menuReveals.push(['open',file]);return '';};});
 for(const [label,expected] of [['复制文件名（含扩展名）',names[1]],['复制文件名（不含扩展名）','Table'],['复制完整路径',records[1].path],['复制带引号完整路径','"'+records[1].path+'"'],['复制所在文件夹路径',directory]]){
  await chooseTab(names[1],label);await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe(expected);await expect(tab(names[0])).toHaveAttribute('aria-selected','true');
 }
 await chooseTab(names[1],'在文件管理器中显示');await chooseTab(names[1],'打开所在文件夹');
 await expect.poll(()=>app.evaluate(()=>globalThis.__menuReveals)).toEqual([['reveal',records[1].path],['open',directory]]);
 await tab(names[0]).focus();await page.keyboard.press('Shift+F10');await expect(menu('标签页菜单')).toBeVisible();await page.keyboard.press('End');await expect(menu('标签页菜单').getByRole('menuitemcheckbox',{name:'自动保存已有文件'})).toBeFocused();await page.keyboard.press('Escape');await expect(tab(names[0])).toBeFocused();
 await page.setViewportSize({width:640,height:460});await tabMenu(names[3]);const box=await menu('标签页菜单').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=641&&box.y+box.height<=461);await page.screenshot({path:path.join(qa,'tabs-context-compact.png')});await page.keyboard.press('Escape');await page.setViewportSize({width:1300,height:900});
 await tabMenu(names[1]);await page.screenshot({path:path.join(qa,'tabs-context.png')});await page.keyboard.press('Escape');
 checks.push('Background-tab copy/reveal targets the clicked file; Shift+F10, keyboard traversal, Escape focus and small-window menu bounds work.');
 await chooseTab(names[3],'关闭标签页');await expect(page.getByRole('tab')).toHaveCount(3);await expect(tab(names[0])).toHaveAttribute('aria-selected','true');await expect(pane('menus-0').locator('.rich-document')).toBeFocused();await command('reopen');await expect(page.getByRole('tab')).toHaveCount(4);await tab(names[0]).click();

 await selectText('menus-0','alpha');await item(await selectedMenu(),'复制').click();await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe('alpha');
 await selectText('menus-0','alpha');await item(await selectedMenu(),'剪切').click();await saved(records[0].path,alpha.replace('alpha',''));
 await app.evaluate(({clipboard,ClipboardItem})=>clipboard.write([new ClipboardItem({'text/plain':'粘贴中文','text/html':'<b>粘贴中文</b>'})]));
 const first=pane('menus-0').locator('.rich-document > p').first();await chooseEditor(first,'粘贴');
 await command('save');await expect.poll(()=>readFile(records[0].path,'utf8')).toContain('**粘贴中文**');
 await command('undo');await saved(records[0].path,alpha.replace('alpha',''));await command('undo');await saved(records[0].path,alpha);
 await chooseEditor(pane('menus-0').getByText('Second paragraph: beta.',{exact:true}),'2 级标题','段落');await saved(records[0].path,alpha.replace('Second paragraph: beta.','## Second paragraph: beta.'));
 await chooseEditor(pane('menus-0').getByRole('heading',{name:'Second paragraph: beta.',exact:true}),'撤销');await saved(records[0].path,alpha);
 await selectText('menus-0','alpha');await selectedMenu();await item(menu('正文编辑菜单'),'格式').focus();await page.keyboard.press('ArrowRight');await expect(menu('格式')).toBeVisible();await page.keyboard.press('ArrowLeft');await expect(item(menu('正文编辑菜单'),'格式')).toBeFocused();await page.keyboard.press('Escape');await page.keyboard.insertText('替换');await saved(records[0].path,alpha.replace('alpha','替换'));await command('undo');await saved(records[0].path,alpha);
 await pane('menus-0').locator('.rich-document').focus();await page.keyboard.press('Shift+F10');await expect(menu('正文编辑菜单')).toBeVisible();await page.screenshot({path:path.join(qa,'text-context.png')});await page.keyboard.press('Escape');
 checks.push('Real host cut/copy and HTML paste preserve exact saves and independent undo; formatting targets the right-clicked paragraph; keyboard submenus and Escape retain the selection.');

 await tab(names[1]).click();const tablePane=pane('menus-1'),cell=tablePane.getByRole('cell',{name:'B',exact:true});
 await tablePane.getByRole('cell',{name:'A',exact:true}).click();await chooseEditor(cell,'下方插入行','表格','表格编辑菜单');
 await saved(records[1].path,table.replace('| row-two | B |','| row-two | B |\n|  |  |'));await command('undo');await saved(records[1].path,table);
 await chooseEditor(cell,'右侧插入列','表格','表格编辑菜单');await command('save');await expect.poll(()=>readFile(records[1].path,'utf8')).toMatch(/\| Key \| Value \|  \|/);assert.match(await readFile(records[1].path,'utf8'),/\| row-two \| B \|  \|/);await command('undo');await saved(records[1].path,table);
 await chooseEditor(cell,'居中对齐','表格','表格编辑菜单');await saved(records[1].path,table.replace('| --- | --- |','| --- | :---: |'));await command('undo');await saved(records[1].path,table);
 await chooseEditor(cell,'向上移动行','表格','表格编辑菜单');await saved(records[1].path,table.replace('| row-one | A |\n| row-two | B |','| row-two | B |\n| row-one | A |'));await command('undo');await saved(records[1].path,table);
 await chooseEditor(cell,'向左移动列','表格','表格编辑菜单');await command('save');await expect.poll(()=>readFile(records[1].path,'utf8')).toMatch(/\| Value \| Key \|/);await command('undo');await saved(records[1].path,table);
 await chooseEditor(cell,'删除行','表格','表格编辑菜单');await saved(records[1].path,table.replace('| row-two | B |\n',''));await command('undo');await saved(records[1].path,table);
 await chooseEditor(cell,'删除列','表格','表格编辑菜单');await command('save');await expect.poll(()=>readFile(records[1].path,'utf8')).toMatch(/\| Key \|\n\| --- \|/);await command('undo');await saved(records[1].path,table);
 await chooseEditor(cell,'删除表格','表格','表格编辑菜单');await command('save');await expect.poll(async()=>(await readFile(records[1].path,'utf8')).includes('| row-one')).toBe(false);await command('undo');await saved(records[1].path,table);
 await editorMenu(tablePane.getByRole('columnheader',{name:'Key',exact:true}),'表格编辑菜单');await item(menu('表格编辑菜单'),'表格').click();await expect(item(menu('表格'),'删除行')).toBeDisabled();await page.screenshot({path:path.join(qa,'table-context.png')});await page.keyboard.press('Escape');
 const lightInk=await tablePane.locator('.rich-document').evaluate(element=>getComputedStyle(element).color);await command('theme');await expect.poll(()=>tablePane.locator('.rich-document').evaluate(element=>getComputedStyle(element).color)).not.toBe(lightInk);
 await page.setViewportSize({width:640,height:460});await editorMenu(cell,'表格编辑菜单');await item(menu('表格编辑菜单'),'表格').click();
 for(const label of ['表格编辑菜单','表格']){const rect=await menu(label).boundingBox();assert.ok(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=641&&rect.y+rect.height<=461);}
 await page.screenshot({path:path.join(qa,'table-context-dark-compact.png')});await page.keyboard.press('Escape');await page.setViewportSize({width:1300,height:900});await command('theme');await expect.poll(()=>tablePane.locator('.rich-document').evaluate(element=>getComputedStyle(element).color)).toBe(lightInk);
 checks.push('Table context commands insert, move, align and delete the clicked row/column/table; each undoes to exact original bytes; header deletion is disabled.');

 await command('plugins');const plugins=page.getByRole('dialog',{name:'插件管理',exact:true});await plugins.getByRole('checkbox',{name:'启用只读模式',exact:true}).check();await plugins.getByRole('button',{name:'完成',exact:true}).click();await expect(tablePane.locator('.rich-document')).toHaveAttribute('aria-readonly','true');
 await editorMenu(cell,'表格编辑菜单');await expect(item(menu('表格编辑菜单'),'剪切')).toBeDisabled();await expect(item(menu('表格编辑菜单'),'粘贴')).toBeDisabled();await expect(item(menu('表格编辑菜单'),'表格')).toBeDisabled();await page.keyboard.press('Escape');
 await command('plugins');await plugins.getByRole('checkbox',{name:'启用只读模式',exact:true}).uncheck();await plugins.getByRole('button',{name:'完成',exact:true}).click();await expect(tablePane.locator('.rich-document')).toHaveAttribute('aria-readonly','false');
 await chooseTab(names[0],'向右拆分编辑器');await expect(page.locator('.document-editor:not([hidden])')).toHaveCount(2);await expect(pane('menus-0')).toHaveAttribute('data-active','true');
 await chooseEditor(cell,'下方插入行','表格','表格编辑菜单');await expect(tablePane).toHaveAttribute('data-active','true');await saved(records[1].path,table.replace('| row-two | B |','| row-two | B |\n|  |  |'));assert.equal(await readFile(records[0].path,'utf8'),alpha);await command('undo');await saved(records[1].path,table);await command('close-pane');
 checks.push('Read-only plugin disables modifying context commands; right-click in the inactive split pane edits only that pane.');

 await tab(names[2]).click();const large=pane('menus-2').locator('.md-large-table');await expect(large).toBeVisible();await large.evaluate(element=>element.scrollTop=element.scrollHeight);
 const last=large.getByText('stable 中文 value 11999 '+ 'x'.repeat(30),{exact:true});await expect(last).toBeVisible();await chooseEditor(last,'居中对齐','表格','表格编辑菜单');await saved(records[2].path,big.replace('|---|---|','| --- | :---: |'));await command('undo');await saved(records[2].path,big);
 checks.push('Virtualized large-table right-click maps the visible final cell to its original source column and preserves all other rows with exact undo.');

 await tab(names[0]).click();await command('source');const source=pane('menus-0').locator('.source-surface .cm-content');await expect(source).toBeVisible();await source.click();await source.press(`${mod}+a`);await source.press('Shift+F10');await expect(menu('正文编辑菜单')).toBeVisible();await item(menu('正文编辑菜单'),'复制').click();await expect.poll(()=>app.evaluate(({clipboard})=>clipboard.readText())).toBe(alpha);
 await chooseEditor(source,'切换即时渲染');await expect(pane('menus-0').locator('.rich-document')).toBeVisible();
 await selectText('menus-0','alpha');const cdp=await app.context().newCDPSession(page);await cdp.send('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});
 await pane('menus-0').locator('.rich-document').dispatchEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:250});await expect(menu('正文编辑菜单')).toHaveCount(0);
 await tab(names[1]).dispatchEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:40});await expect(menu('标签页菜单')).toHaveCount(0);await expect(tab(names[0])).toHaveAttribute('aria-selected','true');
 await cdp.send('Input.insertText',{text:'中国'});await command('undo');await saved(records[0].path,alpha);
 checks.push('Source mode uses the same context clipboard; a menu cannot interrupt active Chinese composition.');

 await chooseTab(names[1],'重命名文件…');const rename=page.getByRole('dialog',{name:'重命名',exact:true});await rename.getByRole('textbox',{name:'文件名称',exact:true}).fill('Renamed table.md');await rename.getByRole('button',{name:'确定',exact:true}).click();await expect(tab('Renamed table.md')).toBeVisible();await expect(tab(names[0])).toHaveAttribute('aria-selected','true');const renamed=path.join(directory,'Renamed table.md');assert.equal(await readFile(renamed,'utf8'),table);await assert.rejects(stat(records[1].path),{code:'ENOENT'});names[1]='Renamed table.md';records[1].path=renamed;
 await selectText('menus-0','alpha');await page.keyboard.insertText('DIRTY-ALPHA');await tab(names[1]).click();await tablePane.getByRole('cell',{name:'B',exact:true}).click();await page.keyboard.insertText('DIRTY-TABLE');
 await app.evaluate(({dialog})=>{globalThis.__menuConfirmCalls=[];let n=0;dialog.showMessageBox=async(_window,options)=>{globalThis.__menuConfirmCalls.push(options.message);return {response:n++===0?2:1};};});
 await chooseTab(names[0],'关闭全部标签页');await expect.poll(()=>app.evaluate(()=>globalThis.__menuConfirmCalls.length)).toBe(2);await expect(page.getByRole('tab')).toHaveCount(4);await expect(pane('menus-0').locator('.rich-document')).toContainText('DIRTY-ALPHA');await expect(tablePane.locator('.rich-document')).toContainText('DIRTY-TABLE');assert.equal(await readFile(records[0].path,'utf8'),alpha);assert.equal(await readFile(renamed,'utf8'),table);
 await chooseTab(names[0],'保存全部');await expect.poll(()=>readFile(records[0].path,'utf8')).toContain('DIRTY-ALPHA');await expect.poll(()=>readFile(renamed,'utf8')).toContain('DIRTY-TABLE');
 await tabMenu(names[0]);await expect(item(menu('标签页菜单'),'关闭左侧标签页')).toBeDisabled();await page.keyboard.press('Escape');await expect(page.getByRole('tab')).toHaveCount(4);
 await chooseTab(names[0],'关闭右侧标签页');await expect(page.getByRole('tab')).toHaveCount(1);await expect(tab(names[0])).toBeVisible();await command('reopen');await expect(page.getByRole('tab')).toHaveCount(2);
 await command('newTab');const untitled=page.getByRole('tab',{name:/^未命名/});await expect(untitled).toBeVisible();const draftName=await untitled.getAttribute('aria-label');await tabMenu(draftName);await expect(item(menu('标签页菜单'),'复制完整路径')).toBeDisabled();await expect(item(menu('标签页菜单'),'重命名文件…')).toBeDisabled();await page.keyboard.press('Escape');
 await chooseTab(draftName,'关闭所有已保存标签页');await expect(page.getByRole('tab')).toHaveCount(1);await expect(untitled).toBeVisible();await page.locator('.document-editor:not([hidden]) .rich-document').click();await page.keyboard.insertText('Draft survives cancelled save.');
 await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});await chooseTab(draftName,'保存并关闭全部标签页');await expect(untitled).toBeVisible();await expect(page.locator('.document-editor:not([hidden]) .rich-document')).toContainText('Draft survives cancelled save.');
 const draftFile=path.join(directory,'Saved draft.md');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},draftFile);await chooseTab(draftName,'保存并关闭全部标签页');await expect(page.getByRole('tab')).toHaveCount(0);assert.equal(await readFile(draftFile,'utf8'),'Draft survives cancelled save.');await command('reopen');await expect(tab('Saved draft.md')).toBeVisible();
 checks.push('Rename targets a background file; bulk-close cancellation preserves every dirty tab, save-all writes each file, and saved-only close keeps untitled drafts. Cancelled Save As keeps the draft; save-and-close and reopen preserve bytes.');
 assert.deepEqual(errors,[]);await expect(page.locator('vite-error-overlay')).toHaveCount(0);
 await writeFile(path.join(qa,'context-menu-results.json'),JSON.stringify({platform:process.platform,browser:'Browser plugin not available; existing Electron/Playwright workflow',profile,checks,errors},null,2));console.log(checks.map(check=>'PASS: '+check).join('\n'));
}catch(error){await page?.screenshot({path:path.join(qa,'context-menu-failure.png')}).catch(()=>{});throw error;}
finally{if(app){await app.evaluate(async({clipboard})=>{if(globalThis.__menuClipboard?.length)await clipboard.write(globalThis.__menuClipboard);else if(globalThis.__menuClipboard)clipboard.clear();}).catch(()=>{});await app.close();}}
