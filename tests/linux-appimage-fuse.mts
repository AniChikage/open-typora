import {_electron as electron,expect} from 'playwright/test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,stat,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

assert.equal(process.platform,'linux');assert.notEqual(process.getuid!()!,0,'Exercise the AppImage as an ordinary user.');
const image=path.resolve(process.argv[2]||process.env.OPEN_TYPORA_APPIMAGE||'');assert.match(image,/\.AppImage$/);
assert.ok((await stat('/dev/fuse')).isCharacterDevice(),'/dev/fuse must be a real character device.');
const data=await mkdtemp(path.join(os.tmpdir(),'open-typora-real-fuse-'));
const qa=process.env.OPEN_TYPORA_QA_DIR||path.join(data,'evidence');await mkdir(qa,{recursive:true});
const profile=path.join(data,'profile');await mkdir(profile);
const file=path.join(data,'FUSE 中文 #% &.md'),original='# Real FUSE acceptance\n\nFUSE input: original 中文\n\n| Key | Value |\n| --- | --- |\n| mounted | unchanged |\n';await writeFile(file,original);
await writeFile(path.join(profile,'session.json'),JSON.stringify({version:1,activeId:'real-fuse',documents:[{id:'real-fuse',name:path.basename(file),path:file,content:original,savedContent:original,lineEnding:'\n',encoding:'utf-8',bom:false}]}));
const env: Record<string, string>={...process.env,OPEN_TYPORA_DATA_DIR:profile};for(const name of ['ELECTRON_RUN_AS_NODE','OPEN_TYPORA_DEV_URL','APPIMAGE_EXTRACT_AND_RUN','APPDIR','APPIMAGE'])delete env[name];
const mountInfo=(target: string)=>JSON.parse(execFileSync('findmnt',['--json','--target',target,'--output','TARGET,FSTYPE,SOURCE,OPTIONS'],{encoding:'utf8'})).filesystems[0];
const errors: string[]=[],checks: string[]=[];let app!: import("playwright").ElectronApplication, page!: import("playwright").Page, mounter!: import("node:child_process").ChildProcess | null, mountPath!: string, runtimeMount!: {target: string;fstype: string;source: string;options:string}, running;let mountOut='',mountErr='';
try{
 mounter=spawn(image,['--appimage-mount'],{env,stdio:['ignore','pipe','pipe']});mounter!.stdout!.on('data',chunk=>mountOut+=chunk);mounter.stderr!.on('data',chunk=>mountErr+=chunk);
 await expect.poll(()=>mountOut.trim().split('\n').find(line=>line.startsWith('/'))!,{timeout:30000}).toBeTruthy();mountPath=mountOut.trim().split('\n').find(line=>line.startsWith('/'))!;
 const manual=mountInfo(mountPath);assert.equal(manual.target,mountPath);assert.match(manual.fstype,/^fuse(?:\.|$)/);const launcher=await readFile(path.join(mountPath,'AppRun'),'utf8');assert.ok(!launcher.includes('--no-sandbox'),'The packaged launcher must not disable sandboxing.');await stat(path.join(mountPath,'open-typora'));
 checks.push('The ordinary-user AppImage runtime creates an actual FUSE filesystem, not an extracted directory.');
 const closed=once(mounter,'close');mounter.kill('SIGINT');await closed;mounter=null;await expect.poll(()=>stat(mountPath).then(()=>true,()=>false)).toBe(false);
 checks.push('The explicit FUSE mount unmounts after the runtime receives its normal interrupt.');
 app=await electron.launch({executablePath:image,args:[],env,chromiumSandbox:true,timeout:60000});page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.setViewportSize({width:1300,height:900});
 await expect(page.getByRole('heading',{name:'Real FUSE acceptance',exact:true})).toBeVisible({timeout:20000});assert.match(await page.title(),/FUSE 中文 #% &\.md — Open Typora/);
 running=await app.evaluate(({app,BrowserWindow})=>({executable:app.getPath('exe'),argv:process.argv,noSandbox:app.commandLine.hasSwitch('no-sandbox'),rendererSandbox:(BrowserWindow.getAllWindows()[0].webContents as Electron.WebContents & {getLastWebPreferences(): Electron.WebPreferences}).getLastWebPreferences().sandbox,rendererPID:BrowserWindow.getAllWindows()[0].webContents.getOSProcessId()}));
 runtimeMount=mountInfo(running.executable);assert.match(runtimeMount.fstype,/^fuse(?:\.|$)/);assert.ok(running.executable.startsWith(runtimeMount.target+'/'));assert.equal(running.noSandbox,false);assert.equal(running.rendererSandbox,true);
 const rendererStatus=await readFile('/proc/'+running.rendererPID+'/status','utf8');assert.match(rendererStatus,/^NoNewPrivs:\s+1$/m);assert.match(rendererStatus,/^Seccomp:\s+2$/m);
 checks.push('Launching the AppImage normally runs the editor from its FUSE mount with Chromium renderer sandboxing enabled.');
 await page.getByRole('button',{name:'源码',exact:true}).click();const editor=page.locator('.document-editor[data-active="true"] .source-surface .cm-content');await editor.click();await page.keyboard.press('Control+End');await page.keyboard.insertText('Saved from FUSE: 中文。');
 const modified=original+'Saved from FUSE: 中文。';await page.keyboard.press('Control+s');await expect.poll(()=>readFile(file,'utf8')).toBe(modified);await page.keyboard.press('Control+z');await page.keyboard.press('Control+s');await expect.poll(()=>readFile(file,'utf8')).toBe(original);await page.keyboard.press('Control+Shift+z');await page.keyboard.press('Control+s');await expect.poll(()=>readFile(file,'utf8')).toBe(modified);
 await page.getByRole('button',{name:'即时渲染',exact:true}).click();await expect(page.locator('.rich-document')).toContainText('Saved from FUSE: 中文。');await expect(page.locator('vite-error-overlay')).toHaveCount(0);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(qa,'real-fuse-editor.png')});
 checks.push('The mounted application opens a Unicode/reserved-character file, edits, saves, undoes, redoes and returns to live rendering with exact file bytes.');
 await app.close();app=null!;await expect.poll(()=>stat(runtimeMount.target).then(()=>true,()=>false),{timeout:15000}).toBe(false);
 checks.push('Normal editor exit releases its runtime FUSE mount.');
 await writeFile(path.join(qa,'real-fuse-results.json'),JSON.stringify({uid:process.getuid!()!,distro:await readFile('/etc/os-release','utf8'),kernel:os.release(),appImage:image,sha256:createHash('sha256').update(await readFile(image)).digest('hex'),appArmorProfile:process.env.OPEN_TYPORA_FUSE_APPARMOR||null,manualMount:manual,runtimeMount,running,rendererStatus:rendererStatus.split('\n').filter(line=>/^(Name|NoNewPrivs|Seccomp|NSpid):/.test(line)),checks,errors,fuseMountTested:true,extracted:false,sandboxDisabled:false},null,2));for(const check of checks)console.log('PASS: '+check);
}catch(error){await page?.screenshot({path:path.join(qa,'real-fuse-failure.png')}).catch(()=>{});await writeFile(path.join(qa,'real-fuse-failure.json'),JSON.stringify({error:String(error),checks,errors,mountOut,mountErr,mountPath,runtimeMount,running},null,2));console.error('REAL-FUSE-FAILURE',JSON.stringify({error:String(error),checks,mountOut,mountErr,running}));throw error;}
finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}if(mounter){mounter.kill('SIGINT');await once(mounter,'close').catch(()=>{});}}
