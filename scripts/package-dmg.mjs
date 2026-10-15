import { build, Platform, Arch } from "electron-builder";
import { readFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import pkg from "../package.json" with { type: "json" };

if (process.platform !== "darwin" || process.arch !== "arm64")
  throw new Error("The verified DMG release target is macOS on Apple Silicon.");
const app = path.resolve("release/native/Open Typora.app");
const version = execFileSync("/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", path.join(app, "Contents/Info.plist")], { encoding: "utf8" }).trim();
if (version !== pkg.version) throw new Error("Build the current native application before packaging the DMG.");
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
await mkdir("build", { recursive: true });
const background = await readFile("design/dmg-background.svg");
for (const scale of [1, 2])
  await sharp(background).resize(700 * scale, 420 * scale).png().toFile(`build/dmg-background${scale === 2 ? "@2x" : ""}.png`);
await build({
  targets: Platform.MAC.createTarget("dmg", Arch.arm64),
  prepackaged: app,
  publish: "never",
  config: {
    appId: "org.opentypora.desktop",
    productName: "Open Typora",
    directories: { output: "release/native", buildResources: "build" },
    mac: { identity: null },
    dmg: {
      title: "Open Typora ${version}",
      artifactName: "Open-Typora-${version}-arm64.dmg",
      background: "build/dmg-background.png",
      icon: "build/icon.icns",
      iconSize: 96,
      iconTextSize: 13,
      format: "UDZO",
      writeUpdateInfo: false,
      contents: [
        { x: 200, y: 220, type: "file", path: app },
        { x: 500, y: 220, type: "link", path: "/Applications" },
      ],
    },
  },
});
const folder = path.resolve("release/native");
const name = `Open-Typora-${pkg.version}-arm64.dmg`;
execFileSync("/usr/bin/hdiutil", ["verify", path.join(folder, name)], { stdio: "inherit" });
// Retain only the current version's distributable archives.
for (const entry of await readdir(folder))
  if (/^Open-Typora-[\d.]+-(?:arm64|x64)\.(?:dmg|zip)$/.test(entry) && !entry.startsWith(`Open-Typora-${pkg.version}-`))
    await rm(path.join(folder, entry));
const archives = (await readdir(folder)).filter(entry => entry === name || entry === `Open-Typora-${pkg.version}-arm64.zip`).sort();
const hashes = await Promise.all(archives.map(async entry => `${createHash("sha256").update(await readFile(path.join(folder, entry))).digest("hex")}  ${entry}`));
await writeFile(path.join(folder, "SHA256SUMS.txt"), hashes.join("\n") + "\n");
console.log(`DMG: ${path.join(folder, name)}`);
