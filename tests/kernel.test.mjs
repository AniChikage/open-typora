import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>", {
  pretendToBeVisual: true,
  url: "https://editor.test/",
});
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
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
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(f.model.text, "中文组合输入\n");
  assert.equal(f.changes(), 1);
  f.editor.undo();
  assert.equal(f.model.text, "中文输入\n");
  f.close();
});
test("composition at an empty paragraph element commits and restores through undo and redo", async () => {
  const f = fixture("第一段");
  point(f.editor, f.model.text.length);
  input(f.root, "insertParagraph");
  const before = f.model.text;
  const empty = [...f.root.querySelectorAll("[data-leaf]")].find(element => !element.textContent);
  assert.ok(empty);
  assert.equal(window.getSelection().anchorNode, empty);
  empty.dispatchEvent(new window.CompositionEvent("compositionstart", { bubbles: true }));
  empty.textContent = "你好";
  window.getSelection().collapse(empty.firstChild, 2);
  empty.dispatchEvent(new window.InputEvent("input", { bubbles: true, isComposing: true, inputType: "insertCompositionText", data: "你好" }));
  assert.equal(f.model.text, before);
  empty.dispatchEvent(new window.CompositionEvent("compositionend", { bubbles: true, data: "你好" }));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.model.text, before + "你好");
  f.editor.undo();
  assert.equal(f.model.text, before);
  assert.ok(!f.root.textContent.includes("你好"), "undo updates the browser-owned composition DOM");
  f.editor.redo();
  assert.equal(f.model.text, before + "你好");
  assert.ok(f.root.textContent.includes("你好"));
  f.close();
});
test("IME key 229 cannot split a paragraph before compositionstart", () => {
  const f = fixture("中文输入\n"); point(f.editor,2);
  const event = new window.KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"Enter",keyCode:229});
  f.root.dispatchEvent(event);
  assert.equal(event.defaultPrevented,false); assert.equal(f.model.text,"中文输入\n"); f.close();
});
test("composition final input after compositionend microtasks commits once and cancel creates no undo", async () => {
  const f = fixture("输入\n"); point(f.editor,2);
  const leaf = f.root.querySelector("[data-leaf]"), node = leaf.firstChild;
  leaf.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));
  node.data = "输入ni";
  leaf.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:"你"}));
  await Promise.resolve();
  assert.equal(f.editor.composing,true); assert.equal(f.model.text,"输入\n");
  node.data = "输入你"; window.getSelection().collapse(node,3);
  leaf.dispatchEvent(new window.InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"insertText",data:"你"}));
  leaf.dispatchEvent(new window.InputEvent("input",{bubbles:true,inputType:"insertText",data:"你"}));
  await new Promise(resolve => setTimeout(resolve,5));
  assert.equal(f.model.text,"输入你\n"); assert.equal(f.changes(),1);
  f.editor.undo(); assert.equal(f.model.text,"输入\n");
  const original = f.changes();
  f.root.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));
  f.root.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:""}));
  await new Promise(resolve => setTimeout(resolve,5));
  assert.equal(f.changes(),original); assert.equal(f.model.canUndo,false); f.close();
});
test("Chinese replacement across paragraphs removes the selected source range in one undoable edit", async () => {
  const source = "第一段\n\n第二段\n", f = fixture(source);
  f.model.selection={anchor:1,head:7}; f.editor.restore();
  const first=f.root.querySelectorAll("[data-leaf]")[0], second=f.root.querySelectorAll("[data-leaf]")[1];
  first.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true}));
  first.textContent="第替换段"; second.remove(); window.getSelection().collapse(first.firstChild,3);
  first.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:"替换"}));
  await new Promise(resolve => setTimeout(resolve,5));
  assert.equal(f.model.text,"第替换段\n"); f.editor.undo(); assert.equal(f.model.text,source); assert.deepEqual(f.model.selection,{anchor:1,head:7}); f.close();
});
test("repeated Chinese replacement across paragraphs stays anchored to the selected source", async () => {
  for (const value of ['同','同同','中文😀']) {
    const source='同\n\n同\n', f=fixture(source);
    try {
      f.model.selection={anchor:0,head:4}; f.editor.restore();
      const [first,second]=f.root.querySelectorAll('[data-leaf]');
      first.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true}));
      first.textContent=value; second.remove(); window.getSelection().collapse(first.firstChild,value.length);
      first.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:value}));
      await new Promise(resolve=>setTimeout(resolve,5));
      assert.equal(f.model.text,value+'\n'); assert.equal(f.changes(),1);
      f.editor.undo(); assert.equal(f.model.text,source); assert.deepEqual(f.model.selection,{anchor:0,head:4});
      f.editor.redo(); assert.equal(f.model.text,value+'\n');
    } finally { f.close(); }
  }
});
test("composition survives the browser replacing the edited paragraph element",async()=>{
  const f=fixture('输入区：end\n');
  try {
    point(f.editor,4);const leaf=f.root.querySelector('[data-leaf]');
    leaf.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true}));
    const replacement=document.createElement('p');replacement.textContent='输入区：你好😀end';leaf.replaceWith(replacement);
    window.getSelection().collapse(replacement.firstChild,8);
    f.root.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:'你好😀'}));
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(f.model.text,'输入区：你好😀end\n');f.editor.undo();assert.equal(f.model.text,'输入区：end\n');
  } finally {f.close();}
});
test("separate Chinese candidate commits remain separate undo groups", async () => {
  const f=fixture("输入\n"); point(f.editor,2);
  for(const value of ["你","好"]) {
    const leaf=f.root.querySelector("[data-leaf]");
    leaf.dispatchEvent(new window.CompositionEvent("compositionstart",{bubbles:true})); leaf.firstChild.data+=value;
    window.getSelection().collapse(leaf.firstChild,leaf.firstChild.length);
    leaf.dispatchEvent(new window.CompositionEvent("compositionend",{bubbles:true,data:value}));
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.equal(f.model.text,"输入你好\n"); f.editor.undo(); assert.equal(f.model.text,"输入你\n"); f.editor.undo(); assert.equal(f.model.text,"输入\n"); f.close();
});
test("CodeMirror composition sessions preserve redo on cancellation and commit as one edit",()=>{
  const doc=new MarkdownDocument('原文');
  doc.replace(2,2,'后');doc.undo();assert.equal(doc.canRedo,true);
  doc.beginComposition();doc.replace(2,2,'ni','composition');doc.replace(2,4,'','composition');
  assert.equal(doc.endComposition(),false);assert.equal(doc.text,'原文');assert.equal(doc.canUndo,false);assert.equal(doc.canRedo,true);
  doc.redo();assert.equal(doc.text,'原文后');
  doc.beginComposition();doc.replace(3,3,'zhong','composition');doc.replace(3,8,'中文','composition');doc.endComposition();
  assert.equal(doc.text,'原文后中文');doc.undo();assert.equal(doc.text,'原文后');doc.redo();assert.equal(doc.text,'原文后中文');
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
  assert.equal(f.model.text, source.replace("|  |  |", "|  | 末 |"));
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
  await new Promise((resolve) => setTimeout(resolve, 5));
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
test("paragraph commands preserve quote/list containers, caret and one-step undo", () => {
  const f = fixture("> - 原文\n");
  point(f.editor, f.model.text.indexOf("原文") + 1);
  f.editor.command("heading-2");
  assert.equal(f.model.text, "> - ## 原文\n");
  assert.equal(f.model.text[f.editor.bookmark().head], "文");
  f.editor.undo(); assert.equal(f.model.text, "> - 原文\n");
  f.editor.command("ordered-list"); assert.equal(f.model.text, "> 1. 原文\n");
  f.editor.undo(); f.close();
});
test("empty-caret formatting starts on input rather than turning delimiter placeholders into a horizontal rule", () => {
  const f = fixture(""); point(f.editor, 0);
  f.editor.wrap("**", "**"); assert.equal(f.model.text, "");
  input(f.root, "insertText", "文字");
  assert.equal(f.model.text, "**文字**"); assert.equal(f.root.querySelector("strong").textContent, "文字");
  f.editor.undo(); assert.equal(f.model.text, ""); f.close();
});
test("TOC and heading anchors update across edits including duplicate formatted headings", () => {
  const f = fixture("[toc]\n\n# **标题**\n\n## 标题\n");
  assert.equal(f.root.querySelectorAll(".markdown-toc a").length, 2);
  assert.equal(f.root.querySelector("h1").id, "标题");
  assert.equal(f.root.querySelector("h2").id, "标题-1");
  point(f.editor, f.model.text.indexOf("标题") + 1); input(f.root, "insertText", "新");
  assert.equal(f.root.querySelector(".markdown-toc a").textContent, "标新题");
  f.root.querySelectorAll(".markdown-toc a")[1].click();
  assert.equal(f.model.selection.head, f.model.text.indexOf("## 标题"));
  f.close();
});
test("footnote references render, definitions remain directly editable, and code literals do not affect numbering", () => {
  const source = "`[^a]` and [^b]\n\n[^a]: unused\n\n[^b]: **note**\n";
  const f = fixture(source);
  assert.equal(f.model.toMarkdown(), source);
  assert.equal(f.root.querySelector(".footnote-reference a").textContent, "1");
  assert.equal(f.root.querySelectorAll(".md-footnote-definition").length, 2);
  point(f.editor, source.indexOf("note") + 2); input(f.root, "insertText", "X");
  assert.equal(f.model.text, source.replace("note", "noXte"));
  f.editor.undo(); assert.equal(f.model.text, source); f.close();
});
test("highlight, subscript, superscript, emoji and safe underline keep original source and editable offsets", () => {
  const source = "==高亮== H~2~O X^2^ :smile: <u>下划线</u> <span style=\"color:red\">颜色</span>";
  const f = fixture(source);
  assert.equal(f.model.toMarkdown(), source);
  assert.equal(f.root.querySelector("mark").textContent, "高亮");
  assert.equal(f.root.querySelector("sub").textContent, "2");
  assert.equal(f.root.querySelector("sup").textContent, "2");
  assert.ok(f.root.querySelector('[data-mark="emoji"]'));
  assert.equal(f.root.querySelector("u").textContent, "下划线");
  point(f.editor, source.indexOf("高亮") + 1); input(f.root, "insertText", "新");
  assert.equal(f.model.text, source.replace("高亮", "高新亮"));
  f.editor.undo(); f.close();
});
test("HTML clipboard paste converts formatted paragraphs and tables to editable Markdown", () => {
  const f = fixture(""); point(f.editor, 0);
  const event = new window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files: [], getData(type) { return type === "text/html" ? '<h2>Title</h2><p><strong>Bold</strong> <a href="https://example.com">Link</a></p><script>alert(1)</script><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>X</td><td>Y</td></tr></tbody></table>' : ""; } } });
  f.root.dispatchEvent(event);
  assert.match(f.model.text, /^## Title/); assert.match(f.model.text, /\*\*Bold\*\*/); assert.match(f.model.text, /\[Link\]\(https:\/\/example.com\)/);
  assert.ok(f.root.querySelector("table")); assert.ok(!f.model.text.includes("alert(1)"));
  f.editor.undo(); assert.equal(f.model.text, ""); f.close();
});
test("table movement carries alignment and escaped cell content and remains undoable", () => {
  const source = "| A | B |\n| :--- | ---: |\n| x\\|y | z |\n| one | two |\n";
  const f = fixture(source); point(f.editor, source.indexOf("z"));
  f.editor.command("table-moveColumnLeft");
  assert.match(f.model.text, /^\| B \| A \|\n\| ---: \| :--- \|\n\| z \| x\\\|y \|/);
  f.editor.undo(); assert.equal(f.model.text, source);
  point(f.editor, source.indexOf("one")); f.editor.command("table-moveRowUp");
  assert.ok(f.model.text.indexOf("one") < f.model.text.indexOf("x\\|y"));
  f.editor.undo(); assert.equal(f.model.text, source); f.close();
});
test("auto pair skips an existing closing bracket and deletes a complete empty pair", () => {
  const f = fixture(""); f.editor.setOptions({ spellcheck: false, tabSize: 2, typewriter: false, autoPair: true }); point(f.editor, 0);
  input(f.root, "insertText", "("); assert.equal(f.model.text, "()");
  input(f.root, "insertText", "x"); input(f.root, "insertText", ")");
  assert.equal(f.model.text, "(x)"); assert.equal(f.model.selection.head, 3);
  f.close();
  const empty = fixture(""); empty.editor.setOptions({ spellcheck: false, tabSize: 2, typewriter: false, autoPair: true }); point(empty.editor, 0);
  input(empty.root, "insertText", "["); input(empty.root, "deleteContentBackward"); assert.equal(empty.model.text, ""); empty.close();
  const emoji = fixture("👨‍👩‍👧‍👦"); emoji.editor.setOptions({ spellcheck: false, tabSize: 2, typewriter: false, autoPair: true }); point(emoji.editor, emoji.model.text.length);
  input(emoji.root, "deleteContentBackward"); assert.equal(emoji.model.text, ""); emoji.close();
});
test("formatting across paragraphs and list items formats each editable body without corrupting block markers", () => {
  const source = "first\n\n- second\n- third\n";
  const f = fixture(source); f.model.selection = { anchor: 0, head: source.length - 1 }; f.editor.restore();
  f.editor.wrap("**", "**");
  assert.equal(f.model.text, "**first**\n\n- **second**\n- **third**\n");
  assert.equal(f.root.querySelectorAll("strong").length, 3);
  f.editor.undo(); assert.equal(f.model.text, source); f.close();
});
test("inline-code wrapping chooses a delimiter longer than the contained backticks and toggles it correctly", () => {
  const source = "use `value` now";
  const f = fixture(source); f.model.selection = { anchor: 0, head: source.length }; f.editor.restore();
  f.editor.wrap("`", "`"); assert.equal(f.model.text, "``use `value` now``");
  point(f.editor, 5); f.editor.wrap("`", "`"); assert.equal(f.model.text, source); f.close();
});
test("front matter is editable in rich mode but excluded from heading navigation and exported text", async () => {
  const { extractHeadings, renderMarkdown } = await import("../src/editor/markdown.ts");
  const source = "---\ntitle: 元数据\n---\n\n# 正文\n\n文字\n";
  const f = fixture(source);
  assert.equal(f.model.toMarkdown(), source);
  assert.equal(extractHeadings(source).length, 1);
  assert.ok(!renderMarkdown(source).includes("元数据"));
  assert.ok(f.root.querySelector(".md-frontmatter").textContent.includes("元数据"));
  f.close();
});
test("comments preserve editable source and remain absent from HTML export", async () => {
  const { renderMarkdown } = await import("../src/editor/markdown.ts");
  const source = "文字 <!-- 注释内容 --> 继续";
  const f = fixture(source); assert.equal(f.model.toMarkdown(), source);
  assert.ok(f.root.querySelector(".md-comment-view").textContent.includes("注释内容"));
  assert.ok(!renderMarkdown(source).includes("注释内容")); f.close();
});
test("word statistics exclude Markdown syntax and count each Han character as one word", async () => {
  const { documentStatistics } = await import("../src/editor/statistics.ts");
  const source = "## 中文 text **bold**\n\n- item";
  const stats = documentStatistics(source);
  assert.equal(stats.words, 5); assert.equal(stats.characters, Array.from(source).length); assert.equal(stats.lines, 3);
});
test.after(() => dom.window.close());

test("partial nested clear-format preserves styles on both sides and undoes once", () => {
  const value = fixture("**bold *middle* tail**\n\nsecond **styled**\n");
  try {
    const from = value.model.text.indexOf("middle") + 1, to = from + 3;
    value.model.selection = { anchor: from, head: to }; value.editor.restore(); value.editor.clearFormat();
    assert.ok(value.model.text.includes("idd"));
    assert.equal(value.root.querySelectorAll("strong").length >= 2, true);
    assert.equal([...value.root.querySelectorAll("strong")].some(el => el.textContent.includes("idd")), false);
    value.editor.undo(); assert.equal(value.model.toMarkdown(), "**bold *middle* tail**\n\nsecond **styled**\n");
  } finally { value.close(); }
});
test("table grid paste expands dimensions, escapes pipes, and undoes in one step", () => {
  const original = "| A | B |\n| --- | --- |\n| C | D |\n", value = fixture(original);
  try {
    const cell = value.root.querySelector("td");
    value.editor.pasteTable([["1", "2", "3"], ["x|y", "z", "4"]], cell);
    assert.equal(value.root.querySelectorAll("tr").length, 3);
    assert.equal(value.root.querySelectorAll("th").length, 3);
    assert.ok(value.model.text.includes("x\\|y"));
    value.editor.undo(); assert.equal(value.model.toMarkdown(), original);
  } finally { value.close(); }
});
test("alerts and raw HTML previews retain exact source while stripping active markup", async () => {
  const { renderMarkdown } = await import("../src/editor/markdown.ts");
  const original = '> [!NOTE]\n> 提示 **内容**\n\n<div data-leaf="forged" onclick="evil()"><strong>HTML 中文</strong><script>evil()</script></div>\n';
  const value = fixture(original);
  try {
    assert.ok(value.root.querySelector(".markdown-alert-note")); assert.equal(value.root.querySelector(".markdown-alert-title").textContent, "Note"); assert.ok(value.root.querySelector(".md-html .fence-preview strong"));
    assert.equal(value.root.querySelector("[onclick],script,[data-leaf=forged]"), null);
    assert.equal(value.model.toMarkdown(), original);
    assert.ok(!renderMarkdown(original).includes("<script>"));
  } finally { value.close(); }
});
test("image sizing syntax preserves alt text and exact paths", async () => {
  const { imageReferences, imageMarkdown, updateImageReferences } = await import("../src/editor/images.ts");
  const source = '前文 ![图](<assets/中文 图.png>)\n\n<img src="old.png" width="50%" alt="描述" />\n';
  const images = imageReferences(source); assert.equal(images.length, 2); assert.equal(images[0].url, "assets/中文 图.png");
  assert.ok(imageMarkdown(images[0].url, images[0].alt, "400").includes('width="400"'));
  assert.ok(updateImageReferences(source, { "old.png": "new.png" }).includes('width="50%"'));
});


test("read-only mode blocks DOM typing, paste, cut and composition while retaining selection and restoring editing", () => {
  const f = fixture("# Title\n\nOriginal **text**.\n");
  try {
    point(f.editor, 12);
    f.editor.setOptions({spellcheck:false,tabSize:2,typewriter:false,readOnly:true});
    const original = f.model.toMarkdown();
    for (const [type, options] of [["beforeinput",{inputType:"insertText",data:"blocked"}],["paste",{}],["cut",{}],["compositionstart",{}]]) {
      const event = type === "beforeinput" ? new dom.window.InputEvent(type,{bubbles:true,cancelable:true,...options}) : new dom.window.Event(type,{bubbles:true,cancelable:true});
      f.root.dispatchEvent(event); assert.equal(event.defaultPrevented,true);
    }
    assert.equal(f.model.toMarkdown(),original); assert.equal(f.changes(),0);
    f.editor.setOptions({spellcheck:false,tabSize:2,typewriter:false,readOnly:false});
    f.root.dispatchEvent(new dom.window.InputEvent("beforeinput",{bubbles:true,cancelable:true,inputType:"insertText",data:"X"}));
    assert.notEqual(f.model.toMarkdown(),original); f.editor.undo(); assert.equal(f.model.toMarkdown(),original);
  } finally { f.close(); }
});

test("Tab and Shift-Tab transform every selected list line, including quoted lists, in one undo step", () => {
  for (const source of ["- alpha\n- beta\n- gamma\n", "> - alpha\n> - beta\n> - gamma\n"]) {
    const f = fixture(source);
    try {
      const from = source.indexOf('alpha'), to = source.indexOf('gamma');
      f.model.selection = {anchor:to,head:from}; f.editor.restore();
      f.root.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
      const expected = source.split('\n').map(line => line ? line.replace(/^(> )?/, '$1  ') : line).join('\n');
      assert.equal(f.model.toMarkdown(),expected);
      assert.ok(f.editor.bookmark().anchor > f.editor.bookmark().head, 'retain backward selection');
      f.root.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
      assert.equal(f.model.toMarkdown(),source);
      f.editor.undo(); assert.equal(f.model.toMarkdown(),expected);
      f.editor.undo(); assert.equal(f.model.toMarkdown(),source);
    } finally {f.close();}
  }
});
test("table modified Enter inserts a row and soft Enter stays inside one Markdown cell", () => {
  const source = '| A | B |\n| --- | --- |\n| alpha | beta |\n| gamma | delta |\n';
  const f = fixture(source);
  try {
    point(f.editor,source.indexOf('alpha')+2);
    f.root.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',metaKey:true,bubbles:true,cancelable:true}));
    assert.equal(f.root.querySelectorAll('tbody tr').length,3);
    assert.ok(f.model.text.indexOf('gamma') > f.model.text.indexOf('|  |  |'));
    f.editor.undo(); assert.equal(f.model.toMarkdown(),source);
    point(f.editor,source.indexOf('alpha')+2); input(f.root,'insertLineBreak');
    assert.ok(f.model.text.includes('| al<br>pha | beta |'));
    assert.equal(f.root.querySelectorAll('td br').length,1);
    assert.equal(f.root.querySelectorAll('tbody tr').length,2);
    input(f.root,'insertText','中'); assert.ok(f.model.text.includes('| al<br>中pha | beta |'));
    f.editor.undo();
    input(f.root,'deleteContentBackward'); assert.equal(f.model.toMarkdown(),source);
    f.editor.undo(); assert.ok(f.model.text.includes('| al<br>pha | beta |'));
    f.editor.undo(); assert.equal(f.model.toMarkdown(),source);
    point(f.editor,source.indexOf('alpha')+5); input(f.root,'insertLineBreak');
    assert.equal(f.root.querySelectorAll('[data-break-placeholder]').length,1);
    input(f.root,'insertText','新行'); assert.ok(f.model.text.includes('| alpha<br>新行 | beta |'));
    assert.equal(f.root.querySelectorAll('[data-break-placeholder]').length,0);
    f.editor.undo(); input(f.root,'deleteContentBackward'); assert.equal(f.model.toMarkdown(),source);
    f.editor.undo(); point(f.editor,source.indexOf('alpha')+5); input(f.root,'deleteContentForward');
    assert.equal(f.model.toMarkdown(),source);
  } finally {f.close();}
});
test("selection commands respect inline scopes, CJK words and single-step deletion undo", () => {
  const source = 'Hello **brave *new* world** today\n\n中文输入测试。';
  const f = fixture(source);
  point(f.editor,source.indexOf('new')+1);
  f.editor.command('select-word');
  assert.equal(f.editor.clipboard().plain,'new');
  f.editor.command('select-scope');
  assert.equal(f.editor.clipboard().plain,'brave new world');
  f.editor.command('select-scope');
  assert.equal(f.editor.clipboard().plain,'Hello brave new world today');
  point(f.editor,source.indexOf('brave')+2);
  f.editor.command('delete-word');
  assert.equal(f.model.text,source.replace('brave',''));
  f.editor.undo(); assert.equal(f.model.text,source);
  point(f.editor,source.indexOf('输入')+1);
  f.editor.command('select-word'); assert.equal(f.editor.clipboard().plain,'输入');
  f.close();
});
test("word deletion beside adjacent formatting never consumes Markdown delimiters", () => {
  const f = fixture('**hello**world');
  point(f.editor,4); f.editor.command('select-word');
  assert.equal(f.editor.clipboard().plain,'hello');
  f.editor.command('delete-word'); assert.equal(f.model.text,'world');
  f.editor.undo(); assert.equal(f.model.text,'**hello**world'); f.close();
});
test("table scope and line selection stay in the current cell and row; readonly still permits selection", () => {
  const source = '| A | B |\n| --- | --- |\n| **one** two | 三四 |\n| next | last |';
  const f = fixture(source);
  point(f.editor,source.indexOf('one')+1); f.editor.command('select-scope');
  assert.equal(f.editor.clipboard().plain,'one two');
  point(f.editor,source.indexOf('one')+1); f.editor.command('select-line');
  assert.ok(f.editor.clipboard().plain.includes('one two') && f.editor.clipboard().plain.includes('三四'));
  assert.ok(!f.editor.clipboard().plain.includes('next'));
  f.editor.setOptions({spellcheck:false,tabSize:2,typewriter:false,readOnly:true});
  point(f.editor,source.indexOf('one')+1); f.editor.command('select-word'); assert.equal(f.editor.clipboard().plain,'one');
  f.editor.command('delete-word'); assert.equal(f.model.text,source);
  f.editor.command('jump-selection'); assert.equal(f.editor.clipboard().plain,'one'); f.close();
});
test("HTML file URL images use the document resource bridge without enabling active URL schemes", async () => {
  const {renderMarkdown} = await import('../src/editor/markdown.ts');
  const source = '<figure><img src="file:///tmp/中文%20image.png" onerror="evil()"><figcaption>Local figure</figcaption></figure>\n\n<img src="javascript:evil()">';
  const template = document.createElement('template'); template.innerHTML=renderMarkdown(source,'owned-document');
  assert.equal(template.content.querySelector('img').getAttribute('src'),'open-typora-asset://local/owned-document/'+encodeURIComponent('file:///tmp/中文%20image.png'));
  assert.equal(template.content.querySelector('[onerror],script'),null);
  assert.ok(!template.innerHTML.includes('javascript:'));
});
test("double-dollar math inside a paragraph retains the formula view and all following editable text", () => {
  const source='before $$E=mc^2$$ after'; const f=fixture(source);
  assert.equal(f.root.querySelectorAll('.mathjax-node').length,1);
  assert.equal(f.root.querySelector('.mathjax-node').dataset.tex,'E=mc^2');
  assert.ok(f.root.textContent.includes(' after'));
  point(f.editor,source.length);input(f.root,'insertText','!');assert.equal(f.model.text,source+'!');
  f.editor.undo();assert.equal(f.model.text,source);f.close();
});


test("a pipe header followed by Enter creates an editable table with one-step undo", () => {
  for (const header of ['| Name | 中文 |', '| **Name** | 中\\|文 |', '| Only |']) {
    const f=fixture(header+'\n\nAfter');
    try {
      point(f.editor,header.length); input(f.root,'insertParagraph');
      const width=header.includes('Only')?1:2;
      assert.equal(f.root.querySelectorAll('th').length,width);
      assert.equal(f.root.querySelectorAll('td').length,width);
      assert.equal(window.getSelection().anchorNode.parentElement.closest('td')?.cellIndex,0);
      input(f.root,'insertText','内容');
      assert.equal(f.root.querySelector('td').textContent,'内容');
      f.editor.undo(); f.editor.undo(); assert.equal(f.model.text,header+'\n\nAfter');
    } finally {f.close();}
  }
});
test("typing a pipe inside a table cell preserves column count and supports undo", () => {
  const source='| A | B |\n| --- | --- |\n| alpha | beta |';
  const f=fixture(source);
  try {
    point(f.editor,source.indexOf('alpha')+2); input(f.root,'insertText','|');
    assert.equal(f.model.text,source.replace('alpha','al\\|pha'));
    assert.equal(f.root.querySelectorAll('td').length,2);
    const cell=f.root.querySelector('td').cloneNode(true); cell.querySelectorAll('.md-meta').forEach(node=>node.remove());
    assert.equal(cell.textContent,'al|pha');
    f.editor.undo(); assert.equal(f.model.text,source);
    point(f.editor,source.indexOf('alpha')+2); f.editor.insert('中|文','paste');
    assert.equal(f.model.text,source.replace('alpha','al中\\|文pha'));
  } finally {f.close();}
});

test("table pipes committed by composition retain cells, caret and one undo group",async()=>{
  const source='| A | B |\n| --- | --- |\n| alpha | beta |'; const f=fixture(source);
  try {
    point(f.editor,source.indexOf('alpha')+2);
    f.root.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true}));
    const text=window.getSelection().anchorNode;text.insertData(2,'中|文');window.getSelection().collapse(text,5);
    f.root.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:'中|文'}));
    await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(f.model.text,source.replace('alpha','al中\\|文pha'));
    assert.equal(f.model.selection.head,f.model.text.indexOf('文')+1);
    assert.equal(f.root.querySelectorAll('td').length,2);
    f.editor.undo();assert.equal(f.model.text,source);f.editor.redo();assert.equal(f.root.querySelectorAll('td').length,2);
  } finally {f.close();}
});
test("deleting an escaped table pipe removes its escape atomically without changing columns",()=>{
  const source='| A | B |\n| --- | --- |\n| al\\|pha | beta |';
  for (const backward of [true,false]) {
    const f=fixture(source);
    try {
      point(f.editor,source.indexOf('\\|')+(backward?2:0));input(f.root,backward?'deleteContentBackward':'deleteContentForward');
      assert.equal(f.model.text,source.replace('\\|',''));assert.equal(f.root.querySelectorAll('td').length,2);
      f.editor.undo();assert.equal(f.model.text,source);
    } finally {f.close();}
  }
});
test("soft Enter, selected headers, escaped final pipes and code never trigger table creation",()=>{
  for (const source of ['| A | B \\|','before\n| A | B |','```text\n| A | B |\n```']) {
    const f=fixture(source);try {point(f.editor,source.indexOf('| A')+'| A | B |'.length);input(f.root,'insertParagraph');assert.equal(f.root.querySelector('table'),null);}finally{f.close();}
  }
  const f=fixture('| A | B |');try {point(f.editor,f.model.text.length);input(f.root,'insertLineBreak');assert.equal(f.root.querySelector('table'),null);}finally{f.close();}
});

