import { mkdir, cp, writeFile, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { licenseNotices } from "./license-notices.mjs";
import pkg from "../package.json" with { type: "json" };
const preview = process.argv.includes("--preview");
const app = path.resolve(
    preview
      ? "release/preview/Open Typora Preview.app"
      : "release/native/Open Typora.app",
  ),
  contents = path.join(app, "Contents"),
  resources = path.join(contents, "Resources");
await mkdir(path.join(contents, "MacOS"), { recursive: true });
await mkdir(resources, { recursive: true });
execFileSync(
  "/usr/bin/xcrun",
  [
    "swiftc",
    "-swift-version",
    "5",
    "-O",
    "-target",
    `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos14.0`,
    "native/DocumentStore.swift",
    "native/StoreTests.swift",
    "native/App.swift",
    "native/PDFExporter.swift",
    "-o",
    path.join(contents, "MacOS/OpenTypora"),
    "-framework",
    "AppKit",
    "-framework",
    "WebKit",
  ],
  { stdio: "inherit" },
);
await rm(path.join(resources, "dist"), { recursive: true, force: true });
await cp("dist", path.join(resources, "dist"), { recursive: true });
await cp("native/bridge.js", path.join(resources, "bridge.js"));
await cp("shared/samples.json", path.join(resources, "samples.json"));
await cp("shared/commands.json", path.join(resources, "commands.json"));
await cp("build/icon.icns", path.join(resources, "icon.icns"));
await cp("LICENSE", path.join(resources, "LICENSE"));
await cp(
  "node_modules/@fontsource/open-sans/LICENSE",
  path.join(resources, "Open-Sans-OFL.txt"),
);
await cp(
  "node_modules/@mathjax/src/LICENSE",
  path.join(resources, "MathJax-Apache-2.0.txt"),
);
await writeFile(
  path.join(resources, "THIRD-PARTY-NOTICES.txt"),
  "MathJax 4.1.3 and MathJax New Computer Modern font 4.1.3: Apache-2.0, https://github.com/mathjax/MathJax-src and https://github.com/mathjax/MathJax-fonts.\nOpen Sans: OFL-1.1, see Open-Sans-OFL.txt.\n",
);
await licenseNotices(path.join(resources, "ThirdPartyLicenses"));
const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>Open Typora</string><key>CFBundleDisplayName</key><string>Open Typora</string><key>CFBundleIdentifier</key><string>org.opentypora.desktop</string><key>CFBundleExecutable</key><string>OpenTypora</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>${pkg.version}</string><key>CFBundleVersion</key><string>${pkg.version}</string><key>CFBundleIconFile</key><string>icon.icns</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>CFBundleDevelopmentRegion</key><string>zh_CN</string><key>CFBundleLocalizations</key><array><string>zh_CN</string><string>en</string></array><key>NSHighResolutionCapable</key><true/><key>CFBundleDocumentTypes</key><array><dict><key>CFBundleTypeName</key><string>Markdown document</string><key>CFBundleTypeRole</key><string>Editor</string><key>CFBundleTypeExtensions</key><array><string>md</string><string>markdown</string><string>mdown</string></array></dict></array></dict></plist>`;
await writeFile(
  path.join(contents, "Info.plist"),
  preview
    ? plist
        .replaceAll("Open Typora", "Open Typora Preview")
        .replace("org.opentypora.desktop", "org.opentypora.desktop.preview")
    : plist,
);
execFileSync(
  "/usr/bin/codesign",
  ["--force", "--sign", "-", "--timestamp=none", app],
  { stdio: "inherit" },
);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], {
  stdio: "inherit",
});
console.log(`Native AppKit/WebKit bundle: ${app}`);

if (!preview) {
  const archive = path.resolve(
    `release/native/Open-Typora-${pkg.version}-${process.arch}.zip`,
  );
  execFileSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", app, archive], {
    stdio: "inherit",
  });
  // Keep only this release's archive after packaging has succeeded.
  for (const name of await readdir(path.dirname(archive))) {
    if (/^Open-Typora-[\d.]+-(?:arm64|x64)\.zip$/.test(name)
      && name !== path.basename(archive))
      await rm(path.join(path.dirname(archive), name));
  }
  console.log(`Archive: ${archive}`);
}
