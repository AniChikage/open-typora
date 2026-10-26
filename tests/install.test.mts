import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { installBundle } from "../scripts/install.mts";

async function fixture(t: import("node:test").TestContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "open-typora-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "source.app"), folder = path.join(root, "Applications"), destination = path.join(folder, "Open Typora.app"), rollback = path.join(folder, ".Open Typora-rollback.app");
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
  assert.deepEqual(await readdir(f.folder), ["Open Typora.app"]);
});

test("post-install verification failure restores the exact old bundle", async t => {
  const f = await fixture(t);
  await assert.rejects(installBundle({ ...f.options, verify: async (file: string) => {
    if (file === f.destination) throw new Error("verification failed");
    await f.options.verify(file);
  } }), /verification failed/);
  assert.equal(await f.version(), "old");
  assert.deepEqual(await readdir(f.folder), ["Open Typora.app"]);
});

test("staging failure leaves the installed bundle intact", async t => {
  const f = await fixture(t);
  await assert.rejects(installBundle({ ...f.options, sign: async () => { throw new Error("sign failed"); } }), /sign failed/);
  assert.equal(await f.version(), "old");
  assert.deepEqual(await readdir(f.folder), ["Open Typora.app"]);
});

test("an interrupted replacement recovers the old bundle before a failed install", async t => {
  const f = await fixture(t);
  await rename(f.destination, f.rollback);
  await assert.rejects(installBundle({ ...f.options, sign: async () => { throw new Error("sign failed"); } }), /sign failed/);
  assert.equal(await f.version(), "old");
  assert.deepEqual(await readdir(f.folder), ["Open Typora.app"]);
});

test("install refuses a running destination without changing files", async t => {
  const f = await fixture(t);
  await assert.rejects(installBundle({ ...f.options, running: `${f.destination}/Contents/MacOS/OpenTypora` }), /正常退出/);
  assert.equal(await f.version(), "old");
  assert.deepEqual(await readdir(f.folder), ["Open Typora.app"]);
});
