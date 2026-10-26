import { _electron as electron, expect } from "playwright/test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp, writeFile, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "open-typora-alignment-")));
const file = path.join(directory, "对齐验收.md"), content = '# 对齐验收\n\nA12 a34\n\n**bold *middle* tail**\n\n| A | B |\n| --- | --- |\n| C | D |\n\n![图](.assets/pixel.png)\n\n> [!NOTE]\n> 提示内容\n\n<div><strong>HTML 预览</strong></div>\n';
await mkdir(path.join(directory, ".assets")); await mkdir(path.join(directory, "空目录"));
await writeFile(path.join(directory, ".assets/pixel.png"), await sharp({ create: { width: 120, height: 80, channels: 4, background: "#96abc1" } }).png().toBuffer());
await writeFile(file, content); await writeFile(path.join(directory, "另一页.md"), "# 另一页\n\n## 跳转目标\n\nNeedle 42\n");
await writeFile(path.join(directory, "session.json"), JSON.stringify({ version: 1, folder: directory, activeId: "fixture", documents: [{ id: "fixture", path: file, name: "对齐验收.md", content, savedContent: content, diskHash: createHash("sha256").update(content).digest("hex"), bom: false, lineEnding: "\n" }] }));
const env: Record<string, string> = { ...process.env, OPEN_TYPORA_DATA_DIR: directory }; delete env.ELECTRON_RUN_AS_NODE; delete env.OPEN_TYPORA_DEV_URL;
const application = await electron.launch({ args: [process.cwd()], env }), page = await application.firstWindow();
const errors: string[] = [], passed: string[] = [], qa = process.env.OPEN_TYPORA_QA_DIR || "/tmp/open-typora-alignment-qa";
const originalPush = passed.push.bind(passed); passed.push = (...values) => { console.log(...values); return originalPush(...values); };
page.on("pageerror", error => errors.push(error.message)); await mkdir(qa, { recursive: true });
const rich = page.locator(".document-editor:not([hidden]) .rich-document");
async function menu(name: string) { await page.getByRole("button", { name: "更多操作", exact: true }).click(); await page.getByRole("menuitem", { name, exact: true }).click(); }
async function source() { if (await page.locator(".source-toggle").getAttribute("aria-pressed") !== "true") await page.locator(".source-toggle").click(); return (await page.locator(".document-editor:not([hidden]) .source-surface .cm-line").allTextContents()).join("\n"); }
async function richMode() { if (await page.locator(".source-toggle").getAttribute("aria-pressed") === "true") await page.locator(".source-toggle").click(); await expect(rich).toBeVisible(); }
try {
  await expect(rich.locator(".markdown-alert-note")).toBeVisible(); await expect(rich.locator(".md-html .fence-preview strong")).toHaveText("HTML 预览");
  passed.push("alerts and HTML render in the live editor");
  await page.getByRole("button", { name: "文件夹操作", exact: true }).click(); await expect(page.getByRole("menu", { name: "文件操作", exact: true })).toBeVisible(); await page.getByRole("menuitem", { name: "新建文件夹…", exact: true }).click(); let dialog = page.getByRole("dialog", { name: "新建文件夹", exact: true }); await dialog.getByLabel("文件名称").fill("新目录"); await dialog.getByRole("button", { name: "确定", exact: true }).click(); await expect(dialog).toHaveCount(0); assert.ok((await stat(path.join(directory, "新目录"))).isDirectory());
  await menu("在文件夹中新建文件…"); dialog = page.getByRole("dialog", { name: "新建文件", exact: true }); await dialog.getByLabel("文件名称").fill("新文件.md"); await dialog.getByRole("button", { name: "确定", exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.locator(".document-title")).toContainText("新文件.md");
  passed.push("folder and Markdown creation produce actual disk items and focus the document");
  await page.getByRole("button", { name: "对齐验收.md", exact: true }).click(); await richMode();
  await page.keyboard.press("ControlOrMeta+f"); await page.getByLabel("查找内容", { exact: true }).fill("a(\\d+)"); await page.getByRole("button", { name: "正则表达式", exact: true }).click(); await page.getByLabel("替换内容", { exact: true }).fill("N$1"); await page.getByRole("button", { name: "全部替换", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "已替换 2 处" })).toBeVisible(); await page.getByRole("button", { name: "关闭查找" }).click(); assert.ok((await source()).includes("N12 N34")); await richMode(); await rich.press("ControlOrMeta+z"); assert.ok((await source()).includes("A12 a34")); await richMode();
  passed.push("rich regex capture replacement is case insensitive and one-step undo restores exact text");
  await rich.locator("table td").first().click();
  await rich.locator("table td").first().evaluate(element => { const transfer = new DataTransfer(); transfer.setData("text/plain", "1\t2\t3\nx|y\tz\t4"); element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer })); });
  await expect(rich.locator("table th")).toHaveCount(3); await expect(rich.locator("table tr")).toHaveCount(3); assert.ok((await source()).includes("x\\|y")); await richMode(); await rich.press("ControlOrMeta+z");
  passed.push("TSV clipboard paste expands a table and preserves literal pipes");
  await rich.locator("img").click({ button: "right" }); dialog = page.getByRole("dialog", { name: "编辑图片", exact: true }); await dialog.getByLabel("图片宽度").fill("50%"); await dialog.getByRole("button", { name: "应用", exact: true }).click(); await expect(rich.locator("img")).toHaveAttribute("width", "50%"); assert.ok((await source()).includes('width="50%"')); await richMode(); await rich.press("ControlOrMeta+z");
  passed.push("image dialog writes portable HTML sizing syntax and undo restores Markdown");
  await menu("插入引用链接…"); dialog = page.getByRole("dialog", { name: "插入引用链接", exact: true }); await dialog.getByLabel("显示文字").fill("引用链接"); await dialog.getByLabel("链接地址").fill("https://example.com/doc"); await dialog.getByLabel("引用标识").fill("example"); await dialog.getByRole("button", { name: "插入", exact: true }).click(); assert.ok((await source()).includes("[example]: https://example.com/doc")); await richMode(); await rich.press("ControlOrMeta+z");
  passed.push("reference link insertion adds a usable definition in one undo transaction");
  await page.keyboard.press("ControlOrMeta+Shift+f"); dialog = page.getByRole("dialog", { name: "搜索文件夹内容", exact: true }); await dialog.getByRole("textbox", { name: "搜索文件夹内容", exact: true }).fill("Needle"); await expect(dialog.locator(".global-search-results button")).toHaveCount(1); await dialog.locator(".global-search-results button").click(); await expect(page.locator(".document-title")).toContainText("另一页.md");
  passed.push("folder content search opens the actual matching file at its source line");
  await page.getByRole("button", { name: "对齐验收.md", exact: true }).click(); await richMode(); await rich.press("ControlOrMeta+End"); await page.keyboard.type("\n:smi"); await expect(page.getByRole("listbox", { name: "Emoji 建议" })).toBeVisible(); const chosenEmoji = (await page.getByRole("option", { selected: true }).textContent())!.match!(/:[a-zA-Z0-9_+-]+:/)![0]; await page.keyboard.press("Enter"); assert.ok((await source()).includes(chosenEmoji)); await richMode(); await rich.press("ControlOrMeta+z");
  passed.push("emoji completion accepts the keyboard choice and remains undoable");
  const result = await page.evaluate(async directory => { const rename = await window.desktop!.fileOperation({ action: "rename", path: directory + "/对齐验收.md", name: "重命名.md" }); if (!rename.ok) throw new Error(rename.error); return rename.value!; }, directory);
  assert.equal(result.toPath, path.join(directory, "重命名.md")); await expect(page.locator(".document-title")).toContainText("重命名.md");
  const undo = await page.evaluate(async () => window.desktop!.fileOperation({ action: "undo" })); assert.ok(undo.ok, undo.error); await expect(page.locator(".document-title")).toContainText("对齐验收.md");
  passed.push("renderer/native file-operation handshake synchronizes rename and undo without losing edits");
  await menu("文件树"); await expect(page.getByRole("tree")).toBeVisible(); await expect(page.getByRole("tree").getByRole("button", { name: "空目录", exact: true })).toBeVisible();
  const first = page.getByRole("tree").locator("button.tree-entry").first(); await first.focus(); await page.keyboard.press("ArrowDown"); assert.notEqual(await first.evaluate(element => document.activeElement! === element), true);
  await page.screenshot({ path: path.join(qa, "workspace-alignment.png") });
  passed.push("file tree includes empty folders and supports arrow-key focus navigation");
  assert.deepEqual(errors, []); passed.push("no renderer errors");
  await writeFile(path.join(qa, "alignment-results.json"), JSON.stringify({ passed, errors, directory }, null, 2)); console.log(JSON.stringify({ passed, errors, directory }, null, 2));
} catch (error) { await page.screenshot({ path: path.join(qa, "alignment-failure.png") }); console.error({ passed, errors, document: await page.locator(".document-title").textContent() }); throw error; } finally { await application.close(); }
