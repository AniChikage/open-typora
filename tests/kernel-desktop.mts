import { _electron as electron, expect } from "playwright/test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
const directory = await mkdtemp(
  path.join(os.tmpdir(), "open-typora-kernel-desktop-"),
);
const file = path.join(directory, "内核验收.md");
const original =
  "# 内核验收\n\n普通 **粗体**，继续输入。\n\n- [ ] 任务\n\n| A | B |\n| --- | --- |\n| X | Y |\n\n```javascript\nconst value = 1;\n```\n\n> 引用代码\n>\n> ```javascript\n> const nested = 1;\n> ```\n";
await writeFile(file, original);
await writeFile(
  path.join(directory, "session.json"),
  JSON.stringify({
    version: 1,
    activeId: "fixture",
    documents: [
      {
        id: "fixture",
        path: file,
        name: "内核验收.md",
        content: original,
        savedContent: original,
        diskHash: createHash("sha256").update(original).digest("hex"),
        bom: false,
        lineEnding: "\n",
      },
    ],
  }),
);
const env: Record<string, string> = { ...process.env, OPEN_TYPORA_DATA_DIR: directory };
delete env.OPEN_TYPORA_DEV_URL;
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [process.cwd()], env });
const page = await application.firstWindow(),
  errors: string[] = [],
  passed: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const rich = page.locator(".rich-document"),
  source = page.locator(".source-surface .cm-content");
async function mode(rendered: boolean) {
  const button = page.locator(".source-toggle");
  if (((await button.getAttribute("aria-pressed")) === "true") === rendered)
    await button.click();
  await expect(rendered ? rich : source).toBeVisible();
}
async function text() {
  await mode(false);
  return source
    .locator(".cm-line")
    .allTextContents()
    .then((lines) => lines.join("\n"));
}
try {
  await expect(rich.locator("strong")).toHaveText("粗体");
  await rich.locator("strong").click();
  await page.keyboard.insertText("测");
  assert.match(await text(), /\*\*粗.*测.*体\*\*|\*\*粗体测\*\*/);
  const edited = await text();
  await source.press("ControlOrMeta+z");
  assert.equal(await text(), edited);
  await mode(true);
  await rich.press("ControlOrMeta+z");
  assert.equal(await text(), original);
  passed.push(
    "source history is isolated, and rich undo survives a mode round trip",
  );
  await mode(true);
  const fence = rich.locator(".md-fence").first();
  await fence.click();
  const code = fence.locator(".cm-content");
  await code.fill("let changed = 2;");
  await page.getByRole("heading", { name: "内核验收", exact: true }).click();
  assert.ok((await text()).includes("```javascript\nlet changed = 2;\n```"));
  passed.push("code-block editing retains the closing fence and its separator");
  await mode(true);
  const nestedFence = rich.locator("blockquote .md-fence");
  await nestedFence.click();
  await nestedFence.locator(".cm-content").fill("let nested = 3;");
  await page.getByRole("heading", { name: "内核验收", exact: true }).click();
  assert.ok(
    (await text()).includes("> ```javascript\n> let nested = 3;\n> ```"),
  );
  passed.push("editing a nested code block retains quote prefixes");
  await mode(true);
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "查找与替换", exact: true }).click();
  await page
    .getByRole("textbox", { name: "查找内容", exact: true })
    .fill("changed");
  await page
    .getByRole("textbox", { name: "替换内容", exact: true })
    .fill("updated");
  await page.getByRole("button", { name: "全部替换", exact: true }).click();
  await page.getByRole("button", { name: "关闭查找", exact: true }).click();
  assert.ok((await text()).includes("let updated = 2;"));
  await mode(true);
  await rich.press("ControlOrMeta+z");
  assert.ok((await text()).includes("let changed = 2;"));
  passed.push("rich find/replace edits code source and remains undoable");
  await mode(false);
  const beforeShortcut = await text();
  await source.press("ControlOrMeta+/");
  await expect(rich).toBeVisible();
  assert.equal(await text(), beforeShortcut);
  passed.push("the source-mode shortcut takes priority over CodeMirror line commenting");
  async function emptyDocument() {
    await mode(false);
    await source.fill("");
    await mode(true);
    await rich.click();
  }
  await emptyDocument();
  await page.keyboard.type("```javascript");
  await page.keyboard.press("Enter");
  await expect(rich.locator(".md-fence .cm-content")).toBeFocused();
  await page.keyboard.type("let typed = 1;");
  assert.match(await text(), /^```javascript\nlet typed = 1;\n```$/);
  passed.push("typing a fence and Enter opens its code editor and keeps a closing fence");
  await emptyDocument();
  await page.keyboard.type("$$");
  await page.keyboard.press("Enter");
  await expect(rich.locator(".md-math .cm-content")).toBeFocused();
  await page.keyboard.type("x^2");
  assert.match(await text(), /^\$\$\nx\^2\n\$\$$/);
  passed.push("typing a math fence and Enter opens its formula editor");
  await emptyDocument();
  await page.keyboard.type("paragraph");
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "代码块", exact: true }).click();
  await expect(rich.locator(".md-fence .cm-content")).toBeFocused();
  assert.equal(await text(), "```\nparagraph\n```");
  passed.push("the code-block command converts the paragraph and focuses its local editor");
  await mode(true);
  assert.deepEqual(errors, []);
  passed.push("no renderer errors");
  const qa = process.env.OPEN_TYPORA_QA_DIR || "/tmp/open-typora-kernel-qa";
  await mkdir(qa, { recursive: true });
  await page.screenshot({ path: path.join(qa, "kernel-desktop.png") });
  await writeFile(
    path.join(qa, "kernel-desktop-results.json"),
    JSON.stringify({ passed, errors, directory }, null, 2),
  );
  console.log(JSON.stringify({ passed, errors, directory }, null, 2));
} finally {
  await application.close();
}
