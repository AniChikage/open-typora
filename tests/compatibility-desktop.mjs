import {_electron as electron,expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,copyFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createServer} from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {pandocPath,libreOfficePath} from '../electron/interchange.mjs';
const exec = promisify(execFile), pandoc = await pandocPath(), office = await libreOfficePath();
assert.ok(pandoc && office,'Install Pandoc and LibreOffice for actual conversion acceptance');
const data = await mkdtemp(path.join(os.tmpdir(),'open-typora-compatibility-'));
const qa = process.env.OPEN_TYPORA_QA_DIR || path.join(data,'evidence'); await mkdir(qa,{recursive:true});
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=','base64');
await writeFile(path.join(data,'figure.png'),png);
const markdown = '# 兼容验收\n\n中文、English **bold**, $E=mc^2$ and note[^n].\n\n| A | B |\n|---|---|\n| cell one | 中文 |\n\n![Figure](figure.png)\n\n```javascript\nlet answer = 42;\n```\n\n[^n]: Footnote text\n';
const md = path.join(data,'input.md'); await writeFile(md,markdown);
for (const format of ['docx','odt','epub']) await exec(pandoc,[md,'--output='+path.join(data,'input.'+format),'--resource-path='+data]);
for (const format of ['doc:MS Word 97','rtf:Rich Text Format']) await exec(office,['-env:UserInstallation='+pathToFileURL(path.join(data,'profile')).href,'--headless','--norestore','--convert-to',format,'--outdir',data,path.join(data,'input.docx')],{timeout:60000});
const env = {...process.env,OPEN_TYPORA_DATA_DIR:path.join(data,'session')}; delete env.ELECTRON_RUN_AS_NODE; delete env.OPEN_TYPORA_DEV_URL;
const server = createServer((request,response)=>{response.writeHead(200,{'content-type':'image/png'});response.end(png);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let application,page; const checks=[],errors=[];
try {
  application = await electron.launch({...(process.env.OPEN_TYPORA_EXECUTABLE ? {executablePath:process.env.OPEN_TYPORA_EXECUTABLE,args:[]} : {args:[process.cwd()]}),env,timeout:30000});
  page = await application.firstWindow(); page.on('pageerror',error=>errors.push(error.message));
  await expect(page.getByRole('button',{name:'欢迎.md',exact:true})).toBeVisible();
  await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2});});
  const command = action=>application.evaluate(({BrowserWindow},action)=>BrowserWindow.getAllWindows()[0].webContents.send('app:command',{action}),action);
  const openDialog = async file=>application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  const saveDialog = async file=>application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},file);
  const refused = await page.evaluate(url=>window.desktop.readResource(url),pathToFileURL(md).href);
  assert.equal(refused.ok,false,'Resource bridge must reject non-bundled file URLs');
  const root = page.locator('.document-editor:not([hidden]) .rich-document');
  let savedDoc;
  for (const format of ['docx','odt','epub','doc','rtf']) {
    const importFile=path.join(data,'input-'+format+'.'+format); await copyFile(path.join(data,'input.'+format),importFile);
    await openDialog(importFile); await command('import');
    await expect(page.locator('.document-title')).toContainText('input-'+format+'.md',{timeout:90000});
    await expect(root.getByRole('heading',{name:'兼容验收',exact:true})).toBeVisible({timeout:90000});
    await expect(root.locator('table')).toContainText('cell one');
    await expect.poll(()=>root.locator('img').evaluateAll(images=>images.length>0 && images.every(image=>image.complete && image.naturalWidth>0))).toBe(true);
    await expect(root).toContainText('Footnote text');
    if (['docx','odt','epub'].includes(format)) await expect(root.locator('.mathjax-node svg')).not.toHaveCount(0);
    const exported = path.join(data,'export-'+format+'.html'); await saveDialog(exported); await command('html');
    await expect.poll(async()=>{try{return await readFile(exported,'utf8');}catch{return '';}},{timeout:30000}).toContain('data:image/png;base64,');
    const html = await readFile(exported,'utf8'); assert.ok(html.includes('cell one')&&html.includes('Footnote text'));
    if (format === 'docx') { savedDoc=path.join(data,'Imported saved.md'); await saveDialog(savedDoc); await command('saveAs'); await expect.poll(async()=>{try{return await readFile(savedDoc,'utf8');}catch{return '';}}).toContain('Imported/'); }
    checks.push(format+': actual import renders persistent image/table/note, then embeds it in portable HTML');

  }
  const assets = path.join(data,'assets'); await mkdir(assets);
  await writeFile(path.join(assets,'one.png'),png); await writeFile(path.join(assets,'two.png'),png);
  const imagesFile = path.join(data,'Images.md');
  const remote = `http://127.0.0.1:${server.address().port}/download.png`;
  await writeFile(imagesFile,`# Image management\n\n![One](assets/one.png)\n\n![Two](assets/two.png)\n\n![Remote](${remote})\n`);
  await openDialog(imagesFile); await command('open'); await expect(root.getByRole('heading',{name:'Image management'})).toBeVisible();
  const copied = path.join(data,'Copied images'), moved = path.join(data,'Moved images'); await mkdir(copied); await mkdir(moved);
  await openDialog(copied); await command('copy-all-images');
  await expect.poll(()=>readFile(imagesFile,'utf8')).toContain('Copied%20images/download.png');
  for (const name of ['one.png','two.png','download.png']) assert.deepEqual(await readFile(path.join(copied,name)),png);
  assert.deepEqual(await readFile(path.join(assets,'one.png')),png);
  await openDialog(moved); await command('move-all-images');
  await expect.poll(()=>readFile(imagesFile,'utf8')).toContain('Moved%20images/download.png');
  for (const name of ['one.png','two.png','download.png']) {assert.deepEqual(await readFile(path.join(moved,name)),png);await assert.rejects(stat(path.join(copied,name)),{code:'ENOENT'});}
  await expect.poll(()=>root.locator('img').evaluateAll(images=>images.every(image=>image.naturalWidth>0))).toBe(true);
  checks.push('Installed host copies local/HTTP images, rewrites paths, moves originals to Trash and renders new destinations');
  await page.screenshot({path:path.join(qa,'compatibility.png')});
  await application.close(); application=null;
  application = await electron.launch({...(process.env.OPEN_TYPORA_EXECUTABLE ? {executablePath:process.env.OPEN_TYPORA_EXECUTABLE,args:[savedDoc]} : {args:[process.cwd(),savedDoc]}),env,timeout:30000});
  page = await application.firstWindow(); page.on('pageerror',error=>errors.push(error.message));
  const reopened = page.locator('.document-editor:not([hidden]) .rich-document');
  await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:2});});
  await page.getByRole('button',{name:'Imported saved.md',exact:true}).click();
  await expect(reopened.getByRole('heading',{name:'兼容验收',exact:true})).toBeVisible();
  await expect.poll(()=>reopened.locator('img').evaluateAll(images=>images.length>0&&images.every(image=>image.naturalWidth>0))).toBe(true);
  checks.push('Saved imported document and extracted media survive an application restart');
  assert.deepEqual(errors,[]); await writeFile(path.join(qa,'compatibility-results.json'),JSON.stringify({platform:process.platform,checks,errors,pandoc,office},null,2));
  console.log(checks.map(check=>'PASS: '+check).join('\n'));
} catch(error) { await page?.screenshot({path:path.join(qa,'compatibility-failure.png')}).catch(()=>{}); throw error; }
finally { if (application) { await application.evaluate(({app})=>app.exit(0)).catch(()=>{}); await application.close().catch(()=>{}); } server.close(); }
