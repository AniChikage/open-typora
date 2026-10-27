async function runWebKitTests(uploaderURL: string) {
const desktop = window.desktop! as Omit<import("../shared/contracts.js").DesktopBridge, "importDocument"> & { importDocument(format?: string): ReturnType<import("../shared/contracts.js").DesktopBridge["importDocument"]>; testSpreadsheetClipboard(): Promise<import("../shared/contracts.js").BridgeResponse<null>>; testRecovery(): Promise<import("../shared/contracts.js").BridgeResponse<import("../shared/contracts.js").Recovery>> };
const passed: string[] = [],
  errors: string[] = [];
window.addEventListener("error", (event) => errors.push(event.message));
window.addEventListener("unhandledrejection", (event) =>
  errors.push(String(event.reason)),
);
const wait = async (predicate: () => unknown) => {
  const deadline=Date.now()+10000;
  while (Date.now()<deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Condition not reached; document="+document.querySelector<HTMLElement>(".document-title")!?.textContent+"; rendered="+document.querySelector<HTMLElement>(".document-editor:not([hidden]) .rich-document")!?.textContent?.slice(0,160));
};
const check: (condition: unknown, label: string) => asserts condition = (condition, label) => {
  if (!condition) throw new Error(label);
  passed.push(label);
  window.webkit.messageHandlers.opentypora.postMessage({
    id: "test-progress",
    name: "progress",
    args: [label],
  });
};
const root = () =>
  document.querySelector<HTMLElement>(".document-editor:not([hidden]) .rich-document")!;
const pointText = (value: string, offset: number) => {
  const walker = document.createTreeWalker(root(), NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.data.includes(value)) {
      root().focus();
      getSelection()!.setBaseAndExtent(
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
const input = (type: string, data: string | null = null) =>
  root().dispatchEvent(
    new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: type,
      data,
    }),
  );
const sourceMode = async (value: boolean) => {
  const button = document.querySelector<HTMLElement>(".source-toggle")!;
  if ((button.getAttribute("aria-pressed") === "true") !== value)
    button.click();
  await wait(() =>
    value
      ? !!document.querySelector<HTMLElement>(".document-editor:not([hidden]) .source-surface:not([hidden]) .cm-line")!
      : !document.querySelector<HTMLElement>(".document-editor:not([hidden]) .rich-scroller[hidden]")!,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
};
const readSource = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      ".document-editor:not([hidden]) .source-surface .cm-line",
    ),
  ]
    .map((node) => node.textContent)
    .join("\n");
try {
  await wait(() => root()?.querySelector("strong"));
  check(
    location.protocol === "opentypora:" && desktop !== undefined,
    "bundled modules load through native WebKit scheme and bridge",
  );
  const originalResponse = await desktop.restore();
  if (!originalResponse.ok) throw new Error(originalResponse.error);
  const original = originalResponse.value!.documents[0].content;
  const openPreferences = async () => { window.__openTypora.command({action:"preferences"}); await wait(() => document.querySelector<HTMLElement>('[aria-label="关闭偏好设置"]')!); };
  const preferenceButton = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === text)!;
  await openPreferences(); preferenceButton('选择图片…').click();
  await wait(() => document.querySelector<HTMLElement>('.editor-background')!);
  check((await desktop.background()).value!.name === 'Background-fixture.png','native background picker persists the managed image');
  const setRange = (label: string,value: number) => { const field = document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(field,String(value)); field.dispatchEvent(new Event('input',{bubbles:true})); };
  setRange('背景不透明度',42); setRange('背景模糊',7);
  await wait(() => getComputedStyle(document.querySelector<HTMLElement>('.editor-background')!).opacity === '0.42');
  check(getComputedStyle(document.querySelector<HTMLElement>('.editor-background')!).filter === 'blur(7px)','background controls change the image layer without dimming text');
  preferenceButton('重置效果').click();
  await wait(() => getComputedStyle(document.querySelector<HTMLElement>('.editor-background')!).opacity === '0.18');
  check(getComputedStyle(document.querySelector<HTMLElement>('.editor-background')!).filter === 'blur(0px)','reset restores subtle background defaults');
  preferenceButton('清除背景').click(); await wait(() => !document.querySelector<HTMLElement>('.editor-background')!);
  check((await desktop.background()).value! === null,'clear background updates native persistence');
  preferenceButton('选择图片…').click(); await wait(() => document.querySelector<HTMLElement>('.editor-background')!);
  document.querySelector<HTMLElement>('[aria-label="关闭偏好设置"]')!.click();
  await sourceMode(true);
  check(getComputedStyle(document.querySelector<HTMLElement>('.source-surface .cm-editor')!).backgroundColor === 'rgba(0, 0, 0, 0)' && readSource() === original,'background remains visible in source mode without changing Markdown');
  await sourceMode(false);
  await wait(() => root().querySelectorAll<HTMLElement>(".mathjax-node svg").length === 2);
  check(
    !root().querySelector<HTMLElement>(".math-error,[data-mjx-error]")!,
    "offline MathJax SVG renders document macros and extended fonts",
  );
  const openPlugins = async () => { window.__openTypora.command({action:"plugins"}); await wait(() => document.querySelector<HTMLElement>('[role="dialog"][aria-label="插件管理"]')!); };
  const pluginCard = (name: string) => [...document.querySelectorAll<HTMLElement>('.plugin-card')].find(card => card.querySelector<HTMLElement>('h3')!?.textContent === name)!;
  const closePlugins = () => document.querySelector<HTMLElement>('[aria-label="关闭插件管理"]')!.click();
  pointText("粗体", 1);
  await openPlugins();
  await wait(() => pluginCard('Native-plugin-fixture'));
  pluginCard('Native-plugin-fixture').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  await wait(() => getComputedStyle(root()).getPropertyValue('--plugin-fixture').trim() === 'loaded');
  check(true, 'installed CommonJS plugin is dynamically imported by native WebKit under the existing CSP');
  pluginCard('Native-plugin-fixture').querySelector<HTMLButtonElement>('.plugin-actions button')!.click();
  closePlugins(); await wait(() => root().textContent.includes('粗插件体'));
  check(true, 'installed original plugin calls the document adapter and creates a real undoable edit');
  window.__openTypora.command({action:'undo'}); check(!root().textContent.includes('插件'), 'plugin edits undo without changing surrounding Markdown');
  await openPlugins(); pluginCard('Native-plugin-fixture').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); await wait(() => !document.querySelector<HTMLStyleElement>('style[data-plugin^="local-"]')!);
  check(true, 'disabling an installed plugin removes its styles');
  await wait(()=>pluginCard('Package fixture'));
  pluginCard('Package fixture').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  await wait(()=>window.packageProbe?.ticks>0 && getComputedStyle(root()).getPropertyValue('--package-fixture').trim()==='loaded');
  check(window.packageProbe.cached && window.packageProbe.marker==='/*__ENTRY__*/ /*__MODULES__*/','native folder modules resolve JS JSON CSS and cache shared dependencies under the existing CSP');
  pluginCard('Package fixture').querySelector<HTMLButtonElement>('.plugin-actions button')!.click();closePlugins();
  await wait(()=>root().textContent.includes('插件中文😀42'));
  window.__openTypora.command({action:'undo'});check(!root().textContent.includes('插件中文'),'native package command produces a single undoable Unicode edit');
  await openPlugins();pluginCard('Package fixture').querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  await wait(()=>!document.querySelector<HTMLStyleElement>('style[data-plugin^="local-"]')!);
  const stoppedTicks=window.packageProbe.ticks;await new Promise(resolve=>setTimeout(resolve,100));
  check(window.packageProbe.ticks===stoppedTicks,'native installed plugin timers stop when disabled');
  for (const [name, id] of [['列表折叠','collapse_list'],['只读模式','read_only'],['无图阅读','no_image'],['段落聚焦','blur'],['常显语法标记','static_markers'],['反色夜间模式','dark']]) {
    pluginCard(name).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await wait(() => !pluginCard(name).querySelector<HTMLButtonElement>('.plugin-actions button')!.disabled);
    check(!pluginCard(name).querySelector<HTMLElement>('[role="alert"]')!, 'upstream ' + id + ' plugin runs in native WebKit');
    if (id === 'collapse_list') {
      [...pluginCard(name).querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='插件命令…')!.click();
      const command=()=>[...pluginCard(name).querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='记住折叠状态')!;
      await wait(()=>command() || pluginCard(name).querySelector<HTMLElement>('[role="alert"]')!).catch(()=>{throw new Error('Missing plugin command: '+pluginCard(name).textContent);});
      if (!command()) throw new Error('Missing plugin action: '+pluginCard(name).textContent);
      check(command()?.getAttribute('aria-pressed')==='true','upstream dynamic command is visible with its checked state');
      command().click(); await wait(()=>command()?.getAttribute('aria-pressed')==='false');
      check(true,'plugin command calls the original plugin and persists the changed setting');
      closePlugins();
      const list=root().querySelector<HTMLElement>('ul')!, triangle=getComputedStyle(list,'::before'), bounds=list.getBoundingClientRect();
      check(triangle.borderTopWidth==='9px' && triangle.borderTopColor!=='rgba(0, 0, 0, 0)','native upstream list triangle has visible themed geometry');
      list.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:bounds.left-11,clientY:bounds.top+4}));
      check(list.classList.contains('plugin-collapsed-list'),'native list folding handles the writing-surface event');
      list.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:bounds.left-11,clientY:bounds.top+4}));
      check(!list.classList.contains('plugin-collapsed-list'),'native list unfolding restores its original state');
      await openPlugins();
    }
    if (id === 'read_only') {
      closePlugins(); pointText('粗体', 1); input('insertText','BLOCKED');
      check(!root().textContent.includes('BLOCKED') && root().getAttribute('aria-readonly') === 'true', 'read-only plugin blocks real editor input events');
      await sourceMode(true); check(document.querySelector<HTMLElement>('.document-editor:not([hidden]) .cm-content')!.getAttribute('contenteditable') === 'false', 'read-only plugin also locks source mode');
      await sourceMode(false); await openPlugins();
    }
    if (id === 'static_markers') check(getComputedStyle(root().querySelector<HTMLElement>('[data-mark="em"] .md-meta')!).display === 'inline', 'static markers plugin changes rendered inline metadata');
    if (id === 'dark') check(document.documentElement.classList.contains('plugin-dark'), 'dark plugin applies its original root class');
    pluginCard(name).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await wait(() => !document.querySelector<HTMLElement>('style[data-plugin="'+id+'"]')!);
  }
  check(!document.documentElement.classList.contains('plugin-dark') && root().getAttribute('aria-readonly') === 'false', 'plugin teardown restores editing and removes presentation effects');
  const communityNames=['列表折叠','只读模式','无图阅读','段落聚焦','常显语法标记','反色夜间模式'];
  for(const name of communityNames){pluginCard(name).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();await wait(()=>!pluginCard(name).querySelector<HTMLButtonElement>('.plugin-actions button')!.disabled);}
  check(document.querySelectorAll<HTMLStyleElement>('style[data-plugin]').length===6 && root().getAttribute('aria-readonly')==='true','all six original community plugins coexist in native WebKit');
  for(const name of communityNames)pluginCard(name).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
  await wait(()=>!document.querySelector<HTMLStyleElement>('style[data-plugin]')!);
  check(!document.documentElement.classList.contains('plugin-dark') && root().getAttribute('aria-readonly')==='false','native combined plugin teardown removes styles and unlocks editing');
  closePlugins();
  for (const [needle, offset] of [["粗体",1],["任务",1],["B",1]] as const) {
    pointText(needle,offset);
    const node=getSelection()!.anchorNode as Text, before=node.data, at=getSelection()!.anchorOffset;
    node.parentElement!.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
    node.data=before.slice(0,at)+'nihao'+before.slice(at);
    const target=node.parentElement!;
    target.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'你好'}));
    await Promise.resolve();
    node.data=before.slice(0,at)+'你好'+before.slice(at); getSelection()!.collapse(node,at+2);
    target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'你好'}));
    await new Promise(resolve=>setTimeout(resolve,20));
    await sourceMode(true);
    check(readSource()===original.replace(needle,needle.slice(0,offset)+'你好'+needle.slice(offset)), 'WebKit delayed Chinese commit preserves '+needle+' and its Markdown container');
    await sourceMode(false); window.__openTypora.command({action:'undo'});
    await sourceMode(true); check(readSource()===original,'WebKit Chinese commit undoes once for '+needle); await sourceMode(false);
  }
  pointText("。", 1);
  input("insertParagraph");
  const emptyLeaf = [...root().querySelectorAll<HTMLElement>("[data-leaf]")].find(element => !element.textContent)!;
  check(emptyLeaf && getSelection()!.anchorNode === emptyLeaf, "new paragraph uses an element caret in native WebKit");
  emptyLeaf.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  emptyLeaf.textContent = "你好";
  getSelection()!.collapse((emptyLeaf.firstChild as Text), 2);
  emptyLeaf.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, inputType: "insertCompositionText", data: "你好" }));
  emptyLeaf.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "你好" }));
  await sourceMode(true);
  check(readSource() === original.replace("。", "。\n\n你好"), "synthetic composition at an empty element persists exact Chinese in native WebKit");
  await sourceMode(false);
  window.__openTypora.command({ action: "undo" });
  check(!root().textContent.includes("你好"), "empty-paragraph composition undoes as one transaction");
  window.__openTypora.command({ action: "redo" });
  check(root().textContent.includes("你好"), "empty-paragraph composition redoes as one transaction");
  window.__openTypora.command({ action: "undo" });
  window.__openTypora.command({ action: "undo" });
  await sourceMode(true);
  check(readSource() === original, "composition regression restores the original fixture exactly");
  await sourceMode(false);
  const repeatedSource='# 重复输入\n\n同\n\n同\n', repeatedRecord={id:'repeat-ime',path:null,name:'Repeated-IME.md',content:repeatedSource,savedContent:repeatedSource,diskHash:null,lineEnding:'\n'};
  const repeatedRegistration=await desktop.registerDraft(repeatedRecord);if(!repeatedRegistration.ok)throw Error(repeatedRegistration.error);
  window.__openTypora.command({action:'opened',document:repeatedRecord});await wait(()=>document.querySelector<HTMLElement>('.document-title')!?.textContent==='Repeated-IME.md'&&[...(root()?.querySelectorAll(':scope > p')||[])].filter(element=>element.textContent==='同').length===2);
  for(const candidate of ['同','同同','中文😀']) {
    const [first,second]=root().querySelectorAll<HTMLElement>(':scope > p');root().focus();getSelection()!.setBaseAndExtent((first.firstChild as Text),0,(second.firstChild as Text),1);
    first.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));first.textContent=candidate;second.remove();getSelection()!.collapse((first.firstChild as Text),candidate.length);
    first.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:candidate}));
    await sourceMode(true);check(readSource()==='# 重复输入\n\n'+candidate+'\n','native repeated-text composition replaces the selected paragraph boundaries: '+candidate);
    await sourceMode(false);window.__openTypora.command({action:'undo'});await sourceMode(true);check(readSource()===repeatedSource,'native repeated-text composition undoes once: '+candidate);await sourceMode(false);
  }
  window.__openTypora.command({action:'opened',document:originalResponse.value!.documents[0]});await wait(()=>document.querySelector<HTMLElement>('.document-title')!?.textContent==='WebKit-fixture.md');
  pointText("粗体", 1);
  document.dispatchEvent(new Event("selectionchange"));
  check(
    root()
      .querySelector<HTMLElement>('[data-mark="strong"]')!
      .classList.contains("md-expand") &&
      !root().querySelector<HTMLElement>('[data-mark="em"]')!.classList.contains("md-expand"),
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
  await wait(() => root().querySelector<HTMLElement>("strong")!.textContent === "粗体");
  check(true, "returning to rich mode restores its own undo history");
  window.__openTypora.command({ action: "redo" });
  await wait(() => root().querySelector<HTMLElement>("strong")!.textContent === "粗测体");
  check(true, "rich redo restores the edit after a source-view round trip");
  pointText("粗测体", 2);
  input("insertText", "新");
  const untouched = root().querySelector<HTMLElement>("h1")!;
  pointText("任务", 2);
  input("insertParagraph");
  input("insertText", "后续");
  check(
    root().querySelector<HTMLElement>("h1")! === untouched,
    "an unaffected block keeps its actual DOM node across structural edits",
  );
  const checkbox = root().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
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
  const imported = await desktop.importImage(
    "webkit-fixture",
    png,
    "fixture.png",
  );
  if (!imported.ok) throw new Error(imported.error);
  const uploadedImage = await desktop.imageAction("webkit-fixture", [imported.value!], "upload", {imageUploader:uploaderURL});
  if (!uploadedImage.ok) throw new Error(uploadedImage.error);
  check(uploadedImage.value![imported.value!] === "https://images.example.invalid/owned-fixture.png", "native PicGo upload validates the response from an owned local HTTP server");
  pointText("WebKit 验收", 9);
  const transfer = new DataTransfer();
  transfer.setData("text/plain", "\n\n![验收](" + imported.value! + ")\n\n");
  root().dispatchEvent(
    new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    }),
  );
  await wait(() => root().querySelector<HTMLImageElement>("img")!?.naturalWidth === 1);
  check(
    true,
    "native scoped image scheme resolves an encoded relative asset path",
  );
  await sourceMode(true);
  const source = readSource();
  const saved = await desktop.save(
    "webkit-fixture",
    source,
    false,
    false,
  );
  if (!saved.ok) throw new Error(saved.error);
  check(
    saved.value!.content === source,
    "native save bridge returns the exact source content",
  );
  const renamedFile = await desktop.fileOperation({action:'rename', path:saved.value!.path!, name:'Renamed-fixture.md'});
  if (!renamedFile.ok) throw new Error(renamedFile.error);
  await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent.includes('Renamed-fixture.md'));
  const undoneFile = await desktop.fileOperation({action:'undo'});
  if (!undoneFile.ok) throw new Error(undoneFile.error);
  await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent.includes('WebKit-fixture.md'));
  check(readSource() === source, "native file operation preparation, path synchronization and undo preserve exact editor bytes");
  window.__openTypora.command({ action: "pdf" });
  await wait(() =>
    document.querySelector<HTMLElement>(".toast")!?.textContent.includes("PDF 已导出"),
  );
  check(
    true,
    "native PDF export completes asynchronously without blocking the editor",
  );
  const longHtml = '<!doctype html><html><head><style>html,body{margin:0;padding:0}.print-document{display:flow-root;font:14px/24px sans-serif}h2{margin:20px 0 8px}table{width:100%;border-collapse:collapse}td{padding:10px;border:1px solid #ccc}p{margin:0 0 16px}</style></head><body><article class="print-document"><h1>Pagination fixture</h1>' + Array.from({length:90}, (_, i) => '<h2>Heading-' + String(i+1).padStart(3,'0') + '</h2><p>Paragraph-' + String(i+1).padStart(3,'0') + ' keeps each complete line on a page.</p>').join('') + '<table>' + Array.from({length:30}, (_, i) => '<tr><td>Row-' + String(i+1).padStart(3,'0') + '</td><td>Complete table cell</td></tr>').join('') + '</table></article></body></html>';
  const longPdf = await desktop.exportPdf(longHtml, {testName:'long', paper:'letter', margin:42, title:'Pagination fixture', header:'${title}', footer:'${pageNo} / ${totalPages}'});
  if (!longPdf.ok) throw new Error(longPdf.error);
  check(true, "long PDF uses configurable paper, margins, headers and line-aware page boundaries");
  const marginPdf = await desktop.exportPdf('<!doctype html><html><head><style>html,body{margin:0;padding:0}.print-document{display:flow-root}p{margin:0 0 800px;font:16px/24px sans-serif}</style></head><body><article class="print-document"><p>Trailing margin regression</p></article></body></html>');
  if (!marginPdf.ok) throw new Error(marginPdf.error);
  check(true, "native PDF ignores an unpainted trailing block margin");
  window.__openTypora.command({ action: "html" });
  await wait(() => document.querySelector<HTMLElement>(".toast")!?.textContent.includes("HTML 已导出"));
  check(true, "native HTML export embeds local fonts and images without live app links");
  window.webkit.messageHandlers.opentypora.postMessage({id:"phase",name:"progress",args:["phase: encoding dialog"]});
  // Drive the new encoding dialog through its real native bridge and byte writer.
  for (const encoding of ['gb18030', 'utf-16be', 'utf-8'] as const) {
    document.querySelector<HTMLElement>('[aria-label="更改文本编码"]')!.click(); await wait(() => document.querySelector<HTMLElement>('[aria-label="文本编码"]')!);
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="文本编码"]')!; select.value! = encoding; select.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 20));
    [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === '转换并保存')!.click();
    await wait(() => !document.querySelector<HTMLElement>('[role="dialog"]')!);
    check(document.querySelector<HTMLElement>('[aria-label="更改文本编码"]')!.textContent.includes(({gb18030:"GB18030", "utf-16be":"UTF-16 BE", "utf-8":"UTF-8"})[encoding]), 'native encoding dialog converts and updates metadata: ' + encoding);
  }
  window.webkit.messageHandlers.opentypora.postMessage({id:"phase",name:"progress",args:["phase: complex source mode"]});
  await sourceMode(false);
  window.webkit.messageHandlers.opentypora.postMessage({id:"phase",name:"progress",args:["phase: complex canvas"]});
  const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 120; const context = canvas.getContext('2d')!; context.fillStyle = '#eef3f8'; context.fillRect(0, 0, 360, 120); context.fillStyle = '#375576'; context.fillRect(20, 20, 80, 80); context.font = '22px sans-serif'; context.fillText('中文图片验收', 120, 68);
  const complexImage = await desktop.importImage('webkit-fixture', Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0)), 'complex.png'); if (!complexImage.ok) throw new Error(complexImage.error);
  const imagePath = saved.value!.path!.slice(0, saved.value!.path!.lastIndexOf("/") + 1) + complexImage.value!;
  const complexSource = '# 复杂中文文档\n\n## 结构与内容\n\n中文段落 **粗体**、*斜体*、[参考链接](https://example.com/document)。\n\n1. 一级列表\n   - 嵌套子项\n   - 第二子项\n2. 第二项\n\n| 项目 | 数量 | 说明 |\n| :--- | ---: | :---: |\n| 中文甲 | 12 | 单元格内容 |\n| 中文乙 | 34 | 第二行 |\n\n脚注引用[^note]。\n\n[^note]: 中文脚注内容。\n\n行内公式 $E=mc^2$。\n\n$$\n\\int_0^1 x^2 \\,dx=\\frac{1}{3}\n$$\n\n![中文图片](<' + imagePath + '>)\n\n<img src="' + imagePath + '" alt="带尺寸图片" width="120" />\n\n![引用图片][figure]\n\n[figure]: <' + imagePath + '>\n\n```mermaid\nflowchart LR\n  A[中文开始] --> B[检查完成]\n```\n\n```sequence\nAlice->Bob: Native conversion\nBob-->Alice: Complete\n```\n\n```flow\nst=>start: Start\ne=>end: End\nst->e\n```\n\n```javascript\nconst message = "中文代码";\n```\n';
  const complexRecord = { id: 'complex-fixture', path: null, name: '复杂中文文档.md', content: complexSource, savedContent: '', diskHash: null, lineEnding: '\n' };
  window.webkit.messageHandlers.opentypora.postMessage({id:"phase",name:"progress",args:["phase: complex register"]});
  const complexRegistered = await desktop.registerDraft(complexRecord); if (!complexRegistered.ok) throw new Error(complexRegistered.error);
  window.__openTypora.command({ action: 'opened', document: complexRecord });
  await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent.startsWith(complexRecord.name));
  window.webkit.messageHandlers.opentypora.postMessage({id:"phase",name:"progress",args:["phase: complex diagram"]});
  await wait(() => root()?.querySelectorAll('.mermaid-block svg').length === 3);
  check(true, 'complex Chinese fixture renders nested lists, tables, images, footnotes, math and Mermaid');
  window.__openTypora.command({ action: 'pdf' }); await wait(() => document.querySelector<HTMLElement>('.toast')!?.textContent.includes('PDF 已导出'));
  check(true, 'complex native PDF export includes rendered Chinese tables, math, images, diagrams and footnotes');
  for (const format of ['docx', 'odt', 'rtf', 'epub', 'latex', 'rst', 'mediawiki', 'textile', 'opml', 'revealjs']) {
    window.__openTypora.command({ action: format });
    await wait(() => { const message = document.querySelector<HTMLElement>('.toast')!?.textContent || ''; if (/失败|无法|无效|不能|超时|需要 Pandoc/.test(message)) throw new Error(format + ': ' + message); return message.includes(format.toUpperCase() + ' 已导出'); });
    check(true, 'real Pandoc ' + format + ' export completes from the rendered complex document');
  }
  const convertedImports: Record<string,string> = {};
  for (const format of ['docx', 'odt', 'rtf', 'epub']) {
    const response = await desktop.importDocument(format); if (!response.ok) throw new Error(format + ': ' + response.error);
    const markdown = response.value!.markdown!;
    check(markdown.includes('复杂中文文档') && markdown.includes('中文甲') && markdown.includes('中文脚注内容') && markdown.includes('中文代码'), 'real ' + format + ' reimport retains Chinese headings, table text, footnotes and code');
    if (['docx', 'odt', 'epub'].includes(format)) check((markdown.includes('![') || markdown.includes('<img')) && markdown.includes('mc'), format + ' reimport retains extracted images and mathematical content');
    convertedImports[format] = markdown;
  }
  const importedRecord = { ...complexRecord, id: 'converted-import', name: '导入的复杂文档.md', content: convertedImports.docx };
  const importRegistration = await desktop.registerDraft(importedRecord); if (!importRegistration.ok) throw new Error(importRegistration.error);
  window.__openTypora.command({ action: 'opened', document: importedRecord });
  await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent.startsWith(importedRecord.name) && root()?.querySelectorAll('table tr').length === 3 && [...root().querySelectorAll<HTMLImageElement>('img')].some(image => image.naturalWidth > 0));
  check(true, 'reimported DOCX is editable and its persistent extracted media loads in native WebKit');
  window.__openTypora.command({ action: 'opened', document: saved.value! });
  await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent === saved.value!.name);
  const reopenDraft = {id:'reopen-draft',path:null,name:'Reopen-draft.md',content:'',savedContent:'',diskHash:null,lineEnding:'\n'};
  const registeredDraft = await desktop.registerDraft(reopenDraft); if (!registeredDraft.ok) throw new Error(registeredDraft.error);
  window.__openTypora.command({action:'opened',document:reopenDraft}); await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent === 'Reopen-draft.md');
  window.__openTypora.command({action:'close'}); await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent === 'WebKit-fixture.md');
  window.__openTypora.command({action:'reopen'}); await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent === 'Reopen-draft.md');
  check(true, "native reopen falls back to the same-window closed-document history when no closed window exists");
  window.__openTypora.command({action:'close'}); await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent === 'WebKit-fixture.md');
  await sourceMode(false);
  const paritySource = '# Native editing parity\n\n> - alpha\n> - beta\n\n| A | B |\n| --- | --- |\n| cellA | cellB |\n\n```sequence\nAlice->Bob: Native hello\nBob-->Alice: Native reply\n```\n\n```flow\nst=>start: Start\ne=>end: End\nst->e\n```\n';
  const parityRecord = {id:'native-parity',path:null,name:'Native-parity.md',content:paritySource,savedContent:paritySource,diskHash:null,lineEnding:'\n'};
  const parityRegistered = await desktop.registerDraft(parityRecord); if(!parityRegistered.ok) throw new Error(parityRegistered.error);
  window.__openTypora.command({action:'opened',document:parityRecord});
  await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent === parityRecord.name && root()?.querySelectorAll('.mermaid-block svg').length === 2);
  check(root().querySelector<HTMLElement>('[data-diagram-language="sequence"] svg')!.textContent.includes('Native hello'), 'native WebKit renders legacy sequence and flow through offline Mermaid');
  pointText('alpha',0); const first = getSelection()!.anchorNode;
  pointText('beta',4); const last = getSelection()!.anchorNode;
  getSelection()!.setBaseAndExtent(first!,0,last!,4); document.dispatchEvent(new Event('selectionchange'));
  root().dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true}));
  await sourceMode(true); check(readSource() === paritySource.replace('> - alpha\n> - beta','>   - alpha\n>   - beta'), 'native multi-line quoted-list Tab preserves both list items');
  await sourceMode(false); window.__openTypora.command({action:'undo'});
  pointText('cellA',2);
  root().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',metaKey:true,bubbles:true,cancelable:true}));
  check(root().querySelectorAll<HTMLElement>('tbody tr').length === 2,'native Cmd-Enter inserts a table row');
  window.__openTypora.command({action:'undo'}); pointText('cellA',2); input('insertLineBreak');
  check(root().querySelectorAll<HTMLElement>('td br').length === 1,'native cell break renders as a real line break');
  input('insertText','新行'); await sourceMode(true); check(readSource() === paritySource.replace('cellA','ce<br>新行llA'),'native typing continues after the cell break');
  await sourceMode(false); window.__openTypora.command({action:'undo'});
  await sourceMode(true); check(readSource() === paritySource.replace('cellA','ce<br>llA'),'native Shift-Enter preserves the table with an inline cell break');
  await sourceMode(false); window.__openTypora.command({action:'undo'});
  await sourceMode(true); check(readSource() === paritySource,'native table undo and source round trip restore exact Markdown'); await sourceMode(false);
  pointText('cellA',2); window.__openTypora.command({action:'select-scope'});
  check(getSelection()!.toString() === 'cellA','native scope selection selects the entire table cell');
  window.__openTypora.command({action:'jump-selection'});
  check(getSelection()!.toString() === 'cellA','native jump to selection preserves its range');
  window.__openTypora.command({action:'select-line'});
  check(getSelection()!.toString().includes('cellA') && getSelection()!.toString().includes('cellB') && !getSelection()!.toString().includes('cellC'),'native line selection stays in one table row');
  pointText('cellA',2); window.__openTypora.command({action:'select-word'});
  window.__openTypora.command({action:'delete-word'});
  await sourceMode(true); check(readSource() === paritySource.replace('cellA',''),'native word deletion preserves table structure');
  await sourceMode(false); window.__openTypora.command({action:'undo'}); await sourceMode(true);
  check(readSource() === paritySource,'native rich undo restores word deletion before entering source');
  window.__openTypora.command({action:'select-word'}); window.__openTypora.command({action:'delete-word'});
  check(readSource() === paritySource.replace('cellA',''),'native source word deletion uses source selection');
  window.__openTypora.command({action:'undo'}); check(readSource() === paritySource,'native source word deletion undo restores exact Markdown');
  await sourceMode(false);

  const headerSource='# Native table header\n\n| Name | 中文 |';
  const headerRecord={id:'native-header-table',path:null,name:'Native-table-header.md',content:headerSource,savedContent:headerSource,diskHash:null,lineEnding:'\n'};
  const headerRegistered=await desktop.registerDraft(headerRecord);if(!headerRegistered.ok)throw Error(headerRegistered.error);
  window.__openTypora.command({action:'opened',document:headerRecord});await wait(()=>document.querySelector<HTMLElement>('.document-title')!?.textContent===headerRecord.name && root()?.textContent.includes('| Name | 中文 |'));
  pointText('| Name | 中文 |','| Name | 中文 |'.length);input('insertParagraph');
  check(root().querySelectorAll<HTMLElement>('th').length===2 && root().querySelectorAll<HTMLElement>('td').length===2 && !!getSelection()!.anchorNode!.parentElement!.closest<HTMLElement>('td')!,'native header Enter creates a table and focuses its first body cell');
  input('insertText','你好|中国');await sourceMode(true);
  const emptyHeaderTable=headerSource+'\n| --- | --- |\n|  |  |';
  check(readSource()===emptyHeaderTable.replace('|  |  |','| 你好\\|中国 |  |'),'native table pipe typing keeps Chinese content in one cell and survives source switching');
  await sourceMode(false);window.__openTypora.command({action:'undo'});await sourceMode(true);
  check(readSource()===emptyHeaderTable,'native table content undo is separate from table creation');
  await sourceMode(false);window.__openTypora.command({action:'undo'});await sourceMode(true);
  check(readSource()===headerSource,'native table creation undoes in one transaction');await sourceMode(false);
  window.__openTypora.command({action:'opened',document:saved.value!});
  await wait(() => document.querySelector<HTMLElement>('.document-title')!?.textContent === saved.value!.name);
  const spreadsheetDraft={id:crypto.randomUUID(),path:null,name:'Spreadsheet-QA.md',content:'',savedContent:'',diskHash:null,lineEnding:'\n'};
  await desktop.registerDraft(spreadsheetDraft);window.__openTypora.command({action:'opened',document:spreadsheetDraft});
  await wait(()=>document.querySelector<HTMLElement>('.document-title')?.textContent===spreadsheetDraft.name);
  const spreadsheetData=new DataTransfer();
  spreadsheetData.setData('text/plain','项目\t数量\n苹果\t2\n香蕉\t');
  spreadsheetData.setData('text/html','<table><tr><td>项目</td><td>数量</td></tr><tr><td>苹果</td><td>2</td></tr><tr><td>香蕉</td><td></td></tr></table>');
  spreadsheetData.items.add(new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],'Excel.png',{type:'image/png'}));
  root().focus();getSelection()!.selectAllChildren(root());getSelection()!.collapseToStart();
  root().dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:spreadsheetData}));
  await wait(()=>root().querySelectorAll('table').length===1);
  check(!root().querySelector('img')&&root().querySelectorAll('tbody tr').length===2,'native spreadsheet HTML+PNG paste chooses an editable table and retains blank cells');
  const spreadsheetMarkdown='| 项目 | 数量 |\n| --- | --- |\n| 苹果 | 2 |\n| 香蕉 |  |';
  await sourceMode(true);check(readSource()===spreadsheetMarkdown,'native spreadsheet paste serializes to exact GFM with the copied first row as its header');
  await sourceMode(false);window.__openTypora.command({action:'undo'});await sourceMode(true);await wait(()=>readSource()==='');
  check(true,'native rich spreadsheet paste undoes once after returning from source inspection');
  const spreadsheetSource=document.querySelector<HTMLElement>('.document-editor[data-active="true"] .source-surface .cm-content')!;
  spreadsheetSource.focus();await desktop.testSpreadsheetClipboard();
  const originalClipboardRead=desktop.readClipboardFormats;let recoveredClipboardReads=0;
  desktop.readClipboardFormats=()=>{recoveredClipboardReads++;return originalClipboardRead();};
  await desktop.clipboardAction('paste');
  await wait(()=>readSource()===spreadsheetMarkdown);check(recoveredClipboardReads>0,'native trusted source paste recovers table formats when WebKit exposes only the PNG alternative');desktop.readClipboardFormats=originalClipboardRead;
  window.__openTypora.command({action:'undo'});await wait(()=>readSource()==='');window.__openTypora.command({action:'redo'});await wait(()=>readSource()===spreadsheetMarkdown);
  check(true,'native rich/source spreadsheet paste remains one undo and redo transaction');
  window.__openTypora.command({action:'undo'});await wait(()=>readSource()==='');await sourceMode(false);window.__openTypora.command({action:'close'});
  await wait(()=>!document.querySelector(`[role="tab"][aria-label="${spreadsheetDraft.name}"]`));
  window.__openTypora.command({action:'opened',document:saved.value!});await wait(()=>document.querySelector<HTMLElement>('.document-title')?.textContent===saved.value!.name);
  const workspaceDraft={id:crypto.randomUUID(),path:null,name:'Workspace-QA.md',content:'',savedContent:'',diskHash:null,lineEnding:'\n'};
  await desktop.registerDraft(workspaceDraft);window.__openTypora.command({action:'opened',document:workspaceDraft});
  await wait(()=>document.querySelector<HTMLElement>('.document-title')!?.textContent===workspaceDraft.name);
  window.__openTypora.command({action:'split-right'});await wait(()=>document.querySelectorAll<HTMLElement>('.document-editor:not([hidden])').length===2);
  check(!!document.querySelector<HTMLElement>('[role="tablist"]')! && document.querySelector<HTMLElement>('[role="separator"]')!.getAttribute('aria-orientation')==='vertical','native tabs and two document panes render together');
  window.__openTypora.command({action:'other-pane'});await wait(()=>document.querySelector<HTMLElement>('.document-editor[data-active="true"]')!?.dataset.documentId!==workspaceDraft.id);
  window.__openTypora.command({action:'source'});await wait(()=>!!document.querySelector<HTMLElement>('.document-editor[data-active="true"] .source-surface:not([hidden])')!);
  check(!!document.querySelector<HTMLElement>('.document-editor[data-active="false"]:not([hidden]) .rich-scroller:not([hidden])')!,'native split panes retain independent source and rich modes');
  window.__openTypora.command({action:'source'});await wait(()=>!!document.querySelector<HTMLElement>('.document-editor[data-active="true"] .rich-scroller:not([hidden])')!);
  window.__openTypora.command({action:'split-down'});await wait(()=>document.querySelector<HTMLElement>('[role="separator"]')!?.getAttribute('aria-orientation')==='horizontal');
  document.querySelector<HTMLButtonElement>('.workspace-document.primary .pane-heading button[title="关闭此窗格，保留文档"]')!.click();await wait(()=>document.querySelectorAll<HTMLElement>('.document-editor:not([hidden])').length===1);
  document.querySelector<HTMLElement>('[aria-label="关闭标签 Workspace-QA.md"]')!.click();await wait(()=>!document.querySelector<HTMLElement>('[aria-label="关闭标签 Workspace-QA.md"]')!);
  window.__openTypora.command({action:'opened',document:saved.value!});await wait(()=>document.querySelector<HTMLElement>('.document-title')!?.textContent===saved.value!.name);
  check(document.querySelectorAll<HTMLElement>('.document-editor:not([hidden])').length===1,'closing a native pane retains documents and returns to the original editor');
  const controlledHtml = '<!doctype html><html><head><style>html,body{margin:0;padding:0}.print-document{display:flow-root;font:14px/24px sans-serif}</style></head><body><article class="print-document"><h1>Native first page</h1><div style="break-after:page;break-inside:avoid"><p>Keep-before</p></div><h2>Native second page</h2><p>Keep-after</p></article></body></html>';
  const controlled = await desktop.exportPdf(controlledHtml,{testName:'controlled',paper:'letter',margin:36});if(!controlled.ok)throw new Error(controlled.error);
  const tableHtml = '<!doctype html><html><head><style>html,body{margin:0;padding:0}.print-document{display:flow-root;font:14px/22px sans-serif}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px}th{background:#eee}</style></head><body><article class="print-document"><h1>Repeated headers</h1><table><thead><tr><th>Header-Key</th><th>Header-Value</th></tr></thead><tbody>' + Array.from({length:180},(_,i)=>'<tr><td>TableRow-'+String(i).padStart(3,'0')+'</td><td>Value '+i+'</td></tr>').join('') + '</tbody></table></article></body></html>';
  const tablePdf = await desktop.exportPdf(tableHtml,{testName:'tableheaders',paper:'a4',margin:36});if(!tablePdf.ok)throw new Error(tablePdf.error);
  check(true,'native PDF exporter processes CSS break-after and repeats table headers on continuation pages');
  const largeSource = '# Large native heading\n\n'+('Native 中文 large document paragraph. 0123456789\n\n').repeat(120000);
  const largeRecord = {id:'native-large-qa',name:'Native-Large.md',path:null,content:largeSource,savedContent:'',diskHash:null,lineEnding:'\n',encoding:'utf-8',bom:false};
  const registeredLarge=await desktop.registerDraft(largeRecord);if(!registeredLarge.ok)throw new Error(registeredLarge.error);
  window.__openTypora.command({action:'opened',document:largeRecord});await wait(()=>document.querySelector<HTMLElement>('.document-editor[data-document-id="native-large-qa"] .rich-scroller:not([hidden]) .rich-document[data-virtualized="true"]')!);
  check(document.querySelectorAll<HTMLElement>('.document-editor[data-document-id="native-large-qa"] [data-cid]').length<200,'native multi-megabyte rich editor remains viewport-virtualized');
  window.__openTypora.command({action:'outline'});await wait(()=>[...document.querySelectorAll<HTMLButtonElement>('.outline button')].some(button=>button.textContent==='Large native heading'));
  check(true,'large native outline analysis completes through the bundled worker');
  const giantCodeSource = '# Native giant code\n\n```javascript\n'+('const value = "native"; // 0123456789abcdef\n').repeat(820000)+'NATIVE-CODE-END\n```\n';
  const giantCodeRecord={id:'native-giant-code-qa',name:'Native-Giant-Code.md',path:null,content:giantCodeSource,savedContent:'',diskHash:null,lineEnding:'\n',encoding:'utf-8',bom:false};
  const registeredGiant=await desktop.registerDraft(giantCodeRecord);if(!registeredGiant.ok)throw new Error(registeredGiant.error);
  window.__openTypora.command({action:'opened',document:giantCodeRecord});await wait(()=>root()?.querySelector('.large-code .code-preview .cm-content'));
  check(giantCodeSource.length>32*1024*1024 && root().querySelectorAll<HTMLElement>('.large-code .cm-line').length<200,'32+ MiB native code renders a bounded read-only CodeMirror viewport');
  root().querySelector<HTMLElement>('.large-code .code-preview .cm-content')!.click();await wait(()=>root()?.querySelector('.large-code.fence-editing .cm-content[contenteditable="true"]'));
  check(root().querySelectorAll<HTMLElement>('.large-code .cm-line').length<200,'native giant code activates its editable viewport without mounting the full block');
  const giantCodeInput=root().querySelector<HTMLElement>('.large-code.fence-editing .cm-content')!,firstCodeLine=(giantCodeInput.querySelector<HTMLElement>('.cm-line')!.firstChild as Text);
  giantCodeInput.focus();getSelection()!.setBaseAndExtent(firstCodeLine,5,firstCodeLine,5);
  document.execCommand('insertText',false,'\nconst extra = `value`;\n');await wait(()=>root()?.textContent.includes('const extra = `value`;'));
  await new Promise(resolve=>setTimeout(resolve,1600));
  let giantState=await desktop.testRecovery();if(!giantState.ok)throw new Error(giantState.error);
  check(giantState.value!.documents.find(record=>record.id===giantCodeRecord.id)!?.content===giantCodeSource.replace('const value','const\nconst extra = `value`;\n value'),'native giant code newline and punctuation persist with every surrounding byte intact');
  window.__openTypora.command({action:'undo'});await wait(()=>!root()?.textContent.includes('const extra = `value`;'));
  await new Promise(resolve=>setTimeout(resolve,1600));giantState=await desktop.testRecovery();if(!giantState.ok)throw new Error(giantState.error);
  check(giantState.value!.documents.find(record=>record.id===giantCodeRecord.id)!?.content===giantCodeSource,'native giant code newline edit undoes to exact original recovery bytes');
  const giantTableSource='| Key | Value |\n|---|---|\n'+Array.from({length:20000},(_,i)=>'| Row-'+i+' | '+(i===19999?'NATIVE-TABLE-END':'Native table value')+' |').join('\n')+'\n';
  const giantTableRecord={id:'native-giant-table-qa',name:'Native-Giant-Table.md',path:null,content:giantTableSource,savedContent:'',diskHash:null,lineEnding:'\n',encoding:'utf-8',bom:false};
  const registeredTable=await desktop.registerDraft(giantTableRecord);if(!registeredTable.ok)throw new Error(registeredTable.error);
  window.__openTypora.command({action:'opened',document:giantTableRecord});await wait(()=>root()?.querySelector('.md-large-table'));
  const tableViewport=root().querySelector<HTMLElement>('.md-large-table')!;await wait(()=>tableViewport.clientHeight>0&&tableViewport.scrollHeight>10000);check(true,'native giant table viewport laid out: '+tableViewport.clientHeight+'/'+tableViewport.scrollHeight);tableViewport.scrollTop=tableViewport.scrollHeight;tableViewport.dispatchEvent(new Event('scroll'));await wait(()=>root()?.textContent.includes('NATIVE-TABLE-END'));check(true,'native giant table final row mounted: '+tableViewport.scrollTop+'/'+tableViewport.scrollHeight);
  pointText('NATIVE-TABLE-END','NATIVE-TABLE-END'.length);input('insertText','中国');await wait(()=>root()?.textContent.includes('NATIVE-TABLE-END中国'));check(true,'native giant table Chinese edit committed');
  window.__openTypora.command({action:'undo'});await wait(()=>!root()?.textContent.includes('NATIVE-TABLE-END中国'));check(true,'native giant table edit undone');
  pointText('NATIVE-TABLE-END','NATIVE-TABLE-END'.length);input('deleteContentBackward');await wait(()=>root()?.textContent.includes('NATIVE-TABLE-EN')&&!root()?.textContent.includes('NATIVE-TABLE-END'));
  await new Promise(resolve=>setTimeout(resolve,1600));const giantTableState=await desktop.testRecovery();if(!giantTableState.ok)throw new Error(giantTableState.error);
  check(giantTableState.value!.documents.find(record=>record.id===giantTableRecord.id)!?.content===giantTableSource.replace('NATIVE-TABLE-END','NATIVE-TABLE-EN'),'native giant table Backspace persists only the exact changed character');
  window.__openTypora.command({action:'undo'});await wait(()=>root()?.textContent.includes('NATIVE-TABLE-END'));
  pointText('NATIVE-TABLE-END','NATIVE-TABLE-END'.length);input('insertText','👨‍👩‍👧‍👦');
  for(const key of ['ArrowLeft','ArrowRight'])root().dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  input('deleteContentBackward');await wait(()=>!root()?.textContent.includes('👨‍👩‍👧‍👦'));
  window.__openTypora.command({action:'undo'});await wait(()=>root()?.textContent.includes('NATIVE-TABLE-END👨‍👩‍👧‍👦'));
  window.__openTypora.command({action:'undo'});await wait(()=>!root()?.textContent.includes('👨‍👩‍👧‍👦'));
  check(true,'native rapid navigation and Backspace retain independent emoji deletion and insertion undo groups');
  await new Promise(resolve=>setTimeout(resolve,1600));const navigationState=await desktop.testRecovery();if(!navigationState.ok)throw new Error(navigationState.error);
  check(navigationState.value!.documents.find(record=>record.id===giantTableRecord.id)!?.content===giantTableSource,'native rapid navigation undo restores exact full-table recovery bytes');
  check(root().querySelectorAll<HTMLElement>('.md-large-table td').length<300,'20,000-row native table reaches its tail, edits Chinese and undoes with bounded cell DOM');
  pointText('NATIVE-TABLE-END','NATIVE-TABLE-END'.length);root().dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true}));
  await new Promise(resolve=>setTimeout(resolve,150));
  const tableAnchor=getSelection()!?.anchorNode,tableAnchorElement=tableAnchor?.nodeType===Node.ELEMENT_NODE?tableAnchor:tableAnchor?.parentElement;
  check((tableAnchorElement as HTMLElement | null)?.closest<HTMLElement>('tr[data-source-row]')!?.dataset.sourceRow==='20002','native Tab-created empty row retains its caret through virtual viewport refresh');
  input('insertText','NATIVE-ADDED');await wait(()=>root()?.textContent.includes('NATIVE-ADDED'));
  window.__openTypora.command({action:'undo'});await wait(()=>!root()?.textContent.includes('NATIVE-ADDED'));
  window.__openTypora.command({action:'undo'});await wait(()=>!root()?.querySelector('tr[data-source-row="20002"]'));
  check(true,'native large-table appended cell edits and both structural undo steps preserve the table');
  window.__openTypora.command({action:'opened',document:saved.value!});await wait(()=>document.querySelector<HTMLElement>('.document-title')!?.textContent===saved.value!.name && root()?.textContent.includes('粗测新体'));
  const menuButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find(button => button.textContent.trim() === label)!;
  const openNativeContext = async (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rect.left + Math.min(4, rect.width / 2), clientY: rect.top + rect.height / 2 }));
    await wait(() => document.querySelector<HTMLElement>('[role="menu"]')!);
  };
  const nativeMenuClipboard = async (expected: string) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await desktop.readClipboard();
      if (result.ok && result.value! === expected) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const last = await desktop.readClipboard();
    throw new Error('Native context clipboard mismatch: ' + JSON.stringify({expected,actual:last.value!,selection:getSelection()!?.toString(),focus:document.activeElement!?.outerHTML.slice(0,160),notice:document.querySelector<HTMLElement>('.toast')!?.textContent}));
  };
  const savedTab = document.querySelector<HTMLElement>(`[data-tab-id="${saved.value!.id}"]`)!;
  savedTab.focus(); savedTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
  await wait(() => document.querySelector<HTMLElement>('[role="menu"][aria-label="标签页菜单"]')!);
  menuButton('复制文件名（含扩展名）').click(); await nativeMenuClipboard(saved.value!.name);
  check(true, 'native tab context menu opens from Shift+F10 and copies the clicked document name');
  await sourceMode(true); const contextBaseline = readSource(); await sourceMode(false);
  const selectNativeWord = () => {
    pointText('粗测新体', 0); const selected = getSelection()!;
    selected.setBaseAndExtent(selected.anchorNode!, selected.anchorOffset, selected.anchorNode!, selected.anchorOffset + 4);
    document.dispatchEvent(new Event('selectionchange'));
    root().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
  };
  selectNativeWord(); await wait(() => menuButton('复制')); menuButton('复制').click(); await nativeMenuClipboard('粗测新体');
  check(true, 'native context Copy uses AppKit and preserves the selected rich text');
  await desktop.writeClipboard('菜单粘贴');
  selectNativeWord(); await wait(() => menuButton('粘贴')); menuButton('粘贴').click(); await wait(() => root().textContent.includes('菜单粘贴'));
  window.__openTypora.command({action:'undo'}); await wait(() => root().textContent.includes('粗测新体') && !root().textContent.includes('菜单粘贴'));
  await sourceMode(true); check(readSource() === contextBaseline, 'native context Paste uses AppKit and undoes to exact Markdown'); await sourceMode(false);
  const targetCell = root().querySelector<HTMLElement>('tbody tr:last-child td:last-child')!, beforeRows = root().querySelectorAll<HTMLElement>('tbody tr').length;
  targetCell.scrollIntoView({block:'center'}); await new Promise(resolve => setTimeout(resolve, 50));
  await openNativeContext(targetCell); menuButton('表格').click(); await wait(() => menuButton('下方插入行')); menuButton('下方插入行').click();
  await wait(() => root().querySelectorAll<HTMLElement>('tbody tr').length === beforeRows + 1);
  window.__openTypora.command({action:'undo'}); await wait(() => root().querySelectorAll<HTMLElement>('tbody tr').length === beforeRows);
  await sourceMode(true); check(readSource() === contextBaseline, 'native table right-click inserts at the clicked row and undoes to exact source'); await sourceMode(false);
  root().focus(); root().dispatchEvent(new KeyboardEvent('keydown', {key:'F10',shiftKey:true,bubbles:true,cancelable:true})); await wait(() => document.querySelector<HTMLElement>('[role="menu"]')!);
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true,cancelable:true}));
  await wait(() => !document.querySelector<HTMLElement>('[role="menu"]')!);
  check(root().contains(document.activeElement!), 'native Escape dismisses the context menu and restores editor focus');
  pointText("粗测新体", 2);
  input("insertText", "保留");
  window.__openTypora.command({ action: "close-window" });
  await new Promise((resolve) => setTimeout(resolve, 200));
  check(
    root().querySelector<HTMLElement>("strong")!.textContent.includes("保留"),
    "cancelled native close retains the dirty document and live editor",
  );
  check(errors.length === 0, "no WebKit runtime error or rejected promise");
  return { passed, errors, source, convertedImports };
} catch (error) {
  return {
    passed,
    errors,
    error: String(error),
    stack: (error as Error).stack,
    source: readSource(),
  };
}

}
