import { build, Platform, Arch } from "electron-builder";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };
import { licenseNotices } from "./license-notices.mjs";

if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Build Windows x64 releases on a Windows x64 machine.");
const application = path.resolve("build/windows-app");
await rm(application, { recursive: true, force: true });
await mkdir(application, { recursive: true });
for (const folder of ["dist", "electron", "shared"]) await cp(folder, path.join(application, folder), { recursive: true });
// Only the file bridge needs Node dependencies; the editor is already bundled.
for (const name of ["iconv-lite", "safer-buffer"]) await cp(`node_modules/${name}`, path.join(application, "node_modules", name), { recursive: true });
await cp("LICENSE", path.join(application, "LICENSE"));
await licenseNotices(path.join(application, "ThirdPartyLicenses"));
await cp("third-party/typora-plugins", path.join(application, "ThirdPartyLicenses/typora-plugins"), { recursive: true });
await writeFile(path.join(application, "package.json"), JSON.stringify({
  name: pkg.name, version: pkg.version, description: pkg.description,
  main: pkg.main, type: "module", license: pkg.license, author: pkg.author,
  homepage: pkg.homepage, dependencies: { "iconv-lite": pkg.dependencies["iconv-lite"] },
}, null, 2));
await build({
  targets: Platform.WINDOWS.createTarget(["nsis", "zip"], Arch.x64),
  publish: "never",
  config: {
    appId: pkg.build.appId, productName: pkg.build.productName,
    directories: { app: application, output: "release/windows" },
    files: ["**/*"], asar: true, npmRebuild: false,
    electronVersion: pkg.devDependencies.electron,
    fileAssociations: pkg.build.fileAssociations,
    win: { icon: "build/icon.ico", artifactName: "Open-Typora-${version}-windows-${arch}.${ext}" },
    nsis: {
      artifactName: "Open-Typora-${version}-windows-${arch}-Setup.${ext}",
      oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true, runAfterFinish: false,
      deleteAppDataOnUninstall: false, installerLanguages: ["en_US"],
    },
  },
});
const names = [`Open-Typora-${pkg.version}-windows-x64-Setup.exe`, `Open-Typora-${pkg.version}-windows-x64.zip`];
const sums = [];
for (const name of names) {
  const bytes = await readFile(path.join("release/windows", name));
  if (bytes.length < 1024 * 1024) throw new Error(`Unexpectedly small Windows package: ${name}`);
  sums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
await writeFile("release/windows/SHA256SUMS-windows-x64.txt", sums.join("\n") + "\n");
for (const name of await readdir("release/windows")) {
  if (/^Open-Typora-\d[\w.-]*\.(exe|zip|blockmap)$/.test(name) && !names.includes(name) && !name.startsWith(`Open-Typora-${pkg.version}-`)) await rm(path.join("release/windows", name));
}
console.log(sums.join("\n"));
