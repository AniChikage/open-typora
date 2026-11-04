import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { installBundle } from "../scripts/install.mts";

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "open-markdown-lane-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.app"), folder = path.join(root, "Applications"), destination = path.join(folder, "Open Markdown Lane.app"), rollback = path.join(folder, ".Open Markdown Lane-rollback.app");
  for (const [file, version] of [[source, "new"], [destination, "old"]]) {
    await mkdir(path.join(file, "Contents"), { recursive: true });
    await writeFile(path.join(file, "Contents/version"), version);
  }
  const options = { source, destination, sign: async () => {}, verify: async (file: string) => { await readFile(path.join(file, "Contents/version")); } };
  return { root, source, folder, destination, rollback, options, version: () => readFile(path.join(destination, "Contents/version"), "utf8") };
}

test("install replaces the bundle without retaining old versions or staging", async t => {
  const f = await fixture(t);
  await installBundle(f.options);
  assert.equal(await f.version(), "new");
  assert.deepEqual(await readdir(f.folder), ["Open Markdown Lane.app"]);
});

test("post-install verification failure restores the exact old bundle", async t => {
  const f = await fixture(t);
  await assert.rejects(installBundle({ ...f.options, verify: async (file: string) => {
    if (file === f.destination) throw new Error("verification failed");
    await f.options.verify(file);
  } }), /verification failed/);
  assert.equal(await f.version(), "old");
  assert.deepEqual(await readdir(f.folder), ["Open Markdown Lane.app"]);
});

test("staging failure leaves the installed bundle intact", async t => {
  const f = await fixture(t);
  await assert.rejects(installBundle({ ...f.options, sign: async () => { throw new Error("sign failed"); } }), /sign failed/);
  assert.equal(await f.version(), "old");
  assert.deepEqual(await readdir(f.folder), ["Open Markdown Lane.app"]);
});

test("an interrupted replacement recovers the old bundle before a failed install", async t => {
  const f = await fixture(t);
  await rename(f.destination, f.rollback);
  await assert.rejects(installBundle({ ...f.options, sign: async () => { throw new Error("sign failed"); } }), /sign failed/);
  assert.equal(await f.version(), "old");
  assert.deepEqual(await readdir(f.folder), ["Open Markdown Lane.app"]);
});

test("install refuses a running destination without changing files", async t => {
  const f = await fixture(t);
  await assert.rejects(installBundle({ ...f.options, running: `${f.destination}/Contents/MacOS/OpenMarkdownLane` }), /正常退出/);
  assert.equal(await f.version(), "old");
  assert.deepEqual(await readdir(f.folder), ["Open Markdown Lane.app"]);
});

test("rename upgrade removes the legacy bundle only after verification and preserves adjacent documents", async t => {
  const f = await fixture(t);
  const legacyDestination = path.join(f.folder, "Open Typora.app");
  await rename(f.destination, legacyDestination);
  const document = path.join(f.folder, "保留.md");
  await writeFile(document, "用户文档");
  await installBundle({ ...f.options, legacyDestination });
  assert.equal(await f.version(), "new");
  assert.equal(await readFile(document,"utf8"),"用户文档");
  assert.deepEqual((await readdir(f.folder)).sort(), ["Open Markdown Lane.app", "保留.md"].sort());
});

test("failed rename upgrade restores the old bundle under its original name", async t => {
  const f = await fixture(t);
  const legacyDestination = path.join(f.folder, "Open Typora.app");
  await rename(f.destination, legacyDestination);
  await assert.rejects(installBundle({ ...f.options, legacyDestination, verify: async file => {
    if(file===f.destination) throw new Error("bad new signature");
    await f.options.verify(file);
  }}), /bad new signature/);
  assert.equal(await readFile(path.join(legacyDestination,"Contents/version"),"utf8"),"old");
  assert.deepEqual(await readdir(f.folder),["Open Typora.app"]);
});

test("rename upgrade refuses the still-running legacy application", async t => {
  const f = await fixture(t);
  const legacyDestination = path.join(f.folder,"Open Typora.app");
  await rename(f.destination,legacyDestination);
  await assert.rejects(installBundle({...f.options,legacyDestination,running:`${legacyDestination}/Contents/MacOS/OpenTypora`}),/正常退出/);
  assert.deepEqual(await readdir(f.folder),["Open Typora.app"]);
});
