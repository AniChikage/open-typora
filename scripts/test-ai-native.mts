import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawn } from "node:child_process";
const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-ai-native-"));
const calls: { url: string; authorized: boolean; format: string }[] = [];
const server = createServer(async (request, response) => {
  try {
    let data = ""; for await (const chunk of request) data += chunk;
    const body = JSON.parse(data);
    if (request.headers.authorization) assert.equal(request.headers.authorization, "Bearer owned-native-fixture-not-a-real-key" + (body.model === "edited-credential" ? "-edited" : ""));
    assert.equal(body.stream, false); assert.equal(body.messages.length, 2);
    const selection = JSON.parse(body.messages[1].content); assert.equal(typeof selection.selection, "string"); assert.equal(typeof selection.instruction, "string");
    calls.push({ url: request.url || "", authorized: !!request.headers.authorization, format: request.url === "/api/chat" ? "ollama" : "compatible" });
    if (request.url?.startsWith("/unauthorized")) { response.writeHead(401); response.end("owned-native-fixture-not-a-real-key"); return; }
    if (request.url?.startsWith("/redirect")) { response.writeHead(302, { Location: "/collected" }); response.end(); return; }
    if (request.url?.startsWith("/large")) { response.writeHead(200, { "Content-Length": 3 * 1024 * 1024 }); response.end("x".repeat(3 * 1024 * 1024)); return; }
    if (request.url?.startsWith("/slow")) await new Promise(resolve => setTimeout(resolve, 700));
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(request.url === "/api/chat" ? { message: { content: "你好，中国" }, done: true } : { choices: [{ message: { content: "你好，中国" }, finish_reason: "stop" }] }));
  } catch { response.writeHead(400); response.end("{}"); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const executable = path.join(directory, "AITransportTests");
  execFileSync("/usr/bin/xcrun", ["swiftc", "-swift-version", "5", "-target", (process.arch === "arm64" ? "arm64" : "x86_64") + "-apple-macos14.0", "native/DocumentStore.swift", "native/AI.swift", "tests/AITransportTests.swift", "-o", executable, "-framework", "AppKit"], { stdio: "inherit" });
  const base = "http://127.0.0.1:" + (server.address() as import("node:net").AddressInfo).port;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [path.join(directory, "profile"), base], { stdio: "inherit" });
    child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error("Native AI test exited " + code)));
  });
  assert.equal(calls[0].url, "/vendor/v1/chat/completions"); assert.equal(calls[0].authorized, true);
  assert.equal(calls[1].url, "/api/chat"); assert.equal(calls[1].authorized, false);
  assert.equal(calls.some(call => call.url === "/collected"), false);
  if (process.env.OPEN_TYPORA_QA_DIR) { await mkdir(process.env.OPEN_TYPORA_QA_DIR, { recursive: true }); await writeFile(path.join(process.env.OPEN_TYPORA_QA_DIR, "native-ai-transport.json"), JSON.stringify({ fixtureOnly: true, actualModelInference: false, requests: calls, passed: true }, null, 2)); }
} finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
