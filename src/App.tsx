import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, FolderOpen, X, AlertCircle } from "lucide-react";
import { useDocuments } from "./useDocuments";
import { EncodingDialog, encodingNames } from "./components/EncodingDialog";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { MarkdownEditor } from "./editor/MarkdownEditor";
import type { EditorHandle } from "./editor/MarkdownEditor";
import { extractHeadings, renderMarkdown, setMarkdownOptions } from "./editor/markdown";
import { host } from "./host";
import { renderDiagrams } from "./editor/diagrams";
import { renderMath } from "./editor/math";
import { exportHtml, portableHtml, conversionMarkdown } from "./editor/print";
import { commandForKey, commandKey, commandsByAction } from "./commands";
import { loadPreferences } from "./preferences";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { InsertDialog } from "./components/InsertDialog";
import type { InsertKind } from "./components/InsertDialog";
import { QuickOpen } from "./components/QuickOpen";
import { Dialog } from "./components/Dialog";
import { imageReferences, updateImageReferences } from "./editor/images";
import { htmlToMarkdown } from "./editor/clipboard";
import { documentStatistics } from "./editor/statistics";
import { FileOperationDialog, RecentDialog, GlobalSearch } from "./components/WorkspaceDialog";
import type { FileOperation } from "./types";
import type { Command } from "./types";
import appIcon from "../design/icon.svg";
import { version as appVersion } from "../package.json";
import { applyTheme } from "./themes";
import { PluginRuntime } from "./plugins/runtime";
import { bundledPlugins, loadPluginPreferences, pluginPreferenceKey } from "./plugins/catalog";
import type { PluginDefinition, PluginState } from "./plugins/types";
import { PluginsDialog } from "./components/PluginsDialog";
import { backgroundRevisionKey, backgroundStyle } from "./background";
import { imeKey } from "./editor/composition";
import type { BackgroundAsset } from "./background";
export default function App() {
  const editors = useRef(new Map<string, EditorHandle>());
  const session = useDocuments(() => ![...editors.current.values()].some(editor => editor.composing()));
  const [preferences, setPreferences] = useState(() => { const initial = loadPreferences(); setMarkdownOptions(initial); return initial; });
  const [themes, setThemes] = useState<{ id: string; name: string; css: string }[]>([]);
  const [background,setBackground] = useState<BackgroundAsset | null>(null);
  const backgroundRequest = useRef(0);
  const [installedPlugins, setInstalledPlugins] = useState<PluginDefinition[]>([]);
  const [pluginPreferences, setPluginPreferences] = useState(loadPluginPreferences);
  const [pluginStates, setPluginStates] = useState<Record<string, PluginState>>({});
  const [readOnly, setReadOnly] = useState(false);
  const pluginRuntime = useRef<PluginRuntime | null>(null);
  const [typewriter, setTypewriter] = useState(false);
  const [dialog, setDialog] = useState<"preferences" | "plugins" | "quick-open" | "statistics" | "recent" | "global-search" | "encoding" | InsertKind | null>(null);
  const [fileOperation, setFileOperation] = useState<FileOperation | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [selection, setSelection] = useState("");
  const [countUnit, setCountUnit] = useState<"characters" | "words">(() => localStorage.getItem("open-typora-count-unit") === "words" ? "words" : "characters");
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  const [rendered, setRendered] = useState(true),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 760),
    [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<"files" | "outline" | "tree">("files"),
    [theme, setTheme] = useState(
      () => localStorage.getItem("open-typora-theme") || "light",
    );
  const [cursor, setCursor] = useState({ line: 1, column: 1 }),
    [about, setAbout] = useState(false);
  const editor = () => editors.current.get(session.activeId);
  const printDocument = useRef<HTMLElement>(null);
  const commands = useRef<(command: Command) => void>(() => {});
  const active = session.active;
  const pluginContext = useRef({ active, editor, notify: session.setMessage });
  pluginContext.current = { active, editor, notify: session.setMessage };
  const pluginDefinitions = useMemo(() => [...bundledPlugins, ...installedPlugins].map(definition => ({ ...definition, config: { ...definition.config, ...pluginPreferences[definition.id]?.config } })), [installedPlugins, pluginPreferences]);
  useEffect(() => {
    const runtime = new PluginRuntime({
      getMarkdown: () => pluginContext.current.editor()?.markdown() ?? pluginContext.current.active?.content ?? "", getPath: () => pluginContext.current.active?.path || null,
      getSelection: () => pluginContext.current.editor()?.selectionText() || "",
      getDocumentId: () => pluginContext.current.active?.id || "",
      composing: () => !!pluginContext.current.editor()?.composing(),
      insert: text => pluginContext.current.editor()?.insert(text), replace: text => pluginContext.current.editor()?.transform(() => text),
      setReadOnly, notify: text => pluginContext.current.notify(text), changed: (id, state) => setPluginStates(previous => ({ ...previous, [id]: state })),
      reservedHotkeys: [...commandsByAction.values()].map(command => commandKey(command) || "").filter(Boolean),
      saveConfig: (id, config) => setPluginPreferences(previous => ({ ...previous, [id]: { ...previous[id], config: { ...previous[id]?.config, ...config } } })),
    });
    pluginRuntime.current = runtime;
    return () => { pluginRuntime.current = null; void runtime.destroy(); };
  }, []);
  useEffect(() => {
    if (!session.ready) return;
    void host.plugins().then(items => setInstalledPlugins(items.map(item => ({ ...item, description: "本地单文件插件，通过兼容接口运行。", config: {} })))).catch(error => session.setMessage(error.message));
  }, [session.ready, dialog === "plugins"]);
  useEffect(() => {
    localStorage.setItem(pluginPreferenceKey, JSON.stringify(pluginPreferences));
    if (!session.ready || !active) return;
    for (const definition of pluginDefinitions) void pluginRuntime.current?.setEnabled(definition, !!pluginPreferences[definition.id]?.enabled);
  }, [pluginDefinitions, pluginPreferences, session.ready, !!active]);
  useEffect(() => { pluginRuntime.current?.documentChanged(); }, [active?.id, active?.path, active?.content]);
  useEffect(() => { pluginRuntime.current?.event("beforeToggleSourceMode", !rendered); }, [rendered]);
  useEffect(() => { pluginRuntime.current?.event("afterToggleSidebar", sidebar); }, [sidebar]);
  async function installPlugin() { const installed = await host.installPlugin(); if (installed) setInstalledPlugins(previous => [...previous.filter(item => item.id !== installed.id), { ...installed, description: "本地单文件插件，通过兼容接口运行。", config: {} }]); }
  async function removePlugin(id: string) {
    const definition = pluginDefinitions.find(item => item.id === id); if (!definition || definition.builtin) return;
    await pluginRuntime.current?.setEnabled(definition, false); await host.removePlugin(id);
    setInstalledPlugins(previous => previous.filter(item => item.id !== id));
    setPluginPreferences(previous => { const next = { ...previous }; delete next[id]; return next; });
  }
  const headings = useMemo(
    () => extractHeadings(active?.content || ""),
    [active?.content, preferences],
  );
  const characters = useMemo(
    () => Array.from((active?.content || "").replace(/\s/g, "")).length,
    [active?.content],
  );
  const wholeStatistics = useMemo(() => countUnit === "words" || dialog === "statistics" ? documentStatistics(active?.content || "", undefined, preferences.readingSpeed) : null, [active?.content, preferences, countUnit, dialog]);
  const statistics = useMemo(() => dialog === "statistics" && selection ? documentStatistics(selection, selection, preferences.readingSpeed) : wholeStatistics, [dialog, selection, wholeStatistics]);
  const selectionCharacters = useMemo(() => Array.from(selection.replace(/\s/g, "")).length, [selection]);
  useEffect(() => { localStorage.setItem("open-typora-count-unit", countUnit); }, [countUnit]);
  useEffect(() => {
    localStorage.setItem("open-typora-preferences", JSON.stringify(preferences));
    document.documentElement.style.setProperty("--editor-font-size", `${preferences.fontSize}px`);
  }, [preferences]);
  useEffect(() => { if (window.desktop?.viewState) void window.desktop.viewState(focus, typewriter, sidebar).catch(() => {}); }, [focus, typewriter, sidebar]);
  async function refreshThemes() { const items = await host.themes(); setThemes(items); return items; }
  useEffect(() => { if (session.ready) void refreshThemes().catch(e => session.setMessage(e.message)); }, [session.ready]);
  useEffect(() => applyTheme(theme, themes), [theme, themes]);
  async function refreshBackground() {
    const request = ++backgroundRequest.current, asset = await host.background();
    if (request === backgroundRequest.current) setBackground(asset);
  }
  useEffect(() => { void refreshBackground().catch(error => session.setMessage(error.message)); }, []);
  async function chooseBackground() {
    const asset = await host.chooseBackground(); if (!asset) return;
    ++backgroundRequest.current; setBackground(asset); localStorage.setItem(backgroundRevisionKey,crypto.randomUUID());
  }
  async function clearBackground() {
    await host.clearBackground(); ++backgroundRequest.current; setBackground(null); localStorage.setItem(backgroundRevisionKey,crypto.randomUUID());
  }
  async function installTheme() { const selected = await host.installTheme(); if (selected) { await refreshThemes(); setTheme("custom:" + selected); } }
  async function importDocument() {
    try { const imported = await host.importDocument(); if (!imported) return; const content = imported.markdown ?? htmlToMarkdown(imported.html || ""), record = { id: crypto.randomUUID(), path: null, name: imported.name, content, savedContent: "", diskHash: null, lineEnding: "\n" }; await host.registerDraft(record); await session.add(record); }
    catch (e) { session.setMessage((e as Error).message); }
  }
  function closeDialog() { setDialog(null); queueMicrotask(() => editor()?.focus()); }
  function changePreferences(next: typeof preferences) { setMarkdownOptions(next); setPreferences(next); }
  async function exportDocument(kind: string) {
    if (exportingRef.current || !active || !printDocument.current) return;
    if (editor()?.composing()) { session.setMessage("请先完成当前输入法组合输入，再导出。"); return; }
    exportingRef.current = true; setExporting(true); document.body.classList.add("printing");
    try {
      await host.persist({ documents: session.documents, activeId: session.activeId });
      printDocument.current.innerHTML = renderMarkdown(active.content, active.id);
      await Promise.all([renderDiagrams(printDocument.current), renderMath(printDocument.current), document.fonts.ready]);
      const result = kind === "pdf" ? await host.exportPdf(exportHtml(printDocument.current), { paper: preferences.pdfPaper, margin: preferences.pdfMargin, header: preferences.pdfHeader, footer: preferences.pdfFooter, title: active.name }) : kind === "html" ? await host.exportHtml(active.name, await portableHtml(printDocument.current, active.name)) : await host.exportConverted(active.id, kind, await conversionMarkdown(active.content, printDocument.current), await portableHtml(printDocument.current, active.name));
      if (result) session.setMessage(`${kind.toUpperCase()} 已导出。`);
    } catch (error) { session.setMessage((error as Error).message); }
    finally { document.body.classList.remove("printing"); exportingRef.current = false; setExporting(false); }
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("open-typora-theme", theme);
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === pluginPreferenceKey) setPluginPreferences(loadPluginPreferences());
      if (event.key === "open-typora-theme") setTheme(event.newValue || "light");
      if (event.key === "open-typora-preferences") { const next = loadPreferences(); setMarkdownOptions(next); setPreferences(next); }
      if (event.key === backgroundRevisionKey) void refreshBackground().catch(error => session.setMessage(error.message));
    };
    window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    document.title = active ? `${active.name} — Open Typora` : "Open Typora";
  }, [active?.name]);
  useEffect(() => {
    editor()?.focus();
  }, [session.activeId]);
  commands.current = ({ action, document: opened, anchor, line, message }) => {
    if (["new", "newWindow", "newTab", "open"].includes(action) && window.desktop?.windowAction) { void host.windowAction(action).catch((error: Error) => session.setMessage(error.message)); return; }
    const context = commandsByAction.get(action)?.context;
    if (readOnly && ((context && context !== "document") || ["delete-word", "undo", "redo", "paste-plain", "image", "table", "link", "reference-link", "footnote", "copy-all-images", "move-all-images", "upload-all-images"].includes(action))) { session.setMessage("只读模式已开启，请先在插件管理中关闭或切换只读效果。"); return; }
    if (context && !active) return;
    if (["rich", "table"].includes(context || "") && !editor()?.richMode()) return;
    if (action === "notice") { if (message) session.setMessage(message); }
    else if (action === "opened") {
      if (opened) void session.add(opened).then(record => { if (record && (anchor || line)) requestAnimationFrame(() => { const heading = anchor ? extractHeadings(record.content).find(heading => heading.id === anchor || heading.text === anchor) : undefined; editors.current.get(record.id)?.jump(line || heading?.line || 1); }); });
    } else if (["new", "newWindow", "newTab"].includes(action)) void session.create();
    else if (action === "open") void session.open();
    else if (action === "folder") void session.openFolder();
    else if (action === "save") void session.save();
    else if (action === "encoding") setDialog("encoding");
    else if (action === "saveAs") void session.save(true);
    else if (action === "close") void session.close();
    else if (action === "reopen") {
      if (window.desktop?.windowAction) void host.windowAction("reopen")
        .then((handled: unknown) => { if (!handled) return session.reopen(); })
        .catch((error: Error) => session.setMessage(error.message));
      else void session.reopen();
    }
    else if (action === "quit") void session.quit();
    else if (action === "close-window") void session.closeWindow();
    else if (action === "source") setRendered((value) => !value);
    else if (action === "sidebar") setSidebar((value) => !value);
    else if (action === "outline" || action === "files" || action === "file-tree") {
      setTab(action === "file-tree" ? "tree" : action);
      setSidebar(true);
    } else if (action === "theme")
      setTheme((value) => (value === "dark" ? "light" : "dark"));
    else if (action === "focus") setFocus((value) => !value);
    else if (action === "typewriter") setTypewriter(value => !value);
    else if (action === "new-file" || action === "new-folder") setFileOperation({ action, path: session.folder || undefined, name: action === "new-file" ? "未命名.md" : "新文件夹" });
    else if (action === "undo-file") void session.fileOperation({ action: "undo" }).catch(e => session.setMessage(e.message));
    else if (["preferences", "plugins", "quick-open", "statistics", "recent", "global-search", "table", "link", "reference-link", "footnote"].includes(action)) {
      setSelectedText(editor()?.selectionText() || ""); setDialog(action as typeof dialog);
    }
    else if (action === "find") editor()?.find();
    else if (action === "find-next") editor()?.findNext();
    else if (action === "find-previous") editor()?.findNext(true);
    else if (action === "undo") editor()?.undo();
    else if (action === "redo") editor()?.redo();
    else if (action === "bold") editor()?.wrap("**", "**");
    else if (action === "italic") editor()?.wrap("*", "*");
    else if (action === "underline") editor()?.wrap("<u>", "</u>");
    else if (action === "comment") editor()?.wrap("<!-- ", " -->");
    else if (action === "strike") editor()?.wrap("~~", "~~");
    else if (action === "inline-code") editor()?.wrap("`", "`");
    else if (action === "highlight") editor()?.wrap("==", "==");
    else if (action === "superscript") editor()?.wrap("^", "^");
    else if (action === "subscript") editor()?.wrap("~", "~");
    else if (action === "clear-format") editor()?.clearFormat();
    else if (action === "code") editor()?.codeBlock();
    else if (action === "autosave") session.setAutosave((value) => !value);
    else if (action === "about") setAbout(true);
    else if (["pdf", "html", "docx", "rtf", "odt", "epub", "latex", "rst", "mediawiki", "textile", "opml", "revealjs"].includes(action)) void exportDocument(action);
    else if (action === "import") void importDocument();
    else if (["copy-all-images", "move-all-images", "upload-all-images"].includes(action) && active) {
      const source = active.content, sources = [...new Set(imageReferences(source).map(image => image.url))];
      if (!sources.length) { session.setMessage("当前文档没有图片。"); return; }
      void host.persist({ documents: session.documents, activeId: session.activeId }).then(() => host.imageAction(active.id, sources, action.split("-")[0], { ...preferences })).then(mapping => { if (mapping) editors.current.get(active.id)?.transform(text => updateImageReferences(text, mapping)); }).catch(e => session.setMessage(e.message));
    }
    else if (action === "copy-markdown") void host.writeClipboard(editor()?.selectionText(true) || "").catch(error => session.setMessage(error.message));
    else if (action === "paste-plain") void host.readClipboard().then(text => editor()?.insert(text)).catch(error => session.setMessage(error.message));
    else if (action === "image" && active) void (async () => {
      await host.persist({ documents: session.documents, activeId: session.activeId });
      const image = await host.chooseImage(active.id, { ...preferences, source: active.content }); if (!image) return;
      if (preferences.imageAutoUpload) { try { const mapping = await host.imageAction(active.id, [image.path], "upload", { ...preferences }); if (mapping?.[image.path]) image.path = mapping[image.path]; } catch (e) { session.setMessage(`上传失败，已保留本地图片：${(e as Error).message}`); } }
      editors.current.get(active.id)?.insert(`![${image.alt.replace(/[\[\]]/g, "")}](${image.path})`);
    })().catch(error => session.setMessage(error.message));
    else editor()?.command(action);
  };
  useEffect(() => { if (session.ready && window.desktop?.ready) void window.desktop.ready(); }, [session.ready]);
  useEffect(() => host.onCommand((command) => commands.current(command)), []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (imeKey(event) || pluginContext.current.editor()?.composing() || (event.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"]')) return;
      if (event.key === "Escape") {
        setFocus(false);
        setAbout(false);
      }
      const action = commandForKey(event);
      if (host.native && ["new", "newWindow", "newTab", "open", "save", "saveAs", "close-window"].includes(action || "")) return;
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        commands.current({ action });
      }
    };
    document.addEventListener("keydown", shortcut, true);
    return () => document.removeEventListener("keydown", shortcut, true);
  }, []);
  useEffect(() => {
    if (!session.message) return;
    const timer = setTimeout(() => session.setMessage(""), 6500);
    return () => clearTimeout(timer);
  }, [session.message]);
  const status = session.saving
    ? "正在保存…"
    : active?.conflict
      ? "磁盘修改冲突"
      : active?.content !== active?.savedContent
        ? active?.path
          ? session.autosave
            ? "等待保存"
            : "未保存"
          : "本地草稿"
        : active?.path
          ? "已保存"
          : "本地草稿";
  return (
    <div
      className={`app-shell ${sidebar ? "" : "sidebar-hidden"} ${focus ? "focus-mode" : ""} ${typewriter ? "typewriter-mode" : ""}`}
    >
      <Toolbar
        name={active?.name || ""}
        edited={!!active && active.content !== active.savedContent}
        rendered={rendered}
        setRendered={setRendered}
        sidebar={() => setSidebar(!sidebar)}
        command={(action) => commands.current({ action })}
        autosave={session.autosave}
        disabled={!active}
        context={editor()?.context() || ""}
      />
      <Sidebar
        operation={operation => { if (operation.action === "trash" || operation.action === "undo" || operation.target) void session.fileOperation(operation).catch(e => session.setMessage(e.message)); else setFileOperation(operation); }}
        search={() => setDialog("global-search")} recent={() => setDialog("recent")} notify={session.setMessage}
        documents={session.documents}
        activeId={session.activeId}
        files={session.files}
        folder={session.folder}
        headings={headings}
        tab={tab}
        setTab={setTab}
        select={session.setActiveId}
        openToken={session.openToken}
        openFolder={session.openFolder}
        create={session.create}
        refresh={session.refresh}
        close={session.close}
        jump={(line) => editor()?.jump(line)}
        theme={theme}
        toggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      <main className={`writing-area ${background ? "has-background" : ""}`} aria-label="写作空间" inert={session.fileOperationBusy}>
        {background && <div className="background-image editor-background" data-editor-background="true" aria-hidden="true" style={backgroundStyle(background,preferences)} />}
        {active?.conflict && (
          <div className="conflict-banner" role="alert">
            <AlertCircle size={17} />
            <span>文件在磁盘上已改变。当前草稿已保留。</span>
            <button onClick={() => void session.save(true)}>另存副本</button>
            <button onClick={() => void session.reload()}>重新载入</button>
            <button onClick={() => void session.save(false, active.id, true)}>
              覆盖磁盘
            </button>
          </div>
        )}
        {!session.ready ? (
          <div className="empty-document">正在恢复文档…</div>
        ) : !active ? (
          <div className="empty-document">
            <h1>Open Typora</h1>
            <p>新建或打开 Markdown 文档。</p>
            <div>
              <button onClick={() => void session.create()}>
                <FilePlus2 size={18} />
                新建文档
              </button>
              <button onClick={() => void session.open()}>
                <FolderOpen size={18} />
                打开文件
              </button>
            </div>
          </div>
        ) : (
          <>
            {session.documents.map((record) => (
              <div
                className="document-editor"
                hidden={record.id !== session.activeId}
                key={record.id}
              >
                <MarkdownEditor
                  key={`${record.id}-${record.lineEnding}`}
                  ref={(handle) => {
                    if (handle) editors.current.set(record.id, handle);
                    else editors.current.delete(record.id);
                  }}
                  document={record}
                  rendered={rendered}
                  readOnly={readOnly}
                  preferences={preferences}
                  typewriter={typewriter}
                  onChange={(content) => session.update(record.id, { content })}
                  onError={session.setMessage}
                  onCursor={(line, column) => {
                    if (record.id === session.activeId)
                      setCursor({ line, column });
                  }}
                  onSelection={text => { if (record.id === session.activeId) setSelection(text); }}
                  onCompositionEnd={() => { if (record.id === session.activeId) pluginRuntime.current?.documentChanged(); }}
                />
              </div>
            ))}
            <article
              className="print-document"
              ref={printDocument}
            />
          </>
        )}
      </main>
      <footer className="statusbar">
        <button id="footer-word-count-label" onClick={() => setDialog("statistics")}
          title={`${status} · 第 ${cursor.line} 行，第 ${cursor.column} 列 · Markdown · ${encodingNames[active?.encoding || "utf-8"]}`}
          aria-label={`${characters} 字，${status}`}
        >
          {countUnit === "characters" ? (selection ? selectionCharacters : characters) : (selection ? documentStatistics(selection, selection, preferences.readingSpeed).words : wholeStatistics?.words || 0)} {countUnit === "characters" ? "字" : "词"}{selection && "（选中）"}{exporting && " · 正在导出…"}
        </button>
        {active && <button aria-label="更改文本编码" title="文本编码与字节顺序标记" onClick={() => setDialog("encoding")}>{encodingNames[active.encoding || "utf-8"]}{active.bom ? " BOM" : ""}</button>}
      </footer>
      {focus && (
        <button className="leave-focus" onClick={() => setFocus(false)}>
          退出专注 · Esc
        </button>
      )}
      {session.message && (
        <div className="toast" role="status">
          <span>{session.message}</span>
          <button aria-label="关闭提示" onClick={() => session.setMessage("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {fileOperation && <FileOperationDialog operation={fileOperation} files={session.files} folder={session.folder} run={session.fileOperation} close={() => setFileOperation(null)} />}
      {dialog === "encoding" && active && <EncodingDialog key={active.id} record={active} change={session.changeEncoding} close={closeDialog} />}
      {dialog === "recent" && <RecentDialog entries={session.recent} action={session.recentAction} close={closeDialog} />}
      {dialog === "global-search" && <GlobalSearch folder={session.folder} close={closeDialog} open={async match => { const record = await session.openToken(match.token); if (record) requestAnimationFrame(() => editors.current.get(record.id)?.jump(match.line)); }} />}
      {dialog === "preferences" && <PreferencesDialog value={preferences} change={changePreferences} theme={theme} changeTheme={setTheme} themes={themes} installTheme={installTheme} background={background} chooseBackground={chooseBackground} clearBackground={clearBackground} plugins={() => setDialog("plugins")} close={closeDialog} />}
      {dialog === "plugins" && <PluginsDialog definitions={pluginDefinitions} preferences={pluginPreferences} states={pluginStates} toggle={(id, enabled) => setPluginPreferences(previous => ({ ...previous, [id]: { ...previous[id], enabled } }))} configure={(id, config) => setPluginPreferences(previous => ({ ...previous, [id]: { ...previous[id], config } }))} invoke={async (id,action) => { await pluginRuntime.current?.invoke(id,action); }} actions={id => pluginRuntime.current?.actions(id) || []} install={installPlugin} remove={removePlugin} close={closeDialog} />}
      {dialog === "quick-open" && <QuickOpen documents={session.documents} files={session.files} recent={session.recent} openRecent={path => session.recentAction("open", path)} select={session.setActiveId} open={session.openToken} close={closeDialog} />}
      {dialog && ["table", "link", "reference-link", "footnote"].includes(dialog) && <InsertDialog kind={dialog as InsertKind} selected={selectedText} close={closeDialog} submit={value => {
        if (dialog === "link") editor()?.insert(`[${(value.label || value.value || "链接").replace(/[\[\]]/g, character => "\\" + character)}](${value.value})`);
        else editor()?.command(dialog, value);
        closeDialog();
      }} />}
      {dialog === "statistics" && statistics && <Dialog title="字数统计" close={closeDialog}><dl className="document-statistics"><dt>范围</dt><dd>{statistics.selected ? "选中文字" : "全文"}</dd><dt>单词</dt><dd>{statistics.words}</dd><dt>字符（不含空白）</dt><dd>{statistics.compactCharacters}</dd><dt>字符（含空白）</dt><dd>{statistics.characters}</dd><dt>行数</dt><dd>{statistics.lines}</dd><dt>预计阅读</dt><dd>{statistics.minutes} 分钟</dd></dl><label>底部显示<select aria-label="底部显示" value={countUnit} onChange={e => setCountUnit(e.target.value as typeof countUnit)}><option value="characters">字符数</option><option value="words">单词数</option></select></label><p className="dialog-note">单词不计格式符号，中文按每字一词；字符包含源码符号。阅读速度按每分钟 {preferences.readingSpeed} 词估算。</p></Dialog>}
      {about && (
        <div className="dialog-backdrop" onClick={() => setAbout(false)}>
          <section
            className="about-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="关于 Open Typora"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button close-about"
              aria-label="关闭关于"
              autoFocus
              onClick={() => setAbout(false)}
            >
              <X size={18} />
            </button>
            <img className="app-mark" src={appIcon} width={96} height={96} alt="" />
            <h2>Open Typora</h2>
            <p>让文字，回到文字。</p>
            <p className="about-details">
              {appVersion} · 本地 Markdown 写作空间
              <br />
              MIT 开源 · 独立实现
            </p>
            <button className="folder-button" onClick={() => setAbout(false)}>
              回到写作
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
