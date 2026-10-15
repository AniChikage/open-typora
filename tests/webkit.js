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
  const uploadedImage = await window.desktop.imageAction("webkit-fixture", [imported.value], "upload", {imageUploader:uploaderURL});
  if (!uploadedImage.ok) throw new Error(uploadedImage.error);
  check(uploadedImage.value[imported.value] === "https://images.example.invalid/owned-fixture.png", "native PicGo upload validates the response from an owned local HTTP server");
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
  const renamedFile = await window.desktop.fileOperation({action:'rename', path:saved.value.path, name:'Renamed-fixture.md'});
  if (!renamedFile.ok) throw new Error(renamedFile.error);
  await wait(() => document.querySelector('.document-title')?.textContent.includes('Renamed-fixture.md'));
  const undoneFile = await window.desktop.fileOperation({action:'undo'});
  if (!undoneFile.ok) throw new Error(undoneFile.error);
  await wait(() => document.querySelector('.document-title')?.textContent.includes('WebKit-fixture.md'));
  check(readSource() === source, "native file operation preparation, path synchronization and undo preserve exact editor bytes");
  window.__openTypora.command({ action: "pdf" });
  await wait(() =>
    document.querySelector(".toast")?.textContent.includes("PDF 已导出"),
  );
  check(
    true,
    "native PDF export completes asynchronously without blocking the editor",
  );
  const longHtml = '<!doctype html><html><head><style>html,body{margin:0;padding:0}.print-document{display:flow-root;font:14px/24px sans-serif}h2{margin:20px 0 8px}table{width:100%;border-collapse:collapse}td{padding:10px;border:1px solid #ccc}p{margin:0 0 16px}</style></head><body><article class="print-document"><h1>Pagination fixture</h1>' + Array.from({length:90}, (_, i) => '<h2>Heading-' + String(i+1).padStart(3,'0') + '</h2><p>Paragraph-' + String(i+1).padStart(3,'0') + ' keeps each complete line on a page.</p>').join('') + '<table>' + Array.from({length:30}, (_, i) => '<tr><td>Row-' + String(i+1).padStart(3,'0') + '</td><td>Complete table cell</td></tr>').join('') + '</table></article></body></html>';
  const longPdf = await window.desktop.exportPdf(longHtml, {testName:'long', paper:'letter', margin:42, title:'Pagination fixture', header:'${title}', footer:'${pageNo} / ${totalPages}'});
  if (!longPdf.ok) throw new Error(longPdf.error);
  check(true, "long PDF uses configurable paper, margins, headers and line-aware page boundaries");
  const marginPdf = await window.desktop.exportPdf('<!doctype html><html><head><style>html,body{margin:0;padding:0}.print-document{display:flow-root}p{margin:0 0 800px;font:16px/24px sans-serif}</style></head><body><article class="print-document"><p>Trailing margin regression</p></article></body></html>');
  if (!marginPdf.ok) throw new Error(marginPdf.error);
  check(true, "native PDF ignores an unpainted trailing block margin");
  window.__openTypora.command({ action: "html" });
  await wait(() => document.querySelector(".toast")?.textContent.includes("HTML 已导出"));
  check(true, "native HTML export embeds local fonts and images without live app links");
  const reopenDraft = {id:'reopen-draft',path:null,name:'Reopen-draft.md',content:'',savedContent:'',diskHash:null,lineEnding:'\n'};
  const registeredDraft = await window.desktop.registerDraft(reopenDraft); if (!registeredDraft.ok) throw new Error(registeredDraft.error);
  window.__openTypora.command({action:'opened',document:reopenDraft}); await wait(() => document.querySelector('.document-title')?.textContent === 'Reopen-draft.md');
  window.__openTypora.command({action:'close'}); await wait(() => document.querySelector('.document-title')?.textContent === 'WebKit-fixture.md');
  window.__openTypora.command({action:'reopen'}); await wait(() => document.querySelector('.document-title')?.textContent === 'Reopen-draft.md');
  check(true, "native reopen falls back to the same-window closed-document history when no closed window exists");
  window.__openTypora.command({action:'close'}); await wait(() => document.querySelector('.document-title')?.textContent === 'WebKit-fixture.md');
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
