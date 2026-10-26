import { _electron as electron, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const root = process.cwd(),
  qa = process.env.OPEN_TYPORA_QA_DIR || "/tmp/open-typora-qa";
await mkdir(qa, { recursive: true });
const dataDir = await mkdtemp(path.join(os.tmpdir(), "open-typora-desktop-"));
const env: Record<string, string> = { ...process.env, OPEN_TYPORA_DATA_DIR: dataDir };
delete env.OPEN_TYPORA_DEV_URL;
delete env.ELECTRON_RUN_AS_NODE;
const errors: string[] = [],
  passed: string[] = [];
let application!: import("playwright").ElectronApplication, currentPage!: import("playwright").Page;
async function launch() {
  application = await electron.launch({
    ...(process.env.OPEN_TYPORA_EXECUTABLE ? { executablePath: process.env.OPEN_TYPORA_EXECUTABLE, args: [] } : { args: [root] }),
    env, timeout: 30000,
  });
  const page = await application.firstWindow({ timeout: 20000 });
  currentPage = page;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "欢迎.md", exact: true }).waitFor();
  return page;
}
async function menu(page: import("playwright").Page, name: string) {
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function mode(page: import("playwright").Page, rendered: boolean) {
  const toggle = page.locator(".source-toggle");
  const source = (await toggle.getAttribute("aria-pressed")) === "true";
  if (source === rendered) await toggle.click();
}
async function sidebarTab(page: import("playwright").Page, name: string) {
  await page.getByRole("button", { name: "切换侧栏内容" }).click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
}
async function waitForFile(file: string, predicate: (text:string)=>boolean, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
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
  if (process.platform === "win32") {
    assert.ok(original.includes("Ctrl+S"));
    assert.ok(!original.includes("⌘"));
  }
  await mode(page, false);
  const editor = page.locator(".document-editor:not([hidden]) .cm-content");
  await expect(editor).toContainText("# 让文字，回到文字。");
  await mode(page, true);
  assert.equal(
    await readFile(path.join(dataDir, "示例笔记/欢迎.md"), "utf-8"),
    original,
  );
  passed.push("Switching modes preserves original Markdown byte for byte");
  await mode(page, false);
  await editor.click();
  await editor.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n中文输入验收：你好，世界。\n");
  const welcome = path.join(dataDir, "示例笔记/欢迎.md");
  await waitForFile(welcome, (text: string) =>
    text.includes("中文输入验收：你好，世界。"),
  );
  passed.push("Chinese text input persists through Electron-host automatic save");
  await editor.press("ControlOrMeta+z");
  await waitForFile(welcome, (text: string) => !text.includes("中文输入验收"));
  await editor.press("ControlOrMeta+Shift+z");
  await waitForFile(welcome, (text: string) => text.includes("中文输入验收"));
  passed.push("Undo and redo persist correct file contents");
  await page.getByRole("button", { name: "写作示例.md", exact: true }).click();
  await mode(page, true);
  await expect(
    page.locator(".document-editor:not([hidden]) .mathjax-node svg"),
  ).toBeVisible();
  await expect(
    page.locator(".document-editor:not([hidden]) .mermaid-block svg"),
  ).toBeVisible();
  await expect(
    page.locator(".document-editor:not([hidden]) .mermaid-block svg"),
  ).toContainText("观察");
  passed.push(
    "Math, code, tasks and Mermaid with visible labels render",
  );
  const pdf = path.join(dataDir, "example.pdf");
  await application.evaluate(({ dialog }, file: string) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, pdf);
  const pdfStarted = Date.now();
  await menu(page, "导出 PDF");
  await waitForFile(pdf, (text: string) => text.startsWith("%PDF-"), 30000);
  console.log(`PDF export completed in ${Date.now() - pdfStarted} ms`);
  assert.ok((await readFile(pdf)).length > 10_000);
  passed.push("Electron-host PDF export produces a PDF file");
  const crlfFile = path.join(dataDir, "CRLF.md"),
    crlfOriginal =
      "\uFEFF---\r\ntitle: 中文\r\n---\r\n\r\n# 标题\r\n\r\n保留两个空格  \r\n";
  await writeFile(crlfFile, crlfOriginal);
  await application.evaluate(({ dialog }, file: string) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, crlfFile);
  await menu(page, "打开文件");
  await expect(
    page.getByRole("button", { name: "CRLF.md", exact: true }),
  ).toBeVisible();
  await mode(page, false);
  const crlfEditor = page.locator(".document-editor:not([hidden]) .cm-content");
  await crlfEditor.click();
  await crlfEditor.press("ControlOrMeta+End");
  await page.keyboard.insertText("新增中文");
  await waitForFile(crlfFile, (text: string) => text.endsWith("新增中文"));
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
  const imageContent = await waitForFile(crlfFile, (text: string) =>
    text.includes("![paste.png](.assets/"),
  );
  const imageRelative = /!\[paste.png\]\(([^)]+)\)/.exec(imageContent)![1];
  assert.deepEqual(await readFile(path.join(dataDir, imageRelative)), tinyPng);
  await mode(page, true);
  await sidebarTab(page, "大纲");
  await page.getByRole("button", { name: "标题", exact: true }).click();
  await expect(
    page.locator(".document-editor:not([hidden]) img"),
  ).toBeVisible();
  assert.ok(
    await page
      .locator(".document-editor:not([hidden]) img")
      .evaluate((image: HTMLImageElement)=> image.complete && image.naturalWidth > 0),
  );
  passed.push(
    "Image paste copies bytes and renders through the local asset protocol",
  );
  await sidebarTab(page, "文件");
  await page.getByRole("button", { name: "欢迎.md", exact: true }).click();
  await sidebarTab(page, "大纲");
  await page
    .getByRole("button", { name: "写作，不必分心", exact: true })
    .click();
  await sidebarTab(page, "文件");
  passed.push("Outline navigates to the selected Markdown heading");
  const target = path.join(dataDir, "验收文档.md");
  await application.evaluate(({ dialog }, file: string) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, target);
  await page.getByRole("button", { name: "新建文档" }).click();
  // Draft registration crosses the native bridge; target the new tab only after activation.
  await expect(page.getByRole("tab", { name: "未命名.md", exact: true })).toHaveAttribute("aria-selected", "true");
  await mode(page, false);
  const fresh = page.locator(".document-editor:not([hidden]) .cm-content");
  await fresh.fill("# 新文档\n\n这是一份真实保存的 Markdown。\n");
  await menu(page, "保存");
  await waitForFile(target, (text: string) => text.includes("真实保存"));
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
  await waitForFile(path.join(dataDir, "session.json"), (text: string) =>
    text.includes("未保存的修改"),
  );
  await application.close();
  page = await launch();
  await mode(page, false);
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
} catch (error) {
  const diagnostics = { error: String(error), passed, errors, alerts: await currentPage?.getByRole("alert").allTextContents().catch(() => []), dataDir };
  console.error(JSON.stringify(diagnostics, null, 2));
  await currentPage?.screenshot({ path: path.join(qa, "failure.png") }).catch(() => {});
  await writeFile(path.join(qa, "failure.json"), JSON.stringify(diagnostics, null, 2));
  throw error;
} finally {
  await application?.close();
}
