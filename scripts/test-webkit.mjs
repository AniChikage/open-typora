import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, cp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-webkit-"));
try {
  const contents = path.join(directory, "WebKitTests.app/Contents"),
    resources = path.join(contents, "Resources"),
    executable = path.join(contents, "MacOS/WebKitTests");
  await mkdir(path.dirname(executable), { recursive: true });
  await mkdir(resources, { recursive: true });
  execFileSync(
    "/usr/bin/xcrun",
    [
      "swiftc",
      "-D",
      "WEBTEST",
      "-swift-version",
      "5",
      "native/DocumentStore.swift",
      "native/StoreTests.swift",
      "native/App.swift",
      "native/PDFExporter.swift",
      "tests/WebKitTests.swift",
      "-o",
      executable,
      "-framework",
      "AppKit",
      "-framework",
      "WebKit",
    ],
    { stdio: "inherit" },
  );
  await cp("dist", path.join(resources, "dist"), { recursive: true });
  await cp("native/bridge.js", path.join(resources, "bridge.js"));
  await cp("shared/samples.json", path.join(resources, "samples.json"));
  await cp("tests/webkit.js", path.join(resources, "web-tests.js"));
  await writeFile(
    path.join(contents, "Info.plist"),
    '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.opentypora.webkittests</string><key>CFBundleExecutable</key><string>WebKitTests</string></dict></plist>',
  );
  execFileSync(
    "/usr/bin/codesign",
    [
      "--force",
      "--sign",
      "-",
      "--timestamp=none",
      path.join(directory, "WebKitTests.app"),
    ],
    { stdio: "inherit" },
  );
  await new Promise((resolve, reject) => {
    const child = spawn(executable, {
      env: {
        ...process.env,
        OPEN_TYPORA_DATA_DIR: path.join(directory, "data"),
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`WebKit tests exited ${code}`)),
    );
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
