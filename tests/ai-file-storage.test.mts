import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import os from "node:os";
import { AIService } from "../build/runtime/electron/ai.mjs";

const unusedProtector = {
  available(): boolean { throw new Error("File credentials must not access system storage"); },
  encrypt(): Buffer { throw new Error("File credentials must not encrypt with system storage"); },
  decrypt(): string { throw new Error("File credentials must not decrypt with system storage"); },
};

test("file credentials survive restart without system storage, stay out of bridge metadata, and honor session/endpoint/clear semantics", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-ai-file-"));
  const secret = "owned-file-fixture-not-a-real-key", authorizations: (string | undefined)[] = [];
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Drain this owned request. */ }
    authorizations.push(request.headers.authorization);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "已润色" }, finish_reason: "stop" }] }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const config = { protocol: "openai" as const, baseUrl: "http://127.0.0.1:" + (server.address() as AddressInfo).port + "/v1", model: "owned-fixture" };
  const payload = { id: "file-after-restart", instruction: "润色", text: "公开选区" };
  try {
    const service = new AIService(directory, unusedProtector, "file");
    assert.equal((await service.settings()).persistentStorage, "file");
    const saved = await service.settings({ ...config, apiKey: secret, rememberKey: true });
    assert.equal(saved.keyStorage, "file"); assert.equal(saved.secureStorage, false);
    assert.equal(JSON.stringify(saved).includes(secret), false);
    assert.equal("apiKey" in saved, false);
    const file = path.join(directory, "ai-settings.json");
    assert.equal(JSON.parse(await readFile(file, "utf8")).apiKey, secret);
    assert.equal((await new AIService(directory, unusedProtector, "file").rewrite(payload)).text, "已润色");
    assert.equal(authorizations.at(-1), "Bearer " + secret);
    const edited = JSON.parse(await readFile(file, "utf8")); edited.apiKey = secret + "-edited";
    await writeFile(file, JSON.stringify(edited));
    await service.rewrite({ ...payload, id: "external-config-edit" });
    assert.equal(authorizations.at(-1), "Bearer " + secret + "-edited");
    edited.apiKey = secret; await writeFile(file, JSON.stringify(edited));
    if (process.platform !== "win32") {
      await chmod(file, 0o644);
      await service.settings({ ...config, rememberKey: true });
      assert.equal((await stat(file)).mode & 0o777, 0o600);
    }
    const transient = await service.settings({ ...config, rememberKey: false });
    assert.equal(transient.keyStorage, "session");
    assert.equal((await readFile(file, "utf8")).includes(secret), false);
    assert.equal((await new AIService(directory, unusedProtector, "file").settings()).hasKey, false);
    await service.rewrite({ ...payload, id: "file-session" });
    assert.equal(authorizations.at(-1), "Bearer " + secret);
    await service.settings({ ...config, rememberKey: true });
    const other = await service.settings({ ...config, baseUrl: config.baseUrl + "/other", rememberKey: true });
    assert.equal(other.hasKey, false);
    await service.rewrite({ ...payload, id: "changed-endpoint" });
    assert.equal(authorizations.at(-1), undefined);
    await service.settings({ ...config, apiKey: secret, rememberKey: true });
    const cleared = await service.settings({ ...config, clearKey: true, rememberKey: true });
    assert.equal(cleared.hasKey, false); assert.equal(cleared.keyStorage, "none");
    assert.equal((await readFile(file, "utf8")).includes(secret), false);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("legacy encrypted credentials require explicit migration in file mode and are never consulted after migration", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-ai-file-legacy-"));
  const secret = "owned-legacy-fixture", config = { protocol: "openai" as const, baseUrl: "http://127.0.0.1:1234/v1", model: "owned-fixture" };
  let calls = 0;
  const codec = { available: () => { calls++; return true; }, encrypt: (value: string) => Buffer.from(value), decrypt: (bytes: Buffer) => { calls++; return bytes.toString(); } };
  try {
    await new AIService(directory, codec).settings({ ...config, apiKey: secret, rememberKey: true });
    calls = 0;
    const service = new AIService(directory, codec, "file");
    assert.equal((await service.settings()).needsKeyMigration, true); assert.equal(calls, 0);
    await assert.rejects(service.rewrite({ id: "legacy-blocked", instruction: "润色", text: "公开选区" }), /迁移旧密钥/);
    await assert.rejects(service.settings({ ...config, rememberKey: true }), /迁移旧密钥/);
    assert.equal(calls, 0);
    const migrated = await service.settings({ ...config, rememberKey: true, migrateLegacyKey: true });
    assert.equal(migrated.keyStorage, "file"); assert.equal(migrated.needsKeyMigration, false);
    assert.equal(calls, 2);
    const stored = JSON.parse(await readFile(path.join(directory, "ai-settings.json"), "utf8"));
    assert.equal(stored.apiKey, secret); assert.equal(stored.keyCipher, undefined);
    const reopened = await new AIService(directory, unusedProtector, "file").settings();
    assert.equal(reopened.keyStorage, "file"); assert.equal(reopened.hasKey, true);
    assert.equal(JSON.stringify(reopened).includes(secret), false);
    assert.equal(calls, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
