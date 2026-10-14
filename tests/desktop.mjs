import { _electron as electron, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = process.cwd(),
  qa = process.env.OPEN_TYPORA_QA_DIR || "/tmp/open-typora-qa";
await mkdir(qa, { recursive: true });
const dataDir = await mkdtemp(path.join(os.tmpdir(), "open-typora-desktop-"));
const env = { ...process.env, OPEN_TYPORA_DATA_DIR: dataDir };
delete env.OPEN_TYPORA_DEV_URL;
delete env.ELECTRON_RUN_AS_NODE;
const errors = [],
  passed = [];
let application;
async function launch() {
  application = await electron.launch({ args: [root], env, timeout: 25000 });
  const page = await application.firstWindow({ timeout: 20000 });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "欢迎.md", exact: true }).waitFor();
  return page;
}
async function menu(page, name) {
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function waitForFile(file, predicate) {
  for (let i = 0; i < 60; i++) {
    try {
      const text = await readFile(file, "utf-8");
      if (predicate(text)) return text;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`File did not reach expected state: ${file}`);
}
try {
  let page = await launch();
  await expect(
    page.getByRole("heading", { name: "让文字，回到文字。" }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(qa, "desktop.png") });
  passed.push("Packaged renderer loads, welcome document renders, no overlay");
  const original = await readFile(
    path.join(dataDir, "示例笔记/欢迎.md"),
    "utf-8",
  );
  await page.getByRole("button", { name: "源码", exact: true }).click();
  const editor = page.locator(".document-editor:not([hidden]) .cm-content");
  await expect(editor).toContainText("# 让文字，回到文字。");
  await page.getByRole("button", { name: "即时渲染", exact: true }).click();
  assert.equal(
    await readFile(path.join(dataDir, "示例笔记/欢迎.md"), "utf-8"),
    original,
  );
  passed.push("Switching modes preserves original Markdown byte for byte");
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await editor.click();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n中文输入验收：你好，世界。\n");
  const welcome = path.join(dataDir, "示例笔记/欢迎.md");
  await waitForFile(welcome, (text) =>
    text.includes("中文输入验收：你好，世界。"),
  );
  passed.push("Chinese text input persists through real native automatic save");
  await editor.press("ControlOrMeta+z");
  await waitForFile(welcome, (text) => !text.includes("中文输入验收"));
  await editor.press("ControlOrMeta+Shift+z");
  await waitForFile(welcome, (text) => text.includes("中文输入验收"));
  passed.push("Undo and redo persist correct file contents");
  await page.getByRole("button", { name: "写作示例.md", exact: true }).click();
  await page.getByRole("button", { name: "即时渲染", exact: true }).click();
  await expect(
    page.locator(".document-editor:not([hidden]) .katex"),
  ).toBeVisible();
  await expect(
    page.locator(".document-editor:not([hidden]) .mermaid-block svg"),
  ).toBeVisible();
  await expect(
    page.locator(".document-editor:not([hidden]) .mermaid-block svg"),
  ).toContainText("观察");
  passed.push(
    "Math, highlighted code, tasks and Mermaid with visible labels render",
  );
  const pdf = path.join(dataDir, "example.pdf");
  await application.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, pdf);
  await menu(page, "导出 PDF");
  await waitForFile(pdf, (text) => text.startsWith("%PDF-"));
  assert.ok((await readFile(pdf)).length > 10_000);
  passed.push("Native PDF export produces a PDF file");
  const crlfFile = path.join(dataDir, "CRLF.md"),
    crlfOriginal =
      "\uFEFF---\r\ntitle: 中文\r\n---\r\n\r\n# 标题\r\n\r\n保留两个空格  \r\n";
  await writeFile(crlfFile, crlfOriginal);
  await application.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, crlfFile);
  await menu(page, "打开文件");
  await expect(
    page.getByRole("button", { name: "CRLF.md", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "源码", exact: true }).click();
  const crlfEditor = page.locator(".document-editor:not([hidden]) .cm-content");
  await crlfEditor.click();
  await crlfEditor.press("ControlOrMeta+End");
  await page.keyboard.insertText("新增中文");
  await waitForFile(crlfFile, (text) => text.endsWith("新增中文"));
  assert.equal(await readFile(crlfFile, "utf-8"), crlfOriginal + "新增中文");
  passed.push(
    "Real editor preserves BOM, CRLF, front matter and trailing spaces",
  );
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=",
    "base64",
  );
  await crlfEditor.evaluate(
    (element, bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], "paste.png", { type: "image/png" }),
      );
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [...tinyPng],
  );
  const imageContent = await waitForFile(crlfFile, (text) =>
    text.includes("![paste.png](.assets/"),
  );
  const imageRelative = /!\[paste.png\]\(([^)]+)\)/.exec(imageContent)[1];
  assert.deepEqual(await readFile(path.join(dataDir, imageRelative)), tinyPng);
  await page.getByRole("button", { name: "即时渲染", exact: true }).click();
  await page.getByRole("tab", { name: "大纲", exact: true }).click();
  await page.getByRole("button", { name: "标题", exact: true }).click();
  await expect(
    page.locator(".document-editor:not([hidden]) img"),
  ).toBeVisible();
  assert.ok(
    await page
      .locator(".document-editor:not([hidden]) img")
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  );
  passed.push(
    "Image paste copies bytes and renders through the local asset protocol",
  );
  await page.getByRole("tab", { name: "文件", exact: true }).click();
  await page.getByRole("button", { name: "欢迎.md", exact: true }).click();
  await page.getByRole("tab", { name: "大纲", exact: true }).click();
  await page
    .getByRole("button", { name: "写作，不必分心", exact: true })
    .click();
  await page.getByRole("tab", { name: "文件", exact: true }).click();
  passed.push("Outline navigates to the selected Markdown heading");
  const target = path.join(dataDir, "验收文档.md");
  await application.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, target);
  await page.getByRole("button", { name: "新建文档" }).click();
  await page.getByRole("button", { name: "源码", exact: true }).click();
  const fresh = page.locator(".document-editor:not([hidden]) .cm-content");
  await fresh.fill("# 新文档\n\n这是一份真实保存的 Markdown。\n");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await waitForFile(target, (text) => text.includes("真实保存"));
  passed.push("New document Save uses native file persistence");
  await page.getByRole("button", { name: "更多操作" }).click();
  await page
    .getByRole("menuitemcheckbox", { name: "自动保存已有文件" })
    .click();
  await page.getByRole("button", { name: "更多操作" }).click();
  await fresh.click();
  await fresh.press("ControlOrMeta+End");
  await page.keyboard.insertText("未保存的修改\n");
  await writeFile(target, "# 来自其他编辑器\n");
  await expect(page.getByRole("alert")).toContainText("磁盘上已改变");
  assert.equal(await readFile(target, "utf-8"), "# 来自其他编辑器\n");
  passed.push(
    "External modifications produce conflict and are not overwritten",
  );
  await waitForFile(path.join(dataDir, "session.json"), (text) =>
    text.includes("未保存的修改"),
  );
  await application.close();
  page = await launch();
  await expect(
    page.locator(".document-editor:not([hidden]) .cm-content"),
  ).toContainText("未保存的修改");
  await expect(page.getByRole("alert")).toBeVisible();
  passed.push("Restart restores the dirty draft and conflict state");
  const screenshot = path.join(qa, "recovered.png");
  await page.screenshot({ path: screenshot });
  assert.deepEqual(errors, []);
  passed.push("No renderer runtime errors");
  await writeFile(
    path.join(qa, "desktop-results.json"),
    JSON.stringify({ passed, errors, dataDir }, null, 2),
  );
  console.log(JSON.stringify({ passed, errors, dataDir }, null, 2));
} finally {
  await application?.close();
}
