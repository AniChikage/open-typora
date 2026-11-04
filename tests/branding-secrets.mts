import assert from 'node:assert/strict';
import { chromium, expect } from 'playwright/test';
import { createServer } from 'node:http';
import type { ChildProcess } from 'node:child_process';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const exec = promisify(execFile);
assert.equal(process.platform,'linux');
assert.ok(process.env.DBUS_SESSION_BUS_ADDRESS,'Run under a private dbus-run-session');
const root=await mkdtemp(path.join(os.tmpdir(),'markdown-lane-keyring-'));
for (const folder of ['runtime','keys','control','legacy','legacy-profile','current']) await mkdir(path.join(root,folder),{mode:0o700});
const env: Record<string,string>={...process.env,XDG_RUNTIME_DIR:path.join(root,'runtime'),XDG_DATA_HOME:path.join(root,'keys'),GNOME_KEYRING_CONTROL:path.join(root,'control'),OPEN_MARKDOWN_LANE_DATA_DIR:path.join(root,'current')};
delete env.ELECTRON_RUN_AS_NODE;
const daemon=spawn('gnome-keyring-daemon',['--foreground','--unlock','--components=secrets','--control-directory='+path.join(root,'control')],{env,stdio:['pipe','pipe','pipe']});
daemon.stdin.end('owned-ephemeral-keyring-password\n');
let browser: import('playwright').Browser | undefined, application: ChildProcess | undefined;
let closeServer: (()=>Promise<void>) | undefined;
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended=new Promise<void>(resolve=>child.once('exit',()=>resolve()));
  const deadline=setTimeout(()=>child.kill('SIGKILL'),2000);
  child.kill('SIGTERM');await ended;clearTimeout(deadline);
}
try {
  // --unlock creates the private login keyring but does not initialize a full
  // session. Initialize it before any D-Bus call can auto-start another daemon.
  let controlReady=false;
  for(let i=0;i<60;i++) {
    try {await stat(path.join(root,'control/control'));controlReady=true;break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(controlReady,'Owned keyring control socket was created');
  await exec('gnome-keyring-daemon',['--start','--components=secrets','--control-directory='+path.join(root,'control')],{env,timeout:10000});
  let ready=false;
  for(let i=0;i<60;i++) {
    try {await exec('gdbus',['call','--session','--dest','org.freedesktop.secrets','--object-path','/org/freedesktop/secrets','--method','org.freedesktop.DBus.Peer.Ping'],{env,timeout:2000});ready=true;break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'Private, unlocked Secret Service is available');
  const fixture=path.join(root,'legacy/main.cjs'),cipherFile=path.join(root,'cipher.bin');
  const secret='owned-rename-credential-'+path.basename(root);
  await writeFile(path.join(root,'legacy/package.json'),JSON.stringify({name:'open-typora',main:'main.cjs'}));
  await writeFile(fixture,`const {app,safeStorage}=require('electron');const fs=require('node:fs');const path=require('node:path');app.setName('Open Typora');const originalDirectory=path.basename(app.getPath('userData'));app.setPath('userData',${JSON.stringify(path.join(root,'legacy-profile'))});app.whenReady().then(()=>{if(!safeStorage.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend()!=='gnome_libsecret')throw Error('A real libsecret provider is required');fs.writeFileSync(${JSON.stringify(cipherFile)},safeStorage.encryptString(${JSON.stringify(secret)}));fs.writeFileSync(${JSON.stringify(path.join(root,'legacy-identity.json'))},JSON.stringify({originalDirectory}));app.quit();}).catch(error=>{console.error(error);app.exit(1)});`);
  await exec(path.resolve('node_modules/.bin/electron'),[path.dirname(fixture),'--password-store=gnome-libsecret'],{env,timeout:30000});
  const identity=JSON.parse(await readFile(path.join(root,'legacy-identity.json'),'utf8'));
  assert.equal(identity.originalDirectory,'Open Typora','The retained legacy data-directory name matches Electron itself');
  const ciphertext=(await readFile(cipherFile)).toString('base64');
  // The Playwright Electron launcher forces --password-store=basic. Start the
  // actual application normally and attach over loopback CDP instead.
  let requests=0, fixtureError: unknown;
  const server=createServer(async(request,response)=>{
    try {
      let body='';for await(const chunk of request)body+=chunk;
      assert.equal(request.url,'/v1/chat/completions');assert.equal(request.method,'POST');
      assert.equal(request.headers.authorization,'Bearer '+secret);
      assert.equal(JSON.parse(body).model,'owned-keyring-fixture');requests++;
      response.writeHead(200,{'Content-Type':'application/json'});
      response.end(JSON.stringify({choices:[{message:{content:'owned-credential-roundtrip'},finish_reason:'stop'}]}));
    } catch(error) {fixtureError=error;response.writeHead(500);response.end('{}');}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  closeServer=()=>new Promise<void>(resolve=>server.close(()=>resolve()));
  const baseUrl='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port+'/v1';
  await writeFile(path.join(root,'current/ai-settings.json'),JSON.stringify({version:1,protocol:'openai',baseUrl,model:'owned-keyring-fixture',keyCipher:ciphertext}),{mode:0o600});
  const endpoint=await new Promise<string>((resolve,reject)=>{
    let output='';const deadline=setTimeout(()=>reject(Error('Owned Electron CDP endpoint did not start')),30000);
    application=spawn(path.resolve('node_modules/.bin/electron'),[process.cwd(),'--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--password-store=gnome-libsecret'],{env,stdio:['ignore','ignore','pipe']});
    application.on('error',error=>{clearTimeout(deadline);reject(error);});
    application.on('exit',code=>{clearTimeout(deadline);reject(Error('Owned Electron exited before CDP: '+code));});
    application.stderr!.on('data',chunk=>{output+=chunk.toString();const found=output.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(found){clearTimeout(deadline);resolve(found[1]);}});
  });
  browser=await chromium.connectOverCDP(endpoint);
  const context=browser.contexts()[0], page=context.pages()[0] || await context.waitForEvent('page');
  await expect(page.locator('.rich-document').first()).toBeVisible({timeout:20000});
  await expect.poll(()=>page.title()).toMatch(/Open Markdown Lane/);
  const settings=await page.evaluate(()=>window.desktop!.aiSettings());
  assert.ok(settings.ok);assert.equal(settings.value.secureStorage,true);assert.equal(settings.value.keyStorage,'system');
  const result=await page.evaluate(()=>window.desktop!.aiRewrite({id:crypto.randomUUID(),instruction:'Use the owned fixture',text:'owned text'}));
  assert.ok(result.ok,result.ok?'':result.error);assert.equal(result.value.text,'owned-credential-roundtrip');
  assert.equal(fixtureError,undefined);assert.equal(requests,1);
  console.log('PASS: a normal application launch decrypts an old real-libsecret credential and authenticates exactly one owned model request; the UI uses the new name and plaintext fallback is unavailable');
} finally {
  await browser?.close();
  if(application)await stop(application);
  await closeServer?.();
  await stop(daemon);
  await rm(root,{recursive:true,force:true});
}
