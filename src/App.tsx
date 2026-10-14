import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, FolderOpen, X, AlertCircle } from "lucide-react";
import { useDocuments } from "./useDocuments";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { MarkdownEditor } from "./editor/MarkdownEditor";
import type { EditorHandle } from "./editor/MarkdownEditor";
import { extractHeadings, renderMarkdown, setMarkdownOptions } from "./editor/markdown";
import { host } from "./host";
import { renderDiagrams } from "./editor/diagrams";
import { renderMath } from "./editor/math";
import { exportHtml, portableHtml } from "./editor/print";
import { commandForKey, commandsByAction } from "./commands";
import { loadPreferences } from "./preferences";
import { PreferencesDialog } from "./components/PreferencesDialog";
import { InsertDialog } from "./components/InsertDialog";
import type { InsertKind } from "./components/InsertDialog";
import { QuickOpen } from "./components/QuickOpen";
import { Dialog } from "./components/Dialog";
import { documentStatistics } from "./editor/statistics";
import type { Command } from "./types";
export default function App() {
  const session = useDocuments();
  const [preferences, setPreferences] = useState(() => { const initial = loadPreferences(); setMarkdownOptions(initial); return initial; });
  const [typewriter, setTypewriter] = useState(false);
  const [dialog, setDialog] = useState<"preferences" | "quick-open" | "statistics" | InsertKind | null>(null);
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
  const editors = useRef(new Map<string, EditorHandle>());
  const editor = () => editors.current.get(session.activeId);
  const printDocument = useRef<HTMLElement>(null);
  const commands = useRef<(command: Command) => void>(() => {});
  const active = session.active;
  const headings = useMemo(
    () => extractHeadings(active?.content || ""),
    [active?.content, preferences],
  );
  const characters = useMemo(
    () => Array.from((active?.content || "").replace(/\s/g, "")).length,
    [active?.content],
  );
  const wholeStatistics = useMemo(() => countUnit === "words" || dialog === "statistics" ? documentStatistics(active?.content || "") : null, [active?.content, preferences, countUnit, dialog]);
  const statistics = useMemo(() => dialog === "statistics" && selection ? documentStatistics(selection, selection) : wholeStatistics, [dialog, selection, wholeStatistics]);
  const selectionCharacters = useMemo(() => Array.from(selection.replace(/\s/g, "")).length, [selection]);
  useEffect(() => { localStorage.setItem("open-typora-count-unit", countUnit); }, [countUnit]);
  useEffect(() => {
    localStorage.setItem("open-typora-preferences", JSON.stringify(preferences));
    document.documentElement.style.setProperty("--editor-font-size", `${preferences.fontSize}px`);
  }, [preferences]);
  useEffect(() => { if (window.desktop?.viewState) void window.desktop.viewState(focus, typewriter, sidebar).catch(() => {}); }, [focus, typewriter, sidebar]);
  function closeDialog() { setDialog(null); queueMicrotask(() => editor()?.focus()); }
  function changePreferences(next: typeof preferences) { setMarkdownOptions(next); setPreferences(next); }
  async function exportDocument(kind: "pdf" | "html") {
    if (exportingRef.current || !active || !printDocument.current) return;
    exportingRef.current = true; setExporting(true); document.body.classList.add("printing");
    try {
      printDocument.current.innerHTML = renderMarkdown(active.content, active.id);
      await Promise.all([renderDiagrams(printDocument.current), renderMath(printDocument.current), document.fonts.ready]);
      const result = kind === "pdf" ? await host.exportPdf(exportHtml(printDocument.current)) : await host.exportHtml(active.name, await portableHtml(printDocument.current, active.name));
      if (result) session.setMessage(`${kind.toUpperCase()} 已导出。`);
    } catch (error) { session.setMessage((error as Error).message); }
    finally { document.body.classList.remove("printing"); exportingRef.current = false; setExporting(false); }
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("open-typora-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.title = active ? `${active.name} — Open Typora` : "Open Typora";
  }, [active?.name]);
  useEffect(() => {
    editor()?.focus();
  }, [session.activeId]);
  commands.current = ({ action, document: opened }) => {
    if (["new", "newWindow", "newTab", "open"].includes(action) && window.desktop?.windowAction) { void window.desktop.windowAction(action).catch((error: Error) => session.setMessage(error.message)); return; }
    const context = commandsByAction.get(action)?.context;
    if (context && !active) return;
    if (["rich", "table"].includes(context || "") && !editor()?.richMode()) return;
    if (action === "opened") {
      if (opened) void session.add(opened);
    } else if (["new", "newWindow", "newTab"].includes(action)) void session.create();
    else if (action === "open") void session.open();
    else if (action === "folder") void session.openFolder();
    else if (action === "save") void session.save();
    else if (action === "saveAs") void session.save(true);
    else if (action === "close") void session.close();
    else if (action === "reopen") {
      if (window.desktop?.windowAction) void window.desktop.windowAction("reopen")
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
    else if (["preferences", "quick-open", "statistics", "table", "link", "footnote"].includes(action)) {
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
    else if (action === "pdf" || action === "html") void exportDocument(action);
    else if (action === "copy-markdown") void host.writeClipboard(editor()?.selectionText(true) || "").catch(error => session.setMessage(error.message));
    else if (action === "paste-plain") void host.readClipboard().then(text => editor()?.insert(text)).catch(error => session.setMessage(error.message));
    else if (action === "image" && active) void host.chooseImage(active.id).then(image => { if (image) editor()?.insert(`![${image.alt.replace(/[\[\]]/g, "")}](${image.path})`); }).catch(error => session.setMessage(error.message));
    else editor()?.command(action);
  };
  useEffect(() => host.onCommand((command) => commands.current(command)), []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.isComposing || (event.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"]')) return;
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
      <main className="writing-area" aria-label="写作空间">
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
                  preferences={preferences}
                  typewriter={typewriter}
                  onChange={(content) => session.update(record.id, { content })}
                  onError={session.setMessage}
                  onCursor={(line, column) => {
                    if (record.id === session.activeId)
                      setCursor({ line, column });
                  }}
                  onSelection={text => { if (record.id === session.activeId) setSelection(text); }}
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
        <button onClick={() => setDialog("statistics")}
          title={`${status} · 第 ${cursor.line} 行，第 ${cursor.column} 列 · Markdown · UTF-8`}
          aria-label={`${characters} 字，${status}`}
        >
          {countUnit === "characters" ? (selection ? selectionCharacters : characters) : (selection ? documentStatistics(selection, selection).words : wholeStatistics?.words || 0)} {countUnit === "characters" ? "字" : "词"}{selection && "（选中）"}{exporting && " · 正在导出…"}
        </button>
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
      {dialog === "preferences" && <PreferencesDialog value={preferences} change={changePreferences} theme={theme} changeTheme={setTheme} close={closeDialog} />}
      {dialog === "quick-open" && <QuickOpen documents={session.documents} files={session.files} select={session.setActiveId} open={session.openToken} close={closeDialog} />}
      {dialog && ["table", "link", "footnote"].includes(dialog) && <InsertDialog kind={dialog as InsertKind} selected={selectedText} close={closeDialog} submit={value => {
        if (dialog === "link") editor()?.insert(`[${(value.label || value.value || "链接").replace(/[\[\]]/g, character => "\\" + character)}](${value.value})`);
        else editor()?.command(dialog, value);
        closeDialog();
      }} />}
      {dialog === "statistics" && statistics && <Dialog title="字数统计" close={closeDialog}><dl className="document-statistics"><dt>范围</dt><dd>{statistics.selected ? "选中文字" : "全文"}</dd><dt>单词</dt><dd>{statistics.words}</dd><dt>字符（不含空白）</dt><dd>{statistics.compactCharacters}</dd><dt>字符（含空白）</dt><dd>{statistics.characters}</dd><dt>行数</dt><dd>{statistics.lines}</dd><dt>预计阅读</dt><dd>{statistics.minutes} 分钟</dd></dl><label>底部显示<select aria-label="底部显示" value={countUnit} onChange={e => setCountUnit(e.target.value as typeof countUnit)}><option value="characters">字符数</option><option value="words">单词数</option></select></label><p className="dialog-note">单词不计格式符号，中文按每字一词；字符包含源码符号。阅读速度按每分钟 200 词估算。</p></Dialog>}
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
            <div className="app-mark">
              O<span>T</span>
            </div>
            <h2>Open Typora</h2>
            <p>让文字，回到文字。</p>
            <p className="about-details">
              0.3.0 · 本地 Markdown 写作空间
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
