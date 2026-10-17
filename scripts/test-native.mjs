import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const directory = await mkdtemp(
  path.join(os.tmpdir(), "open-typora-native-test-"),
);
try {
  const executable = path.join(directory, "OpenTypora");
  execFileSync(
    "/usr/bin/xcrun",
    [
      "swiftc", "-D", "STORETEST", "-target", `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos14.0`,
      "-swift-version",
      "5",
      "native/DocumentStore.swift",
    "native/Workspace.swift",
    "native/Interchange.swift",
    "native/ImageActions.swift",
      "native/StoreTests.swift",
      "tests/WindowChromeTests.swift",
      "native/App.swift",
    "native/PDFExporter.swift",
      "-o",
      executable,
      "-framework",
      "AppKit",
      "-framework",
      "WebKit",
    ],
    { stdio: "inherit" },
  );
  execFileSync(executable, ["--store-test"], { stdio: "inherit" });
} finally {
  await rm(directory, { recursive: true, force: true });
}
