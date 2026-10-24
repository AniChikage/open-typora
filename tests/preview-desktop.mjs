import { _electron as electron, expect } from 'playwright/test';
import { mkdtemp,mkdir,writeFile,readFile } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createServer} from 'node:http';import assert from 'node:assert/strict';import sharp from 'sharp';
const directory=await mkdtemp(path.join(os.tmpdir(),'open-typora-preview-')),qa=process.env.OPEN_TYPORA_QA_DIR||path.join(directory,'evidence');await mkdir(qa,{recursive:true});
const image=await sharp({create:{width:300,height:100,channels:3,background:{r:70,g:130,b:180}}}).png().toBuffer();
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{const file=path.resolve('dist','.'+decodeURIComponent(new URL(req.url,'http://local').pathname));assert.ok(file.startsWith(path.resolve('dist')+path.sep));res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const main=path.join(directory,'main.cjs');await writeFile(main,`const {app,BrowserWindow}=require('electron');app.whenReady().then(()=>{const w=new BrowserWindow({width:1080,height:850,webPreferences:{sandbox:true}});w.loadURL(process.env.OPEN_TYPORA_PREVIEW_URL)});`);
const env={...process.env,OPEN_TYPORA_PREVIEW_URL:`http://127.0.0.1:${server.address().port}/preview.html`};delete env.ELECTRON_RUN_AS_NODE;
let app,page;const errors=[],requests=[];
try{
 app=await electron.launch({args:[main],env});page=await app.firstWindow();await page.addInitScript(()=>{const listeners=[];window.chrome={...(window.chrome||{}),webview:{addEventListener:(_name,fn)=>listeners.push(fn),postMessage:value=>window.previewReady=value}};window.deliverPreview=value=>listeners.forEach(fn=>fn({data:value}));});await page.reload();await expect.poll(()=>page.evaluate(()=>window.previewReady)).toBe('ready');page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://document.opentypora.local/**',route=>{requests.push(new URL(route.request().url()).searchParams.get('path'));return route.fulfill({contentType:'image/png',body:image});});
 const value='# Complete preview start\n\n![Local diagram](../图片%20预览.png)\n\n| Key | Value |\n|---|---|\n| Alpha | 123 |\n\n'+('Paragraph 中文 **bold** and `code`, full document content. 0123456789\n\n').repeat(90000)+'# Complete preview tail\n\n![Tail diagram](../图片%20预览.png)\n';
 assert.ok(Buffer.byteLength(value)>5*1024*1024);const started=Date.now();
 await page.evaluate(value=>window.deliverPreview({source:value,name:'完整预览.md',base:'https://document.opentypora.local/'}),value);
 await expect(page.getByRole('heading',{name:'Complete preview start',exact:true})).toBeVisible();
 await expect.poll(()=>page.getByAltText('Local diagram',{exact:true}).evaluate(image=>image.naturalWidth)).toBe(300);
 const mounted=await page.locator('#markdown-preview > [data-cid]').count();assert.ok(mounted<300);
 await page.screenshot({path:path.join(qa,'complete-preview-start.png')});
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 await expect(page.getByRole('heading',{name:'Complete preview tail',exact:true})).toBeVisible({timeout:20000});
 await expect.poll(()=>page.getByAltText('Tail diagram',{exact:true}).evaluate(image=>image.naturalWidth)).toBe(300);
 await page.screenshot({path:path.join(qa,'complete-preview-tail.png')});
 assert.ok(requests.length>=2);assert.ok(requests.every(value=>value==='../图片 预览.png'));assert.deepEqual(errors,[]);
 assert.equal(await page.title(),'完整预览.md — Markdown preview');await expect(page.locator('#preview-status')).toBeHidden();
 await writeFile(path.join(qa,'complete-preview-results.json'),JSON.stringify({bytes:Buffer.byteLength(value),elapsedMs:Date.now()-started,mountedBlocks:mounted,tailVisible:true,decodedRelativeImages:requests,errors,browser:'Browser plugin not available; Electron/Playwright'},null,2));
 console.log('PASS: complete 5+ MiB virtualized preview reaches final heading, decodes Unicode parent-relative image paths, and renders image pixels without script errors.');
}finally{await app?.close();await new Promise(resolve=>server.close(resolve));}
