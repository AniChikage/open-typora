import { useEffect, useMemo, useRef, useState } from "react";
import { FilePlus2, FolderOpen, X, AlertCircle } from "lucide-react";
import { useDocuments } from "./useDocuments";
import { Toolbar } from "./components/Toolbar";
import { Sidebar } from "./components/Sidebar";
import { MarkdownEditor } from "./editor/MarkdownEditor";
import type { EditorHandle } from "./editor/MarkdownEditor";
import { extractHeadings, renderMarkdown } from "./editor/markdown";
import { host } from "./host";
import { renderDiagrams } from "./editor/diagrams";
import type { Command } from "./types";
export default function App() {
  const session = useDocuments();
  const [rendered, setRendered] = useState(true),
    [sidebar, setSidebar] = useState(() => window.innerWidth > 760),
    [focus, setFocus] = useState(false);
  const [tab, setTab] = useState<"files" | "outline">("files"),
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
    [active?.content],
  );
  const characters = useMemo(
    () => Array.from((active?.content || "").replace(/\s/g, "")).length,
    [active?.content],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("open-typora-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.title = active ? `${active.name} — Open Typora` : "Open Typora";
  }, [active?.name]);
  commands.current = ({ action, document: opened }) => {
    if (action === "opened") {
      if (opened) void session.add(opened);
    } else if (action === "new") void session.create();
    else if (action === "open") void session.open();
    else if (action === "folder") void session.openFolder();
    else if (action === "save") void session.save();
    else if (action === "saveAs") void session.save(true);
    else if (action === "close") void session.close();
    else if (action === "quit") void session.quit();
    else if (action === "source") setRendered((value) => !value);
    else if (action === "sidebar") setSidebar((value) => !value);
    else if (action === "focus") setFocus((value) => !value);
    else if (action === "find") editor()?.find();
    else if (action === "bold") editor()?.wrap("**", "**");
    else if (action === "italic") editor()?.wrap("*", "*");
    else if (action === "code") editor()?.wrap("\n```\n", "\n```\n");
    else if (action === "autosave") session.setAutosave((value) => !value);
    else if (action === "about") setAbout(true);
    else if (action === "pdf") {
      document.body.classList.add("printing");
      requestAnimationFrame(() => {
        void (async () => {
          if (printDocument.current)
            await renderDiagrams(printDocument.current);
          await document.fonts.ready;
          const result = await host.exportPdf();
          if (result) session.setMessage("PDF 已导出。");
        })()
          .catch((error) => session.setMessage(error.message))
          .finally(() => document.body.classList.remove("printing"));
      });
    }
  };
  useEffect(() => host.onCommand((command) => commands.current(command)), []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocus(false);
        setAbout(false);
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      const action =
        key === "b"
          ? "bold"
          : key === "i"
            ? "italic"
            : !host.native
              ? key === "s"
                ? event.shiftKey
                  ? "saveAs"
                  : "save"
                : key === "n"
                  ? "new"
                  : key === "o"
                    ? "open"
                    : key === "f"
                      ? event.shiftKey
                        ? "focus"
                        : "find"
                      : key === "/"
                        ? "source"
                        : key === "\\"
                          ? "sidebar"
                          : null
              : null;
      if (action) {
        event.preventDefault();
        commands.current({ action });
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
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
      className={`app-shell ${sidebar && !focus ? "" : "sidebar-hidden"} ${focus ? "focus-mode" : ""}`}
    >
      <Toolbar
        name={active?.name || ""}
        rendered={rendered}
        setRendered={setRendered}
        sidebar={() => setSidebar(!sidebar)}
        save={() => void session.save()}
        command={(action) => commands.current({ action })}
        autosave={session.autosave}
        native={host.native}
        disabled={!active}
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
            <h1>留一页，给新的想法。</h1>
            <p>打开一份 Markdown，或者从空白开始。</p>
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
                  onChange={(content) => session.update(record.id, { content })}
                  onError={session.setMessage}
                  onCursor={(line, column) => {
                    if (record.id === session.activeId)
                      setCursor({ line, column });
                  }}
                />
              </div>
            ))}
            <article
              className="print-document"
              ref={printDocument}
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(active.content, active.id),
              }}
            />
          </>
        )}
      </main>
      <footer className="statusbar">
        <span className={`save-status ${active?.conflict ? "warning" : ""}`}>
          <i />
          {status}
        </span>
        <div>
          <span>{characters} 字</span>
          <span className="cursor-status">
            第 {cursor.line} 行，第 {cursor.column} 列
          </span>
          <span>Markdown</span>
          <span>UTF-8</span>
          <span>100%</span>
        </div>
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
              0.1.0 · 本地 Markdown 写作空间
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
