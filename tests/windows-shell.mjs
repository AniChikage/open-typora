import { _electron as electron, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

const executablePath = process.env.OPEN_TYPORA_EXECUTABLE;
assert.equal(process.platform, "win32");
assert.ok(executablePath, "Test the installed executable, not the development host");
const qa = process.env.OPEN_TYPORA_QA_DIR;
await mkdir(qa, { recursive: true });
const data = await mkdtemp(path.join(os.tmpdir(), "open-typora-shell-"));
const first = path.join(data, "English note.md"), second = path.join(data, "中文 notes.md");
await writeFile(first, "# A quiet place for your words\n\nAn installed Windows application.\n");
await writeFile(second, "# Windows 文件关联\n\n保留空格和中文文件名。\n");
const env = { ...process.env, OPEN_TYPORA_DATA_DIR: path.join(data, "session") };
delete env.ELECTRON_RUN_AS_NODE;
let application;
try {
  application = await electron.launch({ executablePath, args: [first], env, timeout: 30000 });
  const page = await application.firstWindow();
  await expect(page.getByRole("button", { name: path.basename(first), exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A quiet place for your words" })).toBeVisible();
  const identity = await application.evaluate(({ app, BrowserWindow }) => ({
    packaged: app.isPackaged, version: app.getVersion(), windows: BrowserWindow.getAllWindows().length,
  }));
  assert.equal(identity.packaged, true);
  assert.equal(identity.version, JSON.parse(await readFile("package.json", "utf8")).version);
  await promisify(execFile)(executablePath, [second], { env, timeout: 30000 });
  await expect(page.getByRole("button", { name: path.basename(second), exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Windows 文件关联" })).toBeVisible();
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await page.screenshot({ path: path.join(qa, "windows-file-open.png") });
  await writeFile(path.join(qa, "windows-shell-results.json"), JSON.stringify({ ...identity, commandLineOpen: true, secondInstanceOpen: true, unicodePaths: true }, null, 2));
  console.log("PASS: installed Windows executable, command-line documents, single instance and Unicode paths");
} finally { await application?.close(); }
