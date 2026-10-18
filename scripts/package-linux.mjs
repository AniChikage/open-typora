import { build, Platform, Arch } from "electron-builder";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };
import { prepareElectronApplication } from "./prepare-electron.mjs";

if (process.platform !== "linux" || process.arch !== "x64") throw new Error("Build Linux x64 releases on a Linux x64 machine.");
const application = await prepareElectronApplication("linux");
await build({
  targets: Platform.LINUX.createTarget(["deb", "AppImage"], Arch.x64),
  publish: "never",
  config: {
    appId: pkg.build.appId, productName: pkg.build.productName,
    directories: { app: application, output: "release/linux" },
    files: ["**/*"], asar: true, npmRebuild: false,
    electronVersion: pkg.devDependencies.electron,
    linux: {
      executableName: "open-typora", icon: "build/icon.png", category: "Office",
      artifactName: "Open-Typora-${version}-linux-x64.${ext}",
      maintainer: "AniChikage <15864698+AniChikage@users.noreply.github.com>",
      mimeTypes: ["text/markdown", "text/x-markdown"],
      syncDesktopName: true,
    },
  },
});
const names = [`Open-Typora-${pkg.version}-linux-x64.deb`, `Open-Typora-${pkg.version}-linux-x64.AppImage`];
const sums = [];
for (const name of names) {
  const bytes = await readFile(path.join("release/linux", name));
  if (bytes.length < 1024 * 1024) throw new Error(`Unexpectedly small Linux package: ${name}`);
  sums.push(`${createHash("sha256").update(bytes).digest("hex")}  ${name}`);
}
await writeFile("release/linux/SHA256SUMS-linux-x64.txt", sums.join("\n") + "\n");
for (const name of await readdir("release/linux")) {
  if (/^Open-Typora-\d[\w.-]*\.(deb|AppImage)$/.test(name) && !names.includes(name)) await rm(path.join("release/linux", name));
}
console.log(sums.join("\n"));
