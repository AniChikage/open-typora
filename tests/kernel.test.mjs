import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", {
  pretendToBeVisual: true,
  url: "https://editor.test/",
});
for (const key of [
  "window",
  "document",
  "Node",
  "NodeFilter",
  "Text",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTableCellElement",
  "HTMLTableRowElement",
  "MutationObserver",
  "DOMParser",
  "getComputedStyle",
])
  globalThis[key] = dom.window[key];
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
  dom.window,
);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(
  dom.window,
);
const { MarkdownDocument } = await import("../src/editor/model.ts");
const { RichEditor } = await import("../src/editor/RichEditor.ts");
function fixture(text) {
  const container = document.createElement("div"),
    root = document.createElement("div");
  container.append(root);
  document.body.append(container);
  const model = new MarkdownDocument(
    text,
    text.includes("\r\n") ? "\r\n" : "\n",
  );
  let changes = 0;
  const editor = new RichEditor(root, model, "fixture", {
    change: () => changes++,
    cursor() {},
    image() {},
    link() {},
    compositionFinished() {},
  });
  return {
    root,
    model,
    editor,
    changes: () => changes,
    close() {
      editor.destroy();
      container.remove();
    },
  };
}
function point(editor, position) {
  editor.model.selection = { anchor: position, head: position };
  editor.restore();
}
function input(root, type, data = null) {
  root.dispatchEvent(
    new window.InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: type,
      data,
    }),
  );
}
test("unmodified node-tree rendering preserves Markdown, CRLF, YAML, delimiters and whitespace", () => {
  const source =
    "---\r\ntitle: 中文\r\n---\r\n\r\n# 标题\r\n\r\n**粗体** 和 `代码`，保留空格  \r\n";
  const f = fixture(source);
  assert.equal(f.model.toMarkdown(), source);
  assert.equal(f.changes(), 0);
  assert.equal(f.root.querySelector("h1").textContent, "标题");
  assert.equal(f.root.querySelector("strong").textContent, "粗体");
  f.close();
});
test("a caret inside bold expands only that inline and edits its text without discarding surrounding formatting", () => {
  const source = "普通 **粗体** 与 *斜体*。\n";
  const f = fixture(source),
    at = source.indexOf("粗体") + 1;
  point(f.editor, at);
  assert.equal(
    f.root
      .querySelector('[data-mark="strong"]')
      .classList.contains("md-expand"),
    true,
  );
  assert.equal(
    f.root.querySelector('[data-mark="em"]').classList.contains("md-expand"),
    false,
  );
  input(f.root, "insertText", "测");
  assert.equal(f.model.toMarkdown(), "普通 **粗测体** 与 *斜体*。\n");
  assert.equal(f.editor.bookmark().head, at + 1);
  f.editor.undo();
  assert.equal(f.model.toMarkdown(), source);
  f.close();
});
test("Enter creates a paragraph, Shift-Enter inserts a soft break, and undo restores exact content", () => {
  const f = fixture("第一段\n");
  point(f.editor, 3);
  input(f.root, "insertParagraph");
  input(f.root, "insertText", "第二段");
  assert.equal(f.model.text, "第一段\n\n第二段\n");
  input(f.root, "insertLineBreak");
  input(f.root, "insertText", "下一行");
  assert.equal(f.model.text, "第一段\n\n第二段\n下一行\n");
  f.editor.undo();
  f.editor.undo();
  assert.equal(f.model.text, "第一段\n\n第二段\n");
  f.close();
});
test("list continuation, empty-item exit and structural undo retain a valid document", () => {
  const f = fixture("- 第一项\n");
  point(f.editor, 5);
  input(f.root, "insertParagraph");
  assert.equal(f.model.text, "- 第一项\n- \n");
  input(f.root, "insertParagraph");
  assert.equal(f.model.text, "- 第一项\n\n\n");
  f.editor.undo();
  assert.equal(f.model.text, "- 第一项\n- \n");
  f.close();
});
test("cross-block selection replacement and undo recover both original blocks and selection", () => {
  const f = fixture("第一段\n\n第二段\n");
  f.model.selection = { anchor: 1, head: 7 };
  f.editor.restore();
  input(f.root, "insertText", "替换");
  assert.equal(f.model.text, "第替换段\n");
  f.editor.undo();
  assert.equal(f.model.text, "第一段\n\n第二段\n");
  assert.deepEqual(f.model.selection, { anchor: 1, head: 7 });
  f.close();
});
test("composition keeps the edited DOM leaf alive, commits once, and undoes as one operation", async () => {
  const f = fixture("中文输入\n");
  point(f.editor, 2);
  const leaf = f.root.querySelector("[data-leaf]"),
    text = leaf.firstChild;
  f.root.dispatchEvent(
    new window.CompositionEvent("compositionstart", { bubbles: true }),
  );
  text.data = "中文组合输入";
  window.getSelection().collapse(text, 4);
  f.root.dispatchEvent(
    new window.InputEvent("input", {
      bubbles: true,
      isComposing: true,
      inputType: "insertCompositionText",
      data: "组合",
    }),
  );
  assert.equal(f.root.querySelector("[data-leaf]"), leaf);
  assert.equal(f.model.text, "中文输入\n");
  f.root.dispatchEvent(
    new window.CompositionEvent("compositionend", {
      bubbles: true,
      data: "组合",
    }),
  );
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(f.model.text, "中文组合输入\n");
  assert.equal(f.changes(), 1);
  f.editor.undo();
  assert.equal(f.model.text, "中文输入\n");
  f.close();
});
test("task checkboxes update their own marker and undo without changing other tasks", () => {
  const f = fixture("- [ ] 第一项\n- [x] 第二项\n");
  f.root
    .querySelector("input")
    .dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  assert.equal(f.model.text, "- [x] 第一项\n- [x] 第二项\n");
  f.editor.undo();
  assert.equal(f.model.text, "- [ ] 第一项\n- [x] 第二项\n");
  f.close();
});
test("table cells edit in place, Tab creates another row, and alignment is a reversible transaction", () => {
  const source = "| 名称 | 内容 |\n| --- | --- |\n| A | B |\n";
  const f = fixture(source);
  point(f.editor, source.indexOf("B"));
  input(f.root, "insertText", "新");
  assert.match(f.model.text, /\| A \| 新B \|/);
  f.editor.tableAction("center");
  assert.match(f.model.text, /:---:/);
  f.editor.undo();
  assert.doesNotMatch(f.model.text, /:---:/);
  point(f.editor, f.model.text.indexOf("B") + 1);
  f.root.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
    }),
  );
  assert.equal(f.root.querySelectorAll("tbody tr").length, 2);
  f.close();
});
test("source mode has isolated undo and commits one transaction when returning to rich mode", () => {
  const f = fixture("正文\n");
  point(f.editor, 1);
  input(f.root, "insertText", "新");
  f.model.beginSourceSession();
  assert.equal(f.model.canUndo, false);
  f.model.replace(0, f.model.text.length, "# 正新文\n", "source-command");
  assert.equal(f.model.undo(), true);
  assert.equal(f.model.text, "正新文\n");
  assert.equal(f.model.undo(), false);
  f.model.redo();
  f.model.replace(
    f.model.text.length,
    f.model.text.length,
    "源码新增\n",
    "source-command",
  );
  f.model.endSourceSession();
  f.editor.render();
  f.editor.undo();
  assert.equal(f.model.text, "正新文\n");
  f.editor.undo();
  assert.equal(f.model.text, "正文\n");
  f.close();
});
test("Backspace removes a complete grapheme, and an external update resets the document history", () => {
  const f = fixture("A👨‍👩‍👧‍👦B\n");
  point(f.editor, f.model.text.indexOf("B"));
  input(f.root, "deleteContentBackward");
  assert.equal(f.model.text, "AB\n");
  f.model.replaceExternal("外部文本\n");
  f.editor.undo();
  assert.equal(f.model.text, "外部文本\n");
  f.close();
});
test("nested emphasis, escapes, entities, balanced links and reference links keep exact source positions", () => {
  const source =
    "***嵌套***、\\*星号\\*、&amp;、[链接](https://example.com/a_(b)) 与 [引用][ref]。\n\n[ref]: https://example.com/ref\n";
  const f = fixture(source);
  assert.equal(
    f.root.querySelector("strong em, em strong").textContent,
    "嵌套",
  );
  assert.deepEqual(
    [...f.root.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ["https://example.com/a_(b)", "https://example.com/ref"],
  );
  const clone = f.root.querySelector("[data-leaf]").cloneNode(true);
  clone.querySelectorAll(".md-view").forEach((n) => n.remove());
  assert.equal(clone.textContent, source.split("\n")[0]);
  point(f.editor, source.indexOf("引用") + 1);
  input(f.root, "insertText", "新");
  assert.equal(f.model.text, source.replace("引用", "引新用"));
  f.editor.undo();
  assert.equal(f.model.text, source);
  f.close();
});
test("empty table cells and escaped pipes do not steal another cell source position", () => {
  const source = "| 空 | 内容 |\n| --- | --- |\n|  | A\\|B |\n|  |  |\n";
  const f = fixture(source);
  const spans = [...f.root.querySelectorAll("tbody [data-leaf]")];
  const last = f.editor.leaves.get(spans.at(-1).dataset.leaf);
  point(f.editor, last.positions[0]);
  input(f.root, "insertText", "末");
  assert.equal(f.model.text, source.replace("|  |  |", "|  |  末|"));
  f.editor.undo();
  assert.equal(f.model.text, source);
  f.close();
});
test("composition in a multiline quote retains the untouched container prefixes", async () => {
  const f = fixture("> 第一行\n> 第二行\n");
  point(f.editor, 3);
  const leaf = f.root.querySelector("[data-leaf]"),
    text = leaf.firstChild;
  f.root.dispatchEvent(
    new window.CompositionEvent("compositionstart", { bubbles: true }),
  );
  text.data = "第测试一行";
  window.getSelection().collapse(text, 3);
  f.root.dispatchEvent(
    new window.CompositionEvent("compositionend", {
      bubbles: true,
      data: "测试",
    }),
  );
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.equal(f.model.text, "> 第测试一行\n> 第二行\n");
  f.editor.undo();
  assert.equal(f.model.text, "> 第一行\n> 第二行\n");
  f.close();
});
test("table structural commands retain escaped pipe content in its original cell", () => {
  const source = "| 名称 | 内容 |\n| --- | --- |\n| `A\\|B` | C |\n";
  const f = fixture(source);
  point(f.editor, source.indexOf("C"));
  f.editor.tableAction("column");
  assert.match(f.model.text, /\| `A\\\|B` \| C \|  \|/);
  assert.equal(f.root.querySelectorAll("tbody td").length, 3);
  f.editor.undo();
  assert.equal(f.model.text, source);
  f.close();
});
test("typing after Enter in a task item preserves its marker separator", () => {
  const f = fixture("- [ ] 任务\n");
  point(f.editor, 8);
  input(f.root, "insertParagraph");
  input(f.root, "insertText", "后续");
  assert.equal(f.model.text, "- [ ] 任务\n- [ ] 后续\n");
  f.editor.undo();
  f.editor.undo();
  assert.equal(f.model.text, "- [ ] 任务\n");
  f.close();
});
test("Enter inside nested emphasis creates balanced formatting on both sides of the paragraph split", () => {
  const f = fixture("***一二三四***\n");
  point(f.editor, 5);
  input(f.root, "insertParagraph");
  assert.equal(f.model.text, "***一二***\n\n***三四***\n");
  assert.equal(f.root.querySelectorAll("strong").length, 2);
  f.editor.undo();
  assert.equal(f.model.text, "***一二三四***\n");
  f.close();
});
test("Backspace and Delete at paragraph boundaries merge paragraphs as one reversible operation", () => {
  const f = fixture("前文\n\n后文\n");
  point(f.editor, 4);
  input(f.root, "deleteContentBackward");
  assert.equal(f.model.text, "前文后文\n");
  f.editor.undo();
  point(f.editor, 2);
  input(f.root, "deleteContentForward");
  assert.equal(f.model.text, "前文后文\n");
  f.editor.undo();
  assert.equal(f.model.text, "前文\n\n后文\n");
  f.close();
});
test("document-tree serialization retains invisible reference definitions and exact block separators", () => {
  const source = "\n\n# #\n\n\n[引用][id]\n\n[id]: https://example.com\n\n\n";
  const f = fixture(source);
  assert.equal(f.model.serialize(), source);
  point(f.editor, source.indexOf("引用") + 1);
  input(f.root, "insertText", "新");
  assert.equal(f.model.toMarkdown(), source.replace("引用", "引新用"));
  f.close();
});
test("inline list fences strip and retain their continuation indentation", () => {
  const f = fixture("- ```javascript\n  const value = 1;\n  ```\n");
  const leaf = [...f.editor.leaves.values()].find(
    (leaf) => leaf.kind === "fence",
  );
  assert.equal(leaf.raw, "const value = 1;\n");
  assert.equal(f.model.text[leaf.positions[0]], "c");
  f.close();
});
test("copy and paste within the editor retain nested formatting and normal plain text", () => {
  const f = fixture("***粗体***\n");
  const start = f.model.text.indexOf("粗体");
  f.model.selection = { anchor: start, head: start + 2 };
  f.editor.restore();
  const data = new Map(),
    clipboard = {
      files: [],
      setData(type, value) {
        data.set(type, value);
      },
      getData(type) {
        return data.get(type) || "";
      },
    };
  const copy = new window.Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(copy, "clipboardData", { value: clipboard });
  f.root.dispatchEvent(copy);
  assert.equal(data.get("text/plain"), "粗体");
  assert.equal(data.get("text/x-open-typora-markdown"), "***粗体***");
  assert.match(
    data.get("text/html"),
    /<em><strong>粗体<\/strong><\/em>|<strong><em>粗体<\/em><\/strong>/,
  );
  point(f.editor, f.model.text.length);
  const paste = new window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", { value: clipboard });
  f.root.dispatchEvent(paste);
  assert.equal(f.model.text, "***粗体***\n***粗体***");
  f.editor.undo();
  assert.equal(f.model.text, "***粗体***\n");
  f.close();
});
test("Backspace at heading text converts to a paragraph and empty quote Enter exits the quote", () => {
  const heading = fixture("## 标题");
  point(heading.editor, 3);
  input(heading.root, "deleteContentBackward");
  assert.equal(heading.model.text, "标题");
  heading.editor.undo();
  assert.equal(heading.model.text, "## 标题");
  heading.close();
  const quote = fixture("> ");
  point(quote.editor, 2);
  input(quote.root, "insertParagraph");
  assert.equal(quote.model.text, "");
  quote.editor.undo();
  assert.equal(quote.model.text, "> ");
  quote.close();
});
test("quoted task toggle addresses its marker while literal tasks in code stay unchanged", () => {
  const original = "```\n- [ ] literal\n```\n\n> - [ ] task\n";
  const f = fixture(original);
  const box = f.root.querySelector('input[type="checkbox"]');
  assert.ok(box);
  box.click();
  assert.equal(f.model.text, original.replace("> - [ ] task", "> - [x] task"));
  f.editor.undo();
  assert.equal(f.model.text, original);
  f.close();
});
test.after(() => dom.window.close());
