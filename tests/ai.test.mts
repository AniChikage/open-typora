import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { AIService } from "../build/runtime/electron/ai.mjs";
import { aiConfig, aiEndpoint, aiRequest, aiResponse } from "../shared/ai.mts";
import { rewriteChanges, reviewedText, selectionCurrent } from "../src/editor/aiReview.ts";

const cases = [
  ["原文不变。", "原文不变。"],
  ["我们将在明天继续进行测试。", "我们明天继续测试。"],
  ["**保留加粗**，以及 [链接](../笔记.md)。\n", "**保留加粗**，以及 [引用](../笔记.md)。\n"],
  ["第一项保持不变\n第二项修改\n末尾保持\n", "第一项保持不变\n新的第二项\n新增一行\n末尾保持\n"],
  ["👨‍👩‍👧‍👦 和 e\u0301，中文𠮷", "👨‍👩‍👧‍👦 与 e\u0301，中文𠮷"],
  ["", "新增文字"], ["删除文字", ""],
  ["原文\n".repeat(20_000), "原文\n".repeat(19_999) + "不同尾行\n"],
];
test("review accepts/rejects exact Unicode Markdown and large selections without truncation", () => {
  for (const [original, result] of cases) {
    const changes = rewriteChanges(original, result);
    assert.equal(reviewedText(original, changes, changes.map(() => true)), result);
    assert.equal(reviewedText(original, changes, changes.map(() => false)), original);
    for (const change of changes) assert.equal(original.slice(change.from, change.to), change.before);
  }
});
test("partial review preserves unaccepted changes and every untouched source character", () => {
  const original = "错误甲。中间这段保留原来的全部内容。错误乙。", proposed = "正确甲。中间这段保留原来的全部内容。正确乙。";
  const changes = rewriteChanges(original, proposed); assert.equal(changes.length, 2);
  assert.equal(reviewedText(original, changes, [true, false]), "正确甲。中间这段保留原来的全部内容。错误乙。");
  assert.throws(() => reviewedText("已被修改", changes, [true]), /差异内容已变化/);
  const selection = { documentId: "a", source: original, from: 0, to: 3, text: original.slice(0, 3) };
  assert.equal(selectionCurrent(selection, "b", original), false);
  assert.equal(selectionCurrent(selection, "a", original + "后来输入"), false);
  assert.equal(selectionCurrent(selection, "a", original), true);
});
test("diff round trips repeated text, whitespace, escapes and seeded mixed-language edits", () => {
  let seed = 1207; const words = ["中", "文", " ", "\n", "*", "\\", "|", "é", "😀", "same", "尾"];
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  for (let n = 0; n < 120; n++) {
    const original = Array.from({ length: 25 }, () => words[next() % words.length]).join("");
    const offset = next() % original.length, result = original.slice(0, offset) + "新文字" + original.slice(offset + next() % 4);
    const changes = rewriteChanges(original, result);
    assert.equal(reviewedText(original, changes, changes.map(() => true)), result);
    assert.equal(reviewedText(original, changes, changes.map(() => false)), original);
  }
});
test("custom API endpoint normalization retains vendor prefixes and rejects secret-bearing addresses", () => {
  for (const [baseUrl, protocol, expected] of [
    ["http://localhost:1234", "openai", "http://localhost:1234/v1/chat/completions"],
    ["https://api.example.invalid/vendor/v1/", "openai", "https://api.example.invalid/vendor/v1/chat/completions"],
    ["https://api.example.invalid/custom/chat/completions", "openai", "https://api.example.invalid/custom/chat/completions"],
    ["http://127.0.0.1:11434", "ollama", "http://127.0.0.1:11434/api/chat"],
    ["http://127.0.0.1:11434/api", "ollama", "http://127.0.0.1:11434/api/chat"],
  ] as const) assert.equal(aiEndpoint(aiConfig({ baseUrl, protocol, model: "qa" })), expected);
  for (const baseUrl of ["file:///private/tmp/key", "https://user:secret@example.invalid", "https://example.invalid?key=secret", "https://example.invalid/#secret"])
    assert.throws(() => aiConfig({ baseUrl, protocol: "openai", model: "qa" }));
  assert.throws(() => aiRequest({ id: "a", instruction: "改写", text: "" }));
  assert.throws(() => aiResponse("openai", { choices: [{ finish_reason: "length", message: { content: "被截断" } }] }), /截断/);
  assert.equal(aiResponse("ollama", { message: { content: "中文\r\n保留" }, done: true }), "中文\n保留");
});
const secret = "owned-fixture-not-a-real-credential";
function protector(available = true) {
  const key = randomBytes(32);
  return { available: () => available, encrypt: (text: string) => { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv); const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    decrypt: (data: Buffer) => { const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12)); decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8"); } };
}
test("host sends bounded real HTTP requests for compatible and Ollama formats; keeps keys out of renderer and disk", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-ai-unit-"));
  const calls: { url: string; auth: string | undefined; body: Record<string, unknown> }[] = [];
  let slowReceived = () => {}; let slowStarted = new Promise<void>(resolve => { slowReceived = resolve; });
  const server = createServer(async (request, response) => {
    let text = ""; for await (const chunk of request) text += chunk;
    const body = JSON.parse(text) as Record<string, unknown>; calls.push({ url: request.url || "", auth: request.headers.authorization, body });
    if (request.url?.startsWith("/unauthorized")) { response.writeHead(401); response.end(secret); return; }
    if (request.url?.startsWith("/redirect")) { response.writeHead(302, { Location: "/collected" }); response.end(); return; }
    if (request.url?.startsWith("/large")) { response.writeHead(200, { "Content-Length": 3 * 1024 * 1024 }); response.end("x".repeat(3 * 1024 * 1024)); return; }
    if (request.url?.startsWith("/slow")) { slowReceived(); await new Promise(resolve => setTimeout(resolve, 250)); }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(request.url === "/api/chat" ? { message: { content: "你好，中国" }, done: true } : { choices: [{ finish_reason: "stop", message: { content: "你好，中国" } }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  const codec = protector(), service = new AIService(directory, codec);
  const payload = { id: "owned-test", instruction: "更简洁", text: "你好，中国。这是选区。" };
  try {
    const settings = await service.settings({ protocol: "openai", baseUrl: base + "/vendor/v1", model: "qa-model", apiKey: secret, rememberKey: true });
    assert.equal(settings.hasKey, true); assert.equal(settings.keyStorage, "system");
    assert.equal(JSON.stringify(settings).includes(secret), false); assert.equal("keyCipher" in settings, false);
    assert.equal((await readFile(path.join(directory, "ai-settings.json"), "utf8")).includes(secret), false);
    assert.equal((await new AIService(directory, codec).rewrite(payload)).text, "你好，中国");
    assert.equal(calls[0].url, "/vendor/v1/chat/completions"); assert.equal(calls[0].auth, "Bearer " + secret);
    const messages = calls[0].body.messages as { role: string; content: string }[];
    assert.deepEqual(JSON.parse(messages[1].content), { instruction: payload.instruction, selection: payload.text });
    assert.equal(calls[0].body.stream, false);
    await service.settings({ protocol: "ollama", baseUrl: base, model: "local-qa", rememberKey: false });
    assert.equal((await service.rewrite({ ...payload, id: "ollama-test" })).text, "你好，中国");
    assert.equal(calls.at(-1)!.url, "/api/chat"); assert.equal(calls.at(-1)!.auth, undefined);
    for (const [route, expected] of [["unauthorized", /HTTP 401/], ["redirect", /无法连接/], ["large", /输出过大/]] as const) {
      await service.settings({ protocol: "openai", baseUrl: base + "/" + route, model: "qa-model", apiKey: secret, rememberKey: false });
      await assert.rejects(service.rewrite({ ...payload, id: route }), error => error instanceof Error && expected.test(error.message) && !error.message.includes(secret));
    }
    assert.equal(calls.some(call => call.url === "/collected"), false);
    await service.settings({ protocol: "openai", baseUrl: base + "/slow", model: "qa-model", rememberKey: false });
    const beforeCancel = calls.length;
    const early = service.rewrite({ ...payload, id: "cancel-before-registration" }); service.cancel("cancel-before-registration"); await assert.rejects(early, /已取消/); assert.equal(calls.length, beforeCancel);
    const pending = service.rewrite({ ...payload, id: "cancelled" }); await slowStarted; service.cancel("cancelled"); await assert.rejects(pending, /已取消/);
    const unsafeDirectory = path.join(directory, "no-safe-store"), unsafe = new AIService(unsafeDirectory, protector(false));
    await assert.rejects(unsafe.settings({ protocol: "openai", baseUrl: base, model: "qa", apiKey: secret, rememberKey: true }), /安全密钥存储/);
    await unsafe.settings({ protocol: "openai", baseUrl: base, model: "qa", apiKey: secret, rememberKey: false });
    assert.equal((await unsafe.settings()).keyStorage, "session");
    assert.equal((await new AIService(unsafeDirectory, protector(false)).settings()).hasKey, false);
    for (const file of await readdir(unsafeDirectory)) assert.equal((await readFile(path.join(unsafeDirectory, file), "utf8")).includes(secret), false);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
