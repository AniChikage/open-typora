import {_electron as electron, expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root=await mkdtemp(path.join(os.tmpdir(),'lane-localization-'));
const qa=process.env.OPEN_MARKDOWN_LANE_QA_DIR || root;await mkdir(qa,{recursive:true});
const errors:string[]=[],passed:string[]=[];
let application:import('playwright').ElectronApplication | undefined;
async function launch(profile:string,system:string,environment:Record<string,string>={}) {
  const env:Record<string,string>={...process.env,OPEN_MARKDOWN_LANE_DATA_DIR:profile,LANG:system,LC_MESSAGES:'',LC_ALL:'',...environment};
  delete env.OPEN_MARKDOWN_LANE_DEV_URL;delete env.ELECTRON_RUN_AS_NODE;
  if(process.platform==='darwin')env.OPEN_MARKDOWN_LANE_TEST_HIDDEN='1';
  const executable=process.env.OPEN_MARKDOWN_LANE_EXECUTABLE;
  application=await electron.launch({...(executable?{executablePath:executable}:{}),args:['--lang='+system,...(executable?[]:[process.cwd()])],env,timeout:30000});
  const page=await application.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await expect(page.locator('.rich-document').first()).toBeVisible({timeout:20000});
  return page;
}
async function stop(){await application?.close();application=undefined;}
try {
  const cases=[{name:'English',system:'en-US',locale:'en'},{name:'Chinese',system:'zh-CN',locale:'zh-CN'},{name:'unsupported-French',system:'fr-FR',locale:'en'}];
  if(process.platform==='linux')cases.push(
    {name:'C',system:'C',locale:'en'},
    {name:'LC_ALL-Chinese',system:'en_US.UTF-8',locale:'zh-CN'},
    {name:'LC_MESSAGES-English',system:'zh_CN.UTF-8',locale:'en'},
  );
  for(const entry of cases){
    const profile=path.join(root,entry.name);
    const overrides:Record<string,string>=entry.name==='LC_ALL-Chinese'?{LC_ALL:'zh_TW.UTF-8'}:entry.name==='LC_MESSAGES-English'?{LC_MESSAGES:'en_US.UTF-8'}:{};
    const page=await launch(profile,entry.system,overrides);
    await expect(page.locator('html')).toHaveAttribute('lang',entry.locale);
    const names=entry.locale==='en'?['Welcome.md','Writing Example.md','Markdown Guide.md']:['欢迎.md','写作示例.md','Markdown 语法.md'];
    for(const name of names)await expect(page.getByRole('tab',{name,exact:true})).toBeVisible();
    await expect(page).toHaveTitle(/Open Markdown Lane/);
    if(entry.locale==='en'){
      assert.doesNotMatch(await page.locator('body').innerText(),/[\u3400-\u9fff]/u);
      if(process.platform!=='darwin')assert.match(await page.locator('.rich-document').innerText(),/Ctrl\+S/);
      assert.ok((await application!.evaluate(({Menu})=>Menu.getApplicationMenu()!.items.map(x=>x.label))).includes('File'));
    }
    await page.screenshot({path:path.join(qa,'first-run-'+entry.name+'.png')});
    await stop();passed.push(entry.name+' locale, menu, localized samples and visible UI');
  }
  const profile=path.join(root,'manual-choice');let page=await launch(profile,'en-US');
  async function choose(language:string){
    await application!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('app:command',{action:'preferences'}));
    await page.getByRole('combobox',{name:'Language',exact:true}).selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang',language);
    await page.getByRole('button',{name:language==='en'?'Close Preferences':'关闭偏好设置',exact:true}).click();
  }
  const welcome=path.join(profile,'Sample Notes','Welcome.md');
  const original=await readFile(welcome,'utf8');
  const customized=original+'\n\nMy existing note: 你好，中国.\n';await writeFile(welcome,customized);
  await stop();page=await launch(profile,'zh-CN');await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await stop();page=await launch(profile,'en-US');await expect(page.locator('html')).toHaveAttribute('lang','en');
  passed.push('automatic language follows system changes while keeping the original English sample files');
  await choose('zh-CN');await stop();
  page=await launch(profile,'en-US');await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  await expect(page.getByRole('tab',{name:'Welcome.md',exact:true})).toBeVisible();
  assert.equal(await readFile(welcome,'utf8'),customized);
  await choose('en');await stop();
  page=await launch(profile,'zh-CN');await expect(page.locator('html')).toHaveAttribute('lang','en');
  assert.equal(await readFile(welcome,'utf8'),customized);passed.push('manual Chinese and English survive opposite system locale, restart and existing note edits');
  // Legacy preference key remains readable without overwriting its settings.
  await page.evaluate(()=>{localStorage.removeItem('open-markdown-lane-preferences');localStorage.setItem('open-typora-preferences',JSON.stringify({language:'zh-CN',fontSize:22,remoteImages:false}));});
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('open-markdown-lane-preferences')!).fontSize),22);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('open-markdown-lane-preferences')!).remoteImages),false);
  assert.equal(await readFile(welcome,'utf8'),customized);passed.push('legacy Chinese choice and unrelated settings retained');
  assert.deepEqual(errors,[]);
  await writeFile(path.join(qa,'localization-results.json'),JSON.stringify({passed,errors,platform:process.platform},null,2));
  console.log('PASS: '+passed.join('; '));
} finally {await stop();}
