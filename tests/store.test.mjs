import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  mkdir,
  symlink,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DocumentStore, atomicWrite } from "../electron/store.mjs";
async function setup(text = "# 原文\n\n中文内容\n") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "open-typora-test-"));
  const file = path.join(directory, "note.md");
  await writeFile(file, text);
  const store = new DocumentStore(path.join(directory, "recovery"));
  return { store, directory, file, record: await store.open(file) };
}
test("atomic save preserves BOM, CRLF, original text and file permissions", async () => {
  const text =
    "\uFEFF---\r\ntitle: 测试\r\n---\r\n\r\n# 标题  \r\n\r\n<!-- 原始注释 -->\r\n";
  const { store, file, record } = await setup(text);
  const before = (await stat(file)).mode;
  assert.equal(record.lineEnding, "\r\n");
  await store.save(record.id, record.content);
  assert.equal(await readFile(file, "utf-8"), text);
  assert.equal((await stat(file)).mode, before);
});
test("external edits and deletion are never overwritten by ordinary save", async () => {
  const { store, file, record } = await setup();
  await writeFile(file, "外部修改");
  await assert.rejects(store.save(record.id, "我的草稿"), {
    code: "EXTERNAL_CHANGE",
  });
  assert.equal(await readFile(file, "utf-8"), "外部修改");
});
test("accepting an external encoding change updates BOM and line-ending metadata", async () => {
  const { store, file, record } = await setup();
  await writeFile(file, "\uFEFF# 外部内容\r\n");
  const change = await store.check(record.id);
  const accepted = store.acceptDisk(
    record.id,
    change.content,
    change.diskHash,
    change.bom,
  );
  assert.equal(accepted.bom, true);
  assert.equal(accepted.lineEnding, "\r\n");
  await store.save(record.id, accepted.content + "保留编码\r\n");
  assert.equal(
    await readFile(file, "utf-8"),
    "\uFEFF# 外部内容\r\n保留编码\r\n",
  );
});
test("a precommit failure leaves the original and no temporary file", async () => {
  const { file, directory } = await setup();
  const original = await readFile(file, "utf-8");
  await assert.rejects(
    atomicWrite(file, "new", () => {
      throw new Error("conflict");
    }),
    /conflict/,
  );
  assert.equal(await readFile(file, "utf-8"), original);
  assert.deepEqual(
    (await readdir(directory)).filter((name) => name.endsWith(".tmp")),
    [],
  );
});
test("concurrent saves have predictable ordering and the last content persists", async () => {
  const { store, file, record } = await setup();
  await Promise.all([
    store.save(record.id, "第一版"),
    store.save(record.id, "第二版"),
    store.save(record.id, "最后一版"),
  ]);
  assert.equal(await readFile(file, "utf-8"), "最后一版");
});
test("recovery preserves dirty content and reports conflicting disk changes", async () => {
  const { store, file, record, directory } = await setup();
  await store.persist({
    documents: [{ ...record, content: "未保存的草稿" }],
    activeId: record.id,
  });
  await writeFile(file, "外部新版本");
  const restored = await new DocumentStore(
    path.join(directory, "recovery"),
  ).restore();
  assert.equal(restored.documents[0].content, "未保存的草稿");
  assert.equal(restored.documents[0].conflict, true);
});
test("untitled documents survive session recovery", async () => {
  const { store, directory } = await setup();
  const record = store.registerDraft({
    id: "draft",
    name: "未命名.md",
    content: "草稿",
  });
  await store.persist({ documents: [record], activeId: "draft" });
  const result = await new DocumentStore(
    path.join(directory, "recovery"),
  ).restore();
  assert.equal(result.documents[0].content, "草稿");
  assert.equal(result.documents[0].path, null);
});
test("folder inventory ignores symlinks and only grants Markdown files", async () => {
  const { store, directory } = await setup();
  await writeFile(path.join(directory, "private.txt"), "not markdown");
  await symlink("/tmp", path.join(directory, "outside"));
  const result = await store.scan(directory);
  assert.equal(result.files.length, 1);
  assert.equal((await store.openToken(result.files[0].token)).name, "note.md");
  await assert.rejects(store.openToken("ungranted"));
});
test("image reads reject directory traversal and external symlinks", async () => {
  const { store, directory, record } = await setup();
  const outside = await mkdtemp(path.join(os.tmpdir(), "open-typora-outside-"));
  await writeFile(path.join(outside, "image.png"), "outside");
  await symlink(outside, path.join(directory, "linked"));
  await assert.rejects(store.asset(record.id, "linked/image.png"), /之外/);
  await symlink(outside, path.join(directory, ".assets"));
  await assert.rejects(
    store.importImage(
      record.id,
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]),
      "test.png",
    ),
    /之外/,
  );
});
test("corrupt recovery is backed up before a new session is written", async () => {
  const { store, directory } = await setup();
  const data = path.join(directory, "recovery");
  await mkdir(data);
  await writeFile(path.join(data, "session.json"), "{bad");
  const result = await store.restore();
  assert.ok(result.restoreError);
  const backup = (await readdir(data)).find((name) =>
    name.startsWith("session-backup-"),
  );
  assert.equal(await readFile(path.join(data, backup), "utf-8"), "{bad");
});
