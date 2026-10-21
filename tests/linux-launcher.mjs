import {_electron as electron,expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const exec=promisify(execFile);
assert.equal(process.platform,'linux');
// D-Bus-activated KDE helpers must inherit the same isolated profile as the app.
if(!process.env.OPEN_TYPORA_LAUNCHER_ROOT){
 const data=await mkdtemp(path.join(os.tmpdir(),'open-typora-launcher-'));
 for(const name of ['config','cache','profile'])await mkdir(path.join(data,name));
 const env={...process.env,OPEN_TYPORA_LAUNCHER_ROOT:data,OPEN_TYPORA_DATA_DIR:path.join(data,'profile'),XDG_CONFIG_HOME:path.join(data,'config'),XDG_CACHE_HOME:path.join(data,'cache')};
 const child=await exec('dbus-run-session',['--',process.execPath,fileURLToPath(import.meta.url)],{env,timeout:120000,maxBuffer:2*1024*1024});
 process.stdout.write(child.stdout);process.stderr.write(child.stderr);
}else{
 const data=process.env.OPEN_TYPORA_LAUNCHER_ROOT,qa=process.env.OPEN_TYPORA_QA_DIR;await mkdir(qa,{recursive:true});
 const desktop='/usr/share/applications/open-typora.desktop';
 const desktopText=await readFile(desktop,'utf8');
 assert.match(desktopText,/^Name=Open Typora$/m);assert.match(desktopText,/^Exec="?\/opt\/Open-Typora\/open-typora"? %U$/m);
 await exec('desktop-file-validate',[desktop]);
 await writeFile(path.join(process.env.XDG_CONFIG_HOME,'mimeapps.list'),'[Default Applications]\ntext/markdown=open-typora.desktop;\ntext/x-markdown=open-typora.desktop;\n');
 await exec('kbuildsycoca5',['--noincremental'],{timeout:30000});
 const names=['Initial.md','中文 notes.md','符号 #% &.md','KDE 中文.md'],files=[];
 for(const [i,name] of names.entries()){const file=path.join(data,name);await writeFile(file,`# Launcher ${i}\n\nKeep Unicode, spaces and punctuation intact.\n`);files.push(file);}
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.OPEN_TYPORA_DEV_URL;
 let app,page;const errors=[];
 try{
  app=await electron.launch({executablePath:process.env.OPEN_TYPORA_EXECUTABLE,args:[files[0]],env,timeout:30000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await expect(page.getByRole('heading',{name:'Launcher 0',exact:true})).toBeVisible({timeout:20000});
  await exec('gio',['launch',desktop,...files.slice(1,3).map(file=>pathToFileURL(file).href)],{env,timeout:30000});
  for(const name of names.slice(1,3))await expect(page.getByRole('tab',{name,exact:true})).toBeVisible({timeout:20000});
  await expect(page.getByRole('heading',{name:'Launcher 2',exact:true})).toBeVisible();
  const detected=(await exec('xdg-mime',['query','filetype',files[3]],{env,timeout:10000})).stdout.trim();
  assert.ok(['text/markdown','text/x-markdown'].includes(detected),`Unexpected Markdown MIME type: ${detected}`);
  await exec('kioclient5',['--noninteractive','exec',pathToFileURL(files[3]).href],{env,timeout:30000});
  await expect(page.getByRole('tab',{name:names[3],exact:true})).toHaveAttribute('aria-selected','true',{timeout:20000});
  await expect(page.getByRole('heading',{name:'Launcher 3',exact:true})).toBeVisible();
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  for(const [i,file] of files.entries())assert.equal(await readFile(file,'utf8'),`# Launcher ${i}\n\nKeep Unicode, spaces and punctuation intact.\n`);
  assert.deepEqual(errors,[]);await page.screenshot({path:path.join(qa,'linux-desktop-launcher.png')});
  await writeFile(path.join(qa,'linux-launcher-results.json'),JSON.stringify({desktopValidated:true,gioDesktopLaunch:true,kdeMimeAssociationLaunch:true,detectedMime:detected,unicodeAndReservedPaths:true,singleInstance:true,errors,distro:await readFile('/etc/os-release','utf8')},null,2));
  console.log('PASS: installed desktop entry launches through GIO and KDE MIME association with Unicode, spaces, #, %, and &; one application window, unchanged file bytes.');
 }catch(error){await page?.screenshot({path:path.join(qa,'linux-launcher-failure.png')}).catch(()=>{});throw error;}
 finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
}
