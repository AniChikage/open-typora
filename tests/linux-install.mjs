import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pkg from "../package.json" with {type:"json"};

assert.equal(process.platform,"linux");
const qa = process.env.OPEN_TYPORA_QA_DIR || path.join(os.tmpdir(),"open-typora-linux-qa");
await mkdir(qa,{recursive:true});
const run = (command,args,options={}) => execFileSync(command,args,{stdio:"inherit",...options});
const exercise = async (executable,kind) => {
  const evidence = path.join(qa,kind); await mkdir(evidence,{recursive:true});
  const env = {...process.env, OPEN_TYPORA_EXECUTABLE:executable, OPEN_TYPORA_QA_DIR:evidence};
  for (const file of ["context-menu-desktop.mjs","community-plugins-desktop.mjs","desktop.mjs","electron-shell.mjs","parity-desktop.mjs","indentation-desktop.mjs","workspace-desktop.mjs","next-desktop.mjs","huge-blocks-desktop.mjs","compatibility-desktop.mjs","ime-desktop.mjs","plugin-package-desktop.mjs"]) run(process.execPath,[`tests/${file}`],{env});
  const {dataDir} = JSON.parse(await readFile(path.join(evidence,"desktop-results.json"),"utf8"));
  const session = path.join(dataDir,"session.json");
  return {session,hash:createHash("sha256").update(await readFile(session)).digest("hex")};
};
const deb = path.resolve(`release/linux/Open-Typora-${pkg.version}-linux-x64.deb`);
// Exercise the earlier spaced-path package, then the most recent public release.
const previous = path.join(await mkdtemp(path.join(os.tmpdir(),"open-typora-upgrade-")),"Open-Typora-0.13.1-linux-x64.deb");
run("curl",["--fail","--location","--silent","--show-error","--retry","3","--max-time","180","https://github.com/AniChikage/open-typora/releases/download/v0.13.1/Open-Typora-0.13.1-linux-x64.deb","--output",previous]);
assert.equal(createHash("sha256").update(await readFile(previous)).digest("hex"),"67233be54a825da057d2163e627c56e8bd5af8530eff1afb5aaf2c21fd0e71c2");
run("sudo",["apt-get","install","-y",previous]);
await stat("/opt/Open Typora/open-typora");
const recent = path.join(path.dirname(previous),"Open-Typora-0.15.0-linux-x64.deb");
run("curl",["--fail","--location","--silent","--show-error","--retry","3","--max-time","180","https://github.com/AniChikage/open-typora/releases/download/v0.15.0/Open-Typora-0.15.0-linux-x64.deb","--output",recent]);
assert.equal(createHash("sha256").update(await readFile(recent)).digest("hex"),"807fcdfdbf8a2976411b1938bbebc050c2cf8ee0af548e395602ee42004e010b");
run("sudo",["apt-get","install","-y",recent]);
await assert.rejects(stat("/opt/Open Typora/open-typora"),{code:"ENOENT"});
run("sudo",["apt-get","install","-y",deb]);
await rm(recent);
await assert.rejects(stat("/opt/Open Typora/open-typora"),{code:"ENOENT"});
await rm(previous);
const installed = "/opt/Open-Typora/open-typora";
await stat(installed);
const desktop = await readFile("/usr/share/applications/open-typora.desktop","utf8");
assert.match(desktop,/Exec=.*open-typora.*%[fFuU]/);
assert.match(desktop,/MimeType=.*text\/markdown/);
run(process.execPath,["tests/linux-launcher.mjs"],{env:{...process.env,OPEN_TYPORA_EXECUTABLE:installed,OPEN_TYPORA_QA_DIR:path.join(qa,"desktop-launcher")}});
const retained = await exercise(installed,"deb");
run("sudo",["apt-get","remove","-y","open-typora"]);
await assert.rejects(stat(installed),{code:"ENOENT"});
await assert.rejects(stat("/usr/share/mime/packages/open-typora.xml"),{code:"ENOENT"});
assert.equal(createHash("sha256").update(await readFile(retained.session)).digest("hex"),retained.hash);

// Extract the AppImage to test its actual payload without requiring FUSE on a
// headless runner. Do not disable Chromium's sandbox in either distribution.
const image = path.resolve(`release/linux/Open-Typora-${pkg.version}-linux-x64.AppImage`);
const extraction = await mkdtemp(path.join(os.tmpdir(),"open-typora-appimage-"));
run(image,["--appimage-extract"],{cwd:extraction,stdio:"ignore"});
const sandbox = path.join(extraction,"squashfs-root/chrome-sandbox");
run("sudo",["chown","root:root",sandbox]); run("sudo",["chmod","4755",sandbox]);
await exercise(path.join(extraction,"squashfs-root/open-typora"),"appimage");
run(process.execPath,["tests/linux-appimage-fuse.mjs",image],{env:{...process.env,OPEN_TYPORA_QA_DIR:path.join(qa,"appimage-real-fuse")}});
await writeFile(path.join(qa,"installer-results.json"),JSON.stringify({version:pkg.version,debInstall:true,upgradeFrom:["0.13.1","0.15.0"],oldInstallPathRemoved:true,desktopGioAndKdeLaunch:true,debUninstall:true,recoveryPreserved:true,desktopAssociation:true,appImageExtractedPayload:true,fuseMountTested:true,sandboxDisabled:false},null,2));
console.log("PASS: installed DEB, real FUSE AppImage runtime and extracted payload, PDF/edit/save/recovery, file association and uninstall");
