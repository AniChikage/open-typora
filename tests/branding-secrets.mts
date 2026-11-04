import assert from 'node:assert/strict';
import { _electron as electron, expect } from 'playwright/test';
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
let app: import('playwright').ElectronApplication | undefined;
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
  app=await electron.launch({args:[process.cwd(),'--password-store=gnome-libsecret'],env,timeout:30000});
  const page=await app.firstWindow();await expect(page.locator('.rich-document').first()).toBeVisible({timeout:20000});
  const actual=await app.evaluate(({app,safeStorage},ciphertext)=>({name:app.getName(),backend:safeStorage.getSelectedStorageBackend(),available:safeStorage.isEncryptionAvailable(),text:safeStorage.decryptString(Buffer.from(ciphertext,'base64'))}),ciphertext);
  assert.equal(actual.name,'Open Markdown Lane');
  assert.equal(actual.backend,'gnome_libsecret');assert.equal(actual.available,true);assert.equal(actual.text,secret);
  console.log('PASS: the renamed application retains a real libsecret encryption key from the old product while exposing the new application name; no plaintext fallback');
} finally {
  await app?.close();
  if (daemon.exitCode === null && daemon.signalCode === null) {
    const ended=new Promise<void>(resolve=>daemon.once('exit',()=>resolve()));
    const deadline=setTimeout(()=>daemon.kill('SIGKILL'),2000);
    daemon.kill('SIGTERM');await ended;clearTimeout(deadline);
  }
  await rm(root,{recursive:true,force:true});
}
