import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, cp, writeFile, rm, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import assert from "node:assert/strict";
const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-webkit-"));
const uploads = [];
const clipboardOnly = process.argv.includes("--clipboard");
const aiOnly = process.argv.includes("--ai");
const aiRequests: string[] = [];
const server = createServer(async (request, response) => {
  try { let body = ""; for await (const chunk of request) body += chunk; const value = JSON.parse(body); if (aiOnly) { assert.equal(request.method,"POST"); assert.equal(request.url,"/owned/v1/chat/completions"); assert.equal(request.headers.authorization,"Bearer owned-fixture-only"); const user = JSON.parse(value.messages[1].content); aiRequests.push(user.selection); const text = user.instruction.includes("连接成功") ? "连接成功" : user.selection.replace("普通","自然").replace("粗体","加粗").replace("A","甲"); response.writeHead(200,{"Content-Type":"application/json"}); response.end(JSON.stringify({choices:[{message:{content:text},finish_reason:"stop"}]})); return; } assert.equal(request.method, "POST"); assert.equal(value.list.length, 1); const file = value.list[0]; assert.match(file, /fixture-[A-Fa-f0-9-]+\.png$/); const bytes = await readFile(file); assert.deepEqual([...bytes.subarray(0, 8)], [137,80,78,71,13,10,26,10]); uploads.push({ bytes: bytes.length }); response.writeHead(200, {"Content-Type":"application/json"}); response.end(JSON.stringify({success:true,result:["https://images.example.invalid/owned-fixture.png"]})); }
  catch (error) { response.writeHead(400); response.end(JSON.stringify({error:(error as Error).message})); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const uploaderURL = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/upload`;

try {
  const contents = path.join(directory, "WebKitTests.app/Contents"),
    resources = path.join(contents, "Resources"),
    executable = path.join(contents, "MacOS/WebKitTests");
  await mkdir(path.dirname(executable), { recursive: true });
  await mkdir(resources, { recursive: true });
  execFileSync(
    "/usr/bin/xcrun",
    [
      "swiftc", "-target", `${process.arch === "arm64" ? "arm64" : "x86_64"}-apple-macos14.0`,
      "-D",
      "WEBTEST",
      "-swift-version",
      "5",
      "native/DocumentStore.swift",
    "native/Workspace.swift",
    "native/Interchange.swift",
    "native/ImageActions.swift",
    "native/AI.swift",
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
  await writeFile(path.join(resources, "bridge.js"), (await readFile("build/runtime/native/bridge.js", "utf8")).replace('"restore",', '"testRecovery", "testSpreadsheetClipboard", "restore",'));
  await cp("shared/samples.json", path.join(resources, "samples.json"));
  await cp("shared/commands.json", path.join(resources, "commands.json"));
  await cp("build/runtime/shared/plugin-loader.mjs", path.join(resources, "plugin-loader.js"));
  await cp("tests/fixtures/plugin-package", path.join(resources, "Plugin-package-fixture"), {recursive:true});
  await writeFile(path.join(resources, "web-tests.js"), aiOnly ? (await readFile("build/runtime/tests/webkit-ai.js", "utf8")) + "\nreturn runWebKitAITests(uploaderURL.replace(\"/upload\",\"/owned/v1\"));\n" : clipboardOnly ? (await readFile("build/runtime/tests/webkit-clipboard.js", "utf8")) + "\nreturn runWebKitClipboardTests();\n" : (await readFile("build/runtime/tests/webkit.js", "utf8")) + "\nreturn runWebKitTests(uploaderURL);\n");
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
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, {
      env: {
        ...process.env,
        OPEN_TYPORA_DATA_DIR: path.join(directory, "data"),
        OPEN_TYPORA_AI_SETTINGS_DIR: path.join(directory, "data"),
        OPEN_TYPORA_TEST_UPLOADER: uploaderURL,
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`WebKit tests exited ${code}`)),
    );
  });
  if (aiOnly) { assert.equal(aiRequests.length,4); assert.deepEqual(aiRequests,["你好","普通","粗体","A"]); assert.equal((await readFile(path.join(directory,"data/ai-settings.json"),"utf8")).includes("owned-fixture-only"),false); console.log("PASS: native AI UI reaches actual URLSession fixture, sends only selected text and never stores a plaintext key"); }
  if (!clipboardOnly && !aiOnly) assert.equal(uploads.length, 1, "native PicGo request reaches the owned HTTP fixture once");
  if (!clipboardOnly && !aiOnly) console.log("PASS: native PicGo integration sends owned PNG bytes and accepts the returned URL");
  if (!clipboardOnly && !aiOnly && process.env.OPEN_TYPORA_QA_DIR) {
    await mkdir(process.env.OPEN_TYPORA_QA_DIR, { recursive: true });
    await cp(path.join(directory, "data/native-test-long.pdf"), path.join(process.env.OPEN_TYPORA_QA_DIR, "native-pagination.pdf"));
    for (const name of await readdir(path.join(directory, "data"))) if ((name.startsWith("native-converted.") || ["native-complex.pdf", "native-controlled.pdf", "native-tableheaders.pdf"].includes(name))) await cp(path.join(directory, "data", name), path.join(process.env.OPEN_TYPORA_QA_DIR, name), { recursive: true });
  }
} finally {
  await new Promise(resolve => server.close(resolve));
  if (process.env.OPEN_TYPORA_QA_DIR) { try { for (const name of await readdir(path.join(directory, "data"))) if ((name.startsWith("native-converted.") || ["native-complex.pdf", "native-controlled.pdf", "native-tableheaders.pdf"].includes(name))) await cp(path.join(directory, "data", name), path.join(process.env.OPEN_TYPORA_QA_DIR, name), { recursive: true }); } catch {} await mkdir(process.env.OPEN_TYPORA_QA_DIR, { recursive: true }); try { await cp(path.join(directory, "data/native-test-long.pdf"), path.join(process.env.OPEN_TYPORA_QA_DIR, "native-pagination.pdf")); } catch {} }
  await rm(directory, { recursive: true, force: true });
}
