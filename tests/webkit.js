const passed = [],
  errors = [];
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) =>
  errors.push(String(event.reason)),
);
const wait = async (predicate) => {
  for (let n = 0; n < 200; n++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Condition not reached");
};
const check = (condition, label) => {
  if (!condition) throw new Error(label);
  passed.push(label);
  window.webkit.messageHandlers.opentypora.postMessage({
    id: "test-progress",
    name: "progress",
    args: [label],
  });
};
const root = () =>
  document.querySelector(".document-editor:not([hidden]) .rich-document");
const pointText = (value, offset) => {
  const walker = document.createTreeWalker(root(), NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.data.includes(value)) {
      root().focus();
      getSelection().setBaseAndExtent(
        node,
        node.data.indexOf(value) + offset,
        node,
        node.data.indexOf(value) + offset,
      );
      return;
    }
  }
  throw new Error("Missing editable text: " + value);
};
const input = (type, data = null) =>
  root().dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: type,
      data,
    }),
  );
const sourceMode = async (value) => {
  const button = document.querySelector(".source-toggle");
  if ((button.getAttribute("aria-pressed") === "true") !== value)
    button.click();
  await wait(() =>
    value
      ? !!document.querySelector(".source-surface:not([hidden]) .cm-line")
      : !document.querySelector(".rich-scroller[hidden]"),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
};
const readSource = () =>
  [
    ...document.querySelectorAll(
      ".document-editor:not([hidden]) .source-surface .cm-line",
    ),
  ]
    .map((node) => node.textContent)
    .join("\n");
try {
  await wait(() => root()?.querySelector("strong"));
  check(
    location.protocol === "opentypora:" && window.desktop !== undefined,
    "bundled modules load through native WebKit scheme and bridge",
  );
  const originalResponse = await window.desktop.restore();
  if (!originalResponse.ok) throw new Error(originalResponse.error);
  const original = originalResponse.value.documents[0].content;
  await wait(() => root().querySelectorAll(".mathjax-node svg").length === 2);
  check(
    !root().querySelector(".math-error,[data-mjx-error]"),
    "offline MathJax SVG renders document macros and extended fonts",
  );
  pointText("粗体", 1);
  document.dispatchEvent(new Event("selectionchange"));
  check(
    root()
      .querySelector('[data-mark="strong"]')
      .classList.contains("md-expand") &&
      !root().querySelector('[data-mark="em"]').classList.contains("md-expand"),
    "only the inline containing the collapsed caret expands",
  );
  input("insertText", "测");
  await sourceMode(true);
  check(
    readSource() === original.replace("粗体", "粗测体"),
    "rich DOM edit produces exact Markdown in separate source view",
  );
  window.__openTypora.command({ action: "undo" });
  await new Promise((resolve) => setTimeout(resolve, 100));
  check(
    readSource() === original.replace("粗体", "粗测体"),
    "fresh source view cannot undo an earlier rich edit",
  );
  await sourceMode(false);
  window.__openTypora.command({ action: "undo" });
  await wait(() => root().querySelector("strong").textContent === "粗体");
  check(true, "returning to rich mode restores its own undo history");
  window.__openTypora.command({ action: "redo" });
  await wait(() => root().querySelector("strong").textContent === "粗测体");
  check(true, "rich redo restores the edit after a source-view round trip");
  pointText("粗测体", 2);
  input("insertText", "新");
  const untouched = root().querySelector("h1");
  pointText("任务", 2);
  input("insertParagraph");
  input("insertText", "后续");
  check(
    root().querySelector("h1") === untouched,
    "an unaffected block keeps its actual DOM node across structural edits",
  );
  const checkbox = root().querySelector('input[type="checkbox"]');
  checkbox.click();
  await sourceMode(true);
  check(
    readSource().includes("- [x] 任务\n- [ ] 后续"),
    "task toggle and Enter keep task-list structure",
  );
  await sourceMode(false);
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=",
    ),
    (char) => char.charCodeAt(0),
  );
  const imported = await window.desktop.importImage(
    "webkit-fixture",
    png,
    "fixture.png",
  );
  if (!imported.ok) throw new Error(imported.error);
  pointText("WebKit 验收", 9);
  const transfer = new DataTransfer();
  transfer.setData("text/plain", "\n\n![验收](" + imported.value + ")\n\n");
  root().dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }),
  );
  await wait(() => root().querySelector("img")?.naturalWidth === 1);
  check(
    true,
    "native scoped image scheme resolves an encoded relative asset path",
  );
  await sourceMode(true);
  const source = readSource();
  const saved = await window.desktop.save(
    "webkit-fixture",
    source,
    false,
    false,
  );
  if (!saved.ok) throw new Error(saved.error);
  check(
    saved.value.content === source,
    "native save bridge returns the exact source content",
  );
  window.__openTypora.command({ action: "pdf" });
  await wait(() =>
    document.querySelector(".toast")?.textContent.includes("PDF 已导出"),
  );
  check(
    true,
    "native PDF export completes asynchronously without blocking the editor",
  );
  await sourceMode(false);
  pointText("粗测新体", 2);
  input("insertText", "保留");
  window.__openTypora.command({ action: "close-window" });
  await new Promise((resolve) => setTimeout(resolve, 200));
  check(
    root().querySelector("strong").textContent.includes("保留"),
    "cancelled native close retains the dirty document and live editor",
  );
  check(errors.length === 0, "no WebKit runtime error or rejected promise");
  return { passed, errors, source };
} catch (error) {
  return {
    passed,
    errors,
    error: String(error),
    stack: error.stack,
    source: readSource(),
  };
}
