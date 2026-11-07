import { _electron as electron, expect } from 'playwright/test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(os.tmpdir(), 'markdown-lane-issues-'));
const qa = process.env.OPEN_MARKDOWN_LANE_QA_DIR || path.join(directory, 'qa');
await mkdir(qa, {recursive:true});
const file=path.join(directory,'live.md'), original='正文';
await writeFile(file,original);
const missing = Array.from({length:35},(_,index)=>({
  id:`missing-${index}`,name:`missing-${index+1}.md`,path:path.join(directory,`missing-${index+1}.md`),
  content:`# Cached ${index+1}\n\nUnsaved recovery text`, savedContent:`# Cached ${index+1}`,lineEnding:'\n',
}));
await writeFile(path.join(directory,'session.json'),JSON.stringify({version:1,activeId:'live',documents:[...missing,{
  id:'live',name:'live.md',path:file,content:original,savedContent:original,lineEnding:'\n',diskHash:createHash('sha256').update(original).digest('hex'),
}]}));
const env:Record<string,string>={...process.env,OPEN_MARKDOWN_LANE_DATA_DIR:directory};
if(process.platform==='darwin')env.OPEN_MARKDOWN_LANE_TEST_HIDDEN='1';else delete env.OPEN_MARKDOWN_LANE_TEST_HIDDEN;
delete env.OPEN_MARKDOWN_LANE_DEV_URL; delete env.ELECTRON_RUN_AS_NODE;
const errors:string[]=[], passed:string[]=[];
const paths=missing.map(record=>record.path);
let application:import('playwright').ElectronApplication;
async function launch() {
  application=await electron.launch({
    timeout:30000,
    ...(process.env.OPEN_MARKDOWN_LANE_EXECUTABLE?{executablePath:process.env.OPEN_MARKDOWN_LANE_EXECUTABLE,args:process.platform==='darwin'?[]:paths}:{args:[process.cwd(),...(process.platform==='darwin'?[]:paths)]}),env,
  });
  const page=await application.firstWindow({timeout:20000});
  page.on('pageerror',error=>errors.push(error.message));
  await expect(page.getByRole('tab',{name:'live.md',exact:true})).toHaveAttribute('aria-selected','true');
  return page;
}
try {
  const page=await launch();
  if(!process.argv.includes('--recovery-only')) {
    const rich=page.locator('.rich-document:not([hidden])');
    await rich.locator('p').first().click(); await page.keyboard.press('End');
    const positions:number[]=[];
    for(let count=1;count<=3;count++) {
      await page.keyboard.press('Enter');
      await expect(rich.locator('p')).toHaveCount(count+1);
      positions.push(await rich.locator('p').last().evaluate(element=>element.getBoundingClientRect().top));
    }
    assert.ok(positions[1]>positions[0] && positions[2]>positions[1]);
    await page.keyboard.insertText('结尾');
    const expected='正文\n\n\n\n\n\n结尾';
    const source=page.locator('.source-surface .cm-content');
    await page.locator('.source-toggle').click();
    await expect(source).toBeVisible();
    assert.equal((await source.locator('.cm-line').allTextContents()).join('\n'),expected);
    await page.locator('.source-toggle').click();
    await expect(rich.locator('p')).toHaveCount(4);
    await rich.locator('p').first().click();
    await expect(rich.locator('p')).toHaveCount(4);
    const saved=await page.evaluate(async()=>window.desktop!.save('live','正文\n\n\n\n\n\n结尾'));
    assert.equal(saved.ok,true);assert.equal(await readFile(file,'utf8'),expected);
    await page.screenshot({path:path.join(qa,'issue-16-blank-lines.png')});
    passed.push('Issue #16: repeated Enter adds visible editable rows; blank paragraphs survive typing, source roundtrip and exact save');
  }
  const available=path.join(directory,'available.md');await writeFile(available,'# Available\n');
  await application!.evaluate(({app,dialog},targets)=>{
    const modalErrors:string[]=[];Reflect.set(globalThis,'issue17ModalErrors',modalErrors);
    dialog.showErrorBox=(_title,message)=>{modalErrors.push(message);};
    for(const target of targets)app.emit('open-file',{preventDefault(){}},target);
  },[...paths,available]);
  await expect(page.getByRole('tab',{name:'available.md',exact:true})).toHaveAttribute('aria-selected','true');
  const modalCount=await application!.evaluate(()=>Reflect.get(globalThis,'issue17ModalErrors').length);
  assert.equal(modalCount,0,'Missing files must not show one native modal per document');
  await expect(page.locator('.toast')).toContainText('35');
  await page.screenshot({path:path.join(qa,'issue-17-missing-files.png')});
  await expect.poll(async()=>JSON.parse(await readFile(path.join(directory,'session.json'),'utf8')).documents.length).toBe(37);
  const session=JSON.parse(await readFile(path.join(directory,'session.json'),'utf8'));
  for(const record of missing) {
    const recovered=session.documents.find((item:{id:string})=>item.id===record.id);
    assert.equal(recovered.content,record.content); assert.equal(recovered.savedContent,record.savedContent);
    await assert.rejects(access(record.path));
  }
  passed.push('Issue #17: 35 missing files produce zero native error dialogs and one aggregate notice; valid files still open; all dirty recovery text retained');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(qa,'issues-results.json'),JSON.stringify({passed,errors,directory},null,2));
  console.log(JSON.stringify({passed,errors,directory},null,2));
} finally { if(application!)await application.close(); }
