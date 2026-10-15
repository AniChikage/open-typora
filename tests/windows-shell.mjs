import { _electron as electron, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { installPlugin } from "../electron/plugins.mjs";
import { builtInThemes } from "../src/themes.ts";

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
const pluginFile = path.join(data, "Win-plugin-fixture.js");
await writeFile(pluginFile, "class WindowsFixture extends BasePlugin { style() { return '#write { --plugin-fixture: loaded; }' }; call() { this.utils.insertText('插件验收') } }; module.exports = {plugin: WindowsFixture};");
await installPlugin(pluginFile, env.OPEN_TYPORA_DATA_DIR);
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
  const openMenu = async name => { await page.getByRole('button',{name:'更多操作',exact:true}).click(); await page.getByRole('menuitem',{name,exact:true}).click(); };
  await openMenu('偏好设置…');
  for (const theme of builtInThemes) {
    await page.getByRole('button',{name:`使用${theme.name}主题`,exact:true}).click();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim())).toBe(theme.paper);
  }
  await page.getByRole('button',{name:'使用简白主题',exact:true}).click();
  await page.getByRole('button',{name:'管理插件…',exact:true}).click();
  const plugin = page.locator('.plugin-card').filter({has:page.getByRole('heading',{name:'Win-plugin-fixture',exact:true})});
  await plugin.getByRole('checkbox').check();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.getElementById('write')).getPropertyValue('--plugin-fixture').trim())).toBe('loaded');
  await plugin.getByRole('button',{name:'切换效果',exact:true}).click();
  await page.getByRole('dialog',{name:'插件管理',exact:true}).getByRole('button',{name:'完成',exact:true}).click();
  await expect(page.locator('#write')).toContainText('插件验收');
  await page.locator('#write').click(); await page.keyboard.press('Control+z');
  await expect(page.locator('#write')).not.toContainText('插件验收');
  await openMenu('插件管理…'); await page.getByRole('checkbox',{name:'启用只读模式',exact:true}).check();
  await expect(page.locator('#write')).toHaveAttribute('aria-readonly','true');
  await page.getByRole('dialog',{name:'插件管理',exact:true}).getByRole('button',{name:'完成',exact:true}).click();
  await page.getByRole('button',{name:'源码',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Markdown 源码编辑器',exact:true})).toHaveAttribute('contenteditable','false');
  await page.getByRole('button',{name:'即时渲染',exact:true}).click(); await openMenu('插件管理…');
  await page.getByRole('checkbox',{name:'启用只读模式',exact:true}).uncheck(); await plugin.getByRole('checkbox').uncheck();
  await expect(page.locator('#write')).toHaveAttribute('aria-readonly','false');
  await expect(page.locator('style[data-plugin]')).toHaveCount(0);
  await page.screenshot({path:path.join(qa,'windows-plugins.png')});
  await writeFile(path.join(qa, "windows-shell-results.json"), JSON.stringify({ ...identity, commandLineOpen: true, secondInstanceOpen: true, unicodePaths: true, themes:6, installedPluginModule:true, pluginEditUndo:true, readOnlyLiveAndSource:true, pluginCleanup:true }, null, 2));
  console.log("PASS: installed Windows executable, command-line documents, single instance and Unicode paths");
} finally { await application?.close(); }
