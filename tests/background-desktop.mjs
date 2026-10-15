import {_electron as electron,expect} from "playwright/test";
import {mkdtemp,writeFile,readFile,mkdir,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import formats from "./background-formats.json" with {type:"json"};
const directory = await mkdtemp(path.join(os.tmpdir(),"open-typora-background-desktop-"));
const env={...process.env,OPEN_TYPORA_DATA_DIR:directory,OPEN_TYPORA_TEST_HIDDEN:"1"};delete env.ELECTRON_RUN_AS_NODE;delete env.OPEN_TYPORA_DEV_URL;
let application;
try {
  application=await electron.launch({args:[process.cwd()],env,timeout:30000});let page=await application.firstWindow();
  await expect(page.getByRole('button',{name:'欢迎.md',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'偏好设置…',exact:true}).click();
  for(const [format,encoded] of Object.entries(formats)) {
    const file=path.join(directory,'actual.'+format);await writeFile(file,Buffer.from(encoded,'base64'));
    await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
    await page.getByRole('button',{name:format===Object.keys(formats)[0]?'选择图片…':'更换图片…',exact:true}).click();
    await expect(page.getByRole('group',{name:'背景图片',exact:true})).toContainText(path.basename(file));
    await expect(page.locator('.editor-background')).toBeVisible();
    assert.ok(JSON.parse(await readFile(path.join(directory,'background.json'),'utf8')).dataUrl.startsWith('data:image/'+format+';base64,'));
    console.log('PASS: Electron host decodes and persists actual '+format+' background');
  }
  const opacity=page.getByRole('slider',{name:'背景不透明度',exact:true});await opacity.press('Home');for(let i=0;i<4;i++)await opacity.press('PageUp');
  await page.getByRole('combobox',{name:'背景位置',exact:true}).selectOption('top');
  await page.getByRole('button',{name:'关闭偏好设置',exact:true}).click();await application.close();await rm(path.join(directory,'actual.webp'));
  application=await electron.launch({args:[process.cwd()],env,timeout:30000});page=await application.firstWindow();
  await expect(page.locator('.editor-background')).toHaveCSS('opacity','0.4');await expect(page.locator('.editor-background')).toHaveCSS('background-position','50% 0%');
  console.log('PASS: Electron restart restores background copy and settings after source removal');
  const exported=path.join(directory,'export.html');await application.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exported);
  await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'导出 HTML…',exact:true}).click();
  await expect.poll(async()=>{try{return await readFile(exported,'utf8');}catch{return '';}}).toContain('让文字');
  const html=await readFile(exported,'utf8');assert.ok(!html.includes('data:image/webp')&&!html.includes('data-editor-background'));
  console.log('PASS: actual Electron HTML export excludes the personal background');
  await page.getByRole('button',{name:'更多操作',exact:true}).click();await page.getByRole('menuitem',{name:'偏好设置…',exact:true}).click();
  await page.getByRole('button',{name:'清除背景',exact:true}).click();await expect(page.locator('.editor-background')).toHaveCount(0);
  const qa=process.env.OPEN_TYPORA_QA_DIR;if(qa){await mkdir(qa,{recursive:true});await page.screenshot({path:path.join(qa,'electron-background.png')});}
} finally {await application?.close();}
