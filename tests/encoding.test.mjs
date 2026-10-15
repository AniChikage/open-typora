import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DocumentStore, encodeText, decodeText, encodings } from "../electron/store.mjs";
test("legacy and Unicode byte roundtrips preserve BOM and CRLF", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-encoding-"));
  try {
    const store = new DocumentStore(directory);
    for (const encoding of encodings) for (const bom of [false, true].filter(b => !b || encoding.startsWith("utf-"))) {
      const text = encoding === "windows-1252" ? "# Café €\r\n" : encoding === "shift_jis" ? "# 日本語\r\n" : "# 中文測試\r\n";
      const file = path.join(directory, `${encoding}-${bom}.md`); await writeFile(file, encodeText(text, encoding, bom));
      const record = await store.open(file, false, bom || encoding === "utf-8" ? undefined : encoding);
      assert.equal(record.content, text); assert.equal(record.encoding, encoding); assert.equal(record.bom, bom);
      await store.save(record.id, text + "OK"); assert.deepEqual(await readFile(file), encodeText(text + "OK", encoding, bom));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test("lossy conversion fails before writing; external conflict blocks recoding", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-recode-"));
  try { const file = path.join(directory, "note.md"); await writeFile(file, "original"); const store = new DocumentStore(directory), record = await store.open(file);
    await assert.rejects(store.save(record.id, "中文😀", undefined, false, { encoding: "windows-1252" }), { code: "ENCODING_LOSS" }); assert.equal(await readFile(file, "utf8"), "original"); assert.equal(store.require(record.id).encoding, "utf-8");
    await store.save(record.id, "中文😀\r\n", undefined, false, { encoding: "utf-16be", bom: true });
    await store.persist({ documents: [store.require(record.id)], activeId: record.id }); const restored = await new DocumentStore(directory).restore(); assert.equal(restored.documents[0].encoding, "utf-16be"); assert.equal(restored.documents[0].content, "中文😀\r\n");
    await writeFile(file, encodeText("外部 GBK", "gbk")); await assert.rejects(store.save(record.id, "overwrite", undefined, false, { encoding: "gbk" }), { code: "EXTERNAL_CHANGE" });
    const reopened = await store.reload(record.id, "gbk"); assert.equal(reopened.content, "外部 GBK"); assert.equal(reopened.encoding, "gbk");
    assert.throws(() => decodeText(Buffer.from([0xff, 0x00, 0x01])), { code: "INVALID_ENCODING" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("untitled image survives first save and is readable from its persisted reference", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-draft-image-"));
  try { const store = new DocumentStore(directory), record = store.registerDraft({ id: "../opaque-id", content: "", name: "图片.md" });
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=', 'base64');
    const reference = await store.importImage(record.id, bytes, '中文.png'); assert.ok(reference.startsWith(await realpath(directory)));
    const file = path.join(directory, "saved.md"); await store.save(record.id, `![图片](${reference})`, file); assert.deepEqual(await readFile(await store.asset(record.id, reference)), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
