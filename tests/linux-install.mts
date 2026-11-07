import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdir, mkdtemp, stat, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pkg from "../package.json" with {type:"json"};

assert.equal(process.platform,"linux");
const qa = process.env.OPEN_MARKDOWN_LANE_QA_DIR || path.join(os.tmpdir(),"open-markdown-lane-linux-qa");
await mkdir(qa,{recursive:true});
const run = (command: string,args: string[],options={}) => execFileSync(command,args,{stdio:"inherit",...options});
const exercise = async (executable: string,kind: string) => {
  const evidence = path.join(qa,kind); await mkdir(evidence,{recursive:true});
  const env: Record<string, string> = {...process.env, OPEN_MARKDOWN_LANE_EXECUTABLE:executable, OPEN_MARKDOWN_LANE_QA_DIR:evidence};
  for (const file of ["issues-desktop.mts","batch-desktop.mts","knowledge-desktop.mts","ai-desktop.mts","spreadsheet-desktop.mts","context-menu-desktop.mts","community-plugins-desktop.mts","desktop.mts","alignment-desktop.mts","electron-shell.mts","parity-desktop.mts","indentation-desktop.mts","workspace-desktop.mts","next-desktop.mts","huge-blocks-desktop.mts","compatibility-desktop.mts","ime-desktop.mts","plugin-package-desktop.mts"]) run(process.execPath,[`tests/${file}`],{env});
  const {dataDir} = JSON.parse(await readFile(path.join(evidence,"desktop-results.json"),"utf8"));
  const session = path.join(dataDir,"session.json");
  return {session,hash:createHash("sha256").update(await readFile(session)).digest("hex")};
};
const deb = path.resolve(`release/linux/Open-Markdown-Lane-${pkg.version}-linux-x64.deb`);
// CI resolves and verifies the current public installer before this test.
const previous = JSON.parse(await readFile("build/upgrade-fixtures/linux.json", "utf8"));
assert.equal(createHash("sha256").update(await readFile(previous.file)).digest("hex"), previous.sha256);
run("sudo",["apt-get","install","-y",previous.file]);
await stat(previous.legacyName ? "/opt/Open-Typora/open-typora" : "/opt/Open-Markdown-Lane/open-markdown-lane");
// Reinstall even at an equal version: exercise the freshly built bytes.
run("sudo",["apt-get","install","--reinstall","-y",deb]);
await assert.rejects(stat("/opt/Open-Typora/open-typora"),{code:"ENOENT"});
await assert.rejects(stat("/opt/Open Typora/open-typora"),{code:"ENOENT"});
await rm(previous.file);
const installed = "/opt/Open-Markdown-Lane/open-markdown-lane";
await stat(installed);
const desktop = await readFile("/usr/share/applications/open-markdown-lane.desktop","utf8");
assert.match(desktop,/Exec=.*open-markdown-lane.*%[fFuU]/);
assert.match(desktop,/MimeType=.*text\/markdown/);
run(process.execPath,["tests/linux-launcher.mts"],{env:{...process.env,OPEN_MARKDOWN_LANE_EXECUTABLE:installed,OPEN_MARKDOWN_LANE_QA_DIR:path.join(qa,"desktop-launcher")}});
const retained = await exercise(installed,"deb");
run("sudo",["apt-get","remove","-y","open-markdown-lane"]);
await assert.rejects(stat(installed),{code:"ENOENT"});
await assert.rejects(stat("/usr/share/mime/packages/open-markdown-lane.xml"),{code:"ENOENT"});
assert.equal(createHash("sha256").update(await readFile(retained.session)).digest("hex"),retained.hash);

// Extract the AppImage to test its actual payload without requiring FUSE on a
// headless runner. Do not disable Chromium's sandbox in either distribution.
const image = path.resolve(`release/linux/Open-Markdown-Lane-${pkg.version}-linux-x64.AppImage`);
const extraction = await mkdtemp(path.join(os.tmpdir(),"open-markdown-lane-appimage-"));
run(image,["--appimage-extract"],{cwd:extraction,stdio:"ignore"});
const sandbox = path.join(extraction,"squashfs-root/chrome-sandbox");
run("sudo",["chown","root:root",sandbox]); run("sudo",["chmod","4755",sandbox]);
await exercise(path.join(extraction,"squashfs-root/open-markdown-lane"),"appimage");
run(process.execPath,["tests/linux-appimage-fuse.mts",image],{env:{...process.env,OPEN_MARKDOWN_LANE_QA_DIR:path.join(qa,"appimage-real-fuse")}});
await writeFile(path.join(qa,"installer-results.json"),JSON.stringify({version:pkg.version,debInstall:true,upgradeFrom:previous.tag,oldInstallPathRemoved:true,desktopGioAndKdeLaunch:true,debUninstall:true,recoveryPreserved:true,desktopAssociation:true,appImageExtractedPayload:true,fuseMountTested:true,sandboxDisabled:false},null,2));
console.log("PASS: installed DEB, real FUSE AppImage runtime and extracted payload, PDF/edit/save/recovery, file association and uninstall");
