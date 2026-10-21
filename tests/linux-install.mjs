import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
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
  for (const file of ["desktop.mjs","electron-shell.mjs","parity-desktop.mjs","workspace-desktop.mjs","compatibility-desktop.mjs","ime-desktop.mjs","plugin-package-desktop.mjs"]) run(process.execPath,[`tests/${file}`],{env});
  const {dataDir} = JSON.parse(await readFile(path.join(evidence,"desktop-results.json"),"utf8"));
  const session = path.join(dataDir,"session.json");
  return {session,hash:createHash("sha256").update(await readFile(session)).digest("hex")};
};
const deb = path.resolve(`release/linux/Open-Typora-${pkg.version}-linux-x64.deb`);
run("sudo",["apt-get","install","-y",deb]);
const installed = "/opt/Open Typora/open-typora";
await stat(installed);
const desktop = await readFile("/usr/share/applications/open-typora.desktop","utf8");
assert.match(desktop,/Exec=.*open-typora.*%[fFuU]/);
assert.match(desktop,/MimeType=.*text\/markdown/);
const retained = await exercise(installed,"deb");
run("sudo",["apt-get","remove","-y","open-typora"]);
await assert.rejects(stat(installed),{code:"ENOENT"});
assert.equal(createHash("sha256").update(await readFile(retained.session)).digest("hex"),retained.hash);

// Extract the AppImage to test its actual payload without requiring FUSE on a
// headless runner. Do not disable Chromium's sandbox in either distribution.
const image = path.resolve(`release/linux/Open-Typora-${pkg.version}-linux-x64.AppImage`);
const extraction = await mkdtemp(path.join(os.tmpdir(),"open-typora-appimage-"));
run(image,["--appimage-extract"],{cwd:extraction,stdio:"ignore"});
const sandbox = path.join(extraction,"squashfs-root/chrome-sandbox");
run("sudo",["chown","root:root",sandbox]); run("sudo",["chmod","4755",sandbox]);
await exercise(path.join(extraction,"squashfs-root/open-typora"),"appimage");
await writeFile(path.join(qa,"installer-results.json"),JSON.stringify({version:pkg.version,debInstall:true,debUninstall:true,recoveryPreserved:true,desktopAssociation:true,appImageExtractedPayload:true,fuseMountTested:false,sandboxDisabled:false},null,2));
console.log("PASS: installed DEB, AppImage payload, PDF/edit/save/recovery, file association and uninstall");