test("multiline text pasted into a table stays in one cell and undoes once",()=>{
  const source='| A | B |\n| --- | --- |\n| alpha | beta |';const f=fixture(source);
  try {
    point(f.editor,source.indexOf('alpha')+2);f.editor.insert('中文|输入\r\n第二行','paste');
    assert.equal(f.model.text,source.replace('alpha','al中文\\|输入<br>第二行pha'));
    assert.equal(f.root.querySelectorAll('td').length,2);assert.equal(f.root.querySelectorAll('td br').length,1);
    f.editor.undo();assert.equal(f.model.text,source);
  } finally {f.close();}
  const header=fixture('| A | B |');try {
    header.editor.model.selection={anchor:0,head:header.model.text.length};header.editor.restore();input(header.root,'insertParagraph');assert.equal(header.root.querySelector('table'),null);
  } finally {header.close();}
});

test("unchanged blocks retain their DOM and shifted source maps remain editable", () => {
  const f = fixture("First paragraph\n\nSecond **bold** paragraph\n\n- [ ] Task\n");
  const second = f.root.children[1], task = f.root.querySelector("input[data-task]");
  point(f.editor, 5); input(f.root,"insertText","中文");
  assert.equal(f.root.children[1],second);
  assert.equal(f.root.querySelector("input[data-task]"),task);
  assert.equal(Number(task.dataset.task),f.model.text.indexOf("[ ]")+1);
  point(f.editor,f.model.text.indexOf("Second")+6); input(f.root,"insertText","!");
  assert.ok(f.model.text.includes("Second! **bold** paragraph"));
  task.click(); assert.ok(f.model.text.includes("- [x] Task"));
  f.close();
});
test("render cache refreshes reference links, footnotes, headings and Markdown preferences", async () => {
  const f = fixture("# Title\n\n[TOC]\n\n[link][target] and footnote[^n]\n\n[target]: https://first.example\n\n[^n]: first note\n");
  f.model.replace(f.model.text.indexOf("first.example"),f.model.text.indexOf("first.example")+13,"second.example");
  f.editor.render(false); assert.equal(f.root.querySelector('a[href="https://second.example"]').textContent,"link");
  const at=f.model.text.indexOf("first note"); f.model.replace(at,at+10,"changed note");f.editor.render(false);
  assert.ok(f.root.querySelector('[data-footnote]').title.includes("changed note"));
  f.model.replace(2,7,"Renamed");f.editor.render(false);
  assert.ok(f.root.querySelector('.md-toc').textContent.includes("Renamed"));
  f.close();
  const {setMarkdownOptions}=await import('../src/editor/markdown.ts');
  const g=fixture("==marked==");
  setMarkdownOptions({highlight:false,subscript:true,superscript:true,emoji:true,inlineMath:true});
  g.editor.render(false);assert.equal(g.root.querySelector('mark'),null);
  setMarkdownOptions({highlight:true,subscript:true,superscript:true,emoji:true,inlineMath:true});
  g.editor.render(false);assert.ok(g.root.querySelector('mark'));g.close();
});
test("duplicate blocks keep unique identities through structural edits and undo", () => {
  const f=fixture("same\n\nsame\n\nunique\n\nsame\n");
  for(const text of ["new\n\n","same\n\n","# Heading\n\n"]){f.model.replace(0,0,text);f.editor.render(false);assert.equal(new Set(f.model.nodes.map(node=>node.id)).size,f.model.nodes.length);assert.equal(f.model.serialize(),f.model.text);}
  while(f.model.canUndo){f.editor.undo();assert.equal(new Set(f.model.nodes.map(node=>node.id)).size,f.model.nodes.length);}
  assert.equal(f.model.text,"same\n\nsame\n\nunique\n\nsame\n");f.close();
});
test("serialization cache clears after an external reload, encoding changes and deletion", () => {
  const f=fixture("original\r\n");f.model.replace(0,8,"changed");assert.equal(f.model.toMarkdown(),"changed\r\n");
  f.model.replaceExternal("fresh\n","\n");f.model.replace(0,f.model.text.length,"");assert.equal(f.model.toMarkdown(),"");
  f.model.undo();assert.equal(f.model.toMarkdown(),"fresh\n");f.close();
});

test("middle empty-paragraph composition undo refreshes the rich DOM after source round trip", async () => {
  const original="第一段。\n\n- [ ] 任务\n", f=fixture(original);point(f.editor,4);input(f.root,"insertParagraph");
  const empty=[...f.root.querySelectorAll('[data-leaf]')].find(element=>!element.textContent);
  empty.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true}));empty.textContent='你好';window.getSelection().collapse(empty.firstChild,2);
  empty.dispatchEvent(new window.InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'你好'}));empty.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:'你好'}));
  await new Promise(resolve=>setTimeout(resolve,5));
  f.model.beginSourceSession();f.model.endSourceSession();f.model.refreshCaret();f.editor.render(false);f.editor.undo();
  assert.equal(new Set(f.model.nodes.map(node=>node.id)).size,f.model.nodes.length);
  assert.ok(!f.root.textContent.includes('你好'));f.editor.redo();assert.ok(f.root.textContent.includes('你好'));f.editor.undo();f.editor.undo();assert.equal(f.model.text,original);f.close();
});
