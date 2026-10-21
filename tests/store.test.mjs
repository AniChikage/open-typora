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
  chmod,
  rm,
  realpath,
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
  await symlink(os.tmpdir(), path.join(directory, "outside"), process.platform === "win32" ? "junction" : "dir");
  const result = await store.scan(directory);
  assert.equal(result.files.length, 1);
  assert.equal((await store.openToken(result.files[0].token)).name, "note.md");
  await assert.rejects(store.openToken("ungranted"));
});
test("image reads reject directory traversal and external symlinks", async () => {
  const { store, directory, record } = await setup();
  const outside = await mkdtemp(path.join(os.tmpdir(), "open-typora-outside-"));
  await writeFile(path.join(outside, "image.png"), "outside");
  await symlink(outside, path.join(directory, "linked"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(store.asset(record.id, "linked/image.png"), /之外/);
  await symlink(outside, path.join(directory, ".assets"), process.platform === "win32" ? "junction" : "dir");
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

test("failed folder scans preserve the previous root and file tokens", async t => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "open-typora-scan-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "note.md"); await writeFile(file, "# retained");
  const store = new DocumentStore(path.join(directory, "data")), inventory = await store.scan(directory);
  for (const invalid of [file, path.join(directory, "missing")]) {
    await assert.rejects(store.scan(invalid));
    assert.equal(store.folder, directory);
    assert.deepEqual([...store.fileTokens.keys()], inventory.files.map(file => file.token));
    assert.equal((await store.openToken(inventory.files[0].token)).content, "# retained");
  }
  assert.equal((await store.scan()).folder, directory, "a rejected scan does not poison the scan queue");
});
test("concurrent folder switches and refreshes commit in request order", async t => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "open-typora-scan-order-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const a = path.join(directory, "a"), b = path.join(directory, "b");
  await mkdir(a); await mkdir(b); await writeFile(path.join(a, "a.md"), "A"); await writeFile(path.join(b, "b.md"), "B");
  const store = new DocumentStore(path.join(directory, "data"));
  const [first, second, refreshed] = await Promise.all([store.scan(a), store.scan(b), store.scan()]);
  assert.deepEqual([first.folder, second.folder, refreshed.folder, store.folder], [a, b, b, b]);
  assert.deepEqual([...store.fileTokens.keys()], second.files.map(file => file.token));
  assert.equal((await store.openToken(refreshed.files[0].token)).content, "B");
});
test("unreadable subfolders retain readable siblings and recover on refresh", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async t => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "open-typora-scan-permissions-")));
  const locked = path.join(directory, "a-locked"), readable = path.join(directory, "b-readable");
  t.after(async () => { await chmod(locked, 0o700); await rm(directory, { recursive: true, force: true }); });
  await mkdir(locked); await mkdir(readable);
  await writeFile(path.join(locked, "private.md"), "hidden"); await writeFile(path.join(readable, "note.md"), "# readable");
  await chmod(locked, 0);
  const store = new DocumentStore(path.join(directory, "data")), inventory = await store.scan(directory);
  assert.equal(inventory.skipped, 1); assert.equal(inventory.truncated, false);
  assert.ok(inventory.files.some(file => file.relative === path.join("b-readable", "note.md")));
  assert.ok(!inventory.files.some(file => file.name === "private.md"));
  const note = inventory.files.find(file => file.name === "note.md");
  assert.equal((await store.openToken(note.token)).content, "# readable");
  await chmod(locked, 0o700);
  const refreshed = await store.scan();
  assert.equal(refreshed.skipped, 0); assert.ok(refreshed.files.some(file => file.name === "private.md"));
});
test("ignored files beyond the inventory limit do not falsely report truncation", async t => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "open-typora-scan-limit-")));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (let start = 0; start < 1000; start += 100)
    await Promise.all(Array.from({length: 100}, (_, i) => writeFile(path.join(directory, `note-${start + i}.md`), "")));
  await writeFile(path.join(directory, "z-ignored.txt"), "ignored");
  const store = new DocumentStore(path.join(directory, "data")), inventory = await store.scan(directory);
  assert.equal(inventory.files.length, 1000); assert.equal(inventory.truncated, false);
  await writeFile(path.join(directory, "z-extra.md"), "extra");
  assert.equal((await store.scan()).truncated, true);
});

test("document order, active tab and split layout survive session recovery", async () => {
  const {store,record,directory}=await setup();
  const second=store.registerDraft({id:"second-tab",name:"Second.md",content:"unsaved second"});
  const workspace={primaryId:record.id,secondaryId:second.id,direction:"rows",ratio:.63};
  await store.persist({documents:[second,record],activeId:second.id,workspace});
  const restored=await new DocumentStore(path.join(directory,"recovery")).restore();
  assert.deepEqual(restored.documents.map(item=>item.id),[second.id,record.id]);assert.equal(restored.activeId,second.id);assert.deepEqual(restored.workspace,workspace);
  await store.persist({documents:[record,second],activeId:record.id,workspace:null});
  assert.equal((await new DocumentStore(path.join(directory,"recovery")).restore()).workspace,null);
});

test("reopening an untitled tab restores its clean content without reading a null path", async () => {
  const {store}=await setup(); const draft=store.registerDraft({id:"closed-draft",name:"Untitled.md",content:"discarded content"});
  const reopened=await store.reopen(draft.id);assert.equal(reopened.path,null);assert.equal(reopened.content,"");assert.equal(store.require(draft.id).content,"");
  await assert.rejects(store.reopen("unknown"));
});
