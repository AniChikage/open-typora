import {
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Moon,
  Sun,
  X,
  ChevronDown, MoreHorizontal, Search, History,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DocumentRecord, FileEntry, FileOperation } from "../types";
import type { Heading } from "../editor/markdown";
import { FileTree, sortFiles } from "./FileTree";
import type { FileSort } from "./FileTree";
import { host } from "../host";
import { shortcutLabel } from "../commands";
interface Props {
  documents: DocumentRecord[];
  activeId: string;
  files: FileEntry[];
  folder: string | null;
  headings: Heading[];
  tab: "files" | "outline" | "tree";
  setTab(tab: "files" | "outline" | "tree"): void;
  select(id: string): void;
  openToken(token: string): void;
  openFolder(): void;
  create(): void;
  refresh(): void;
  close(id: string): void;
  jump(line: number): void;
  theme: string;
  toggleTheme(): void;
  operation(operation: FileOperation): void;
  search(): void;
  recent(): void;
  notify(message: string): void;
}
export function Sidebar(props: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; file: FileEntry | null } | null>(null);
  const [sort, setSort] = useState<FileSort>(() => (localStorage.getItem("open-typora-file-sort") || "natural") as FileSort);
  const [descending, setDescending] = useState(() => localStorage.getItem("open-typora-file-desc") === "true");
  const [foldersFirst, setFoldersFirst] = useState(() => localStorage.getItem("open-typora-folders-first") !== "false");
  const sorted = sortFiles(props.files.filter(file => file.isDirectory !== "true"), sort, descending, foldersFirst);
  useEffect(() => { localStorage.setItem("open-typora-file-sort", sort); localStorage.setItem("open-typora-file-desc", String(descending)); localStorage.setItem("open-typora-folders-first", String(foldersFirst)); }, [sort, descending, foldersFirst]);
  useEffect(() => { if (!menu) return; const close = () => setMenu(null); const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); }; document.addEventListener("click", close); document.addEventListener("keydown", key); return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", key); }; }, [menu]);
  const context = (event: React.MouseEvent, file: FileEntry | null) => { event.preventDefault(); event.stopPropagation(); setMenu({ x: Math.min(event.clientX, window.innerWidth - 210), y: Math.min(event.clientY, window.innerHeight - 380), file }); };
  function operate(action: FileOperation["action"]) {
    const file = menu?.file, directory = file?.isDirectory === "true";
    const parent = directory ? file!.path : file?.path.slice(0, -file.name.length - 1) || props.folder || undefined;
    props.operation({ action, path: ["new-file", "new-folder"].includes(action) ? parent : file?.path, name: action === "new-file" ? "未命名.md" : action === "new-folder" ? "新文件夹" : action === "duplicate" ? file?.name.replace(/(\.[^.]+)$/, " 副本$1") : file?.name }); setMenu(null);
  }
  const [switcher, setSwitcher] = useState(false);
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!switcher) return;
    const dismiss = (event: MouseEvent) => {
      if (!heading.current?.contains(event.target as Node)) setSwitcher(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSwitcher(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", keyboard);
    };
  }, [switcher]);
  return (
    <aside className="sidebar" aria-label="文档侧栏">
      <div className="sidebar-heading" ref={heading}>
        <button
          className="sidebar-switcher"
          aria-label="切换侧栏内容"
          aria-expanded={switcher}
          aria-haspopup="menu"
          onClick={() => setSwitcher(!switcher)}
        >
          {props.tab === "files" ? "文件" : props.tab === "tree" ? "文件树" : "大纲"}
          <ChevronDown size={12} />
        </button>
        {switcher && (
          <div className="sidebar-menu" role="menu">
            {(["files", "tree", "outline"] as const).map((tab) => (
              <button
                role="menuitemradio"
                aria-checked={tab === props.tab}
                key={tab}
                onClick={() => {
                  props.setTab(tab);
                  setSwitcher(false);
                }}
              >
                {tab === "files" ? "文件" : tab === "tree" ? "文件树" : "大纲"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="sidebar-body">
        {props.tab !== "outline" ? (
          <>
            <div className="sidebar-section-label">
              <span>
                {props.folder ? props.folder.split("/").at(-1) : "打开的文档"}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="新建文档"
                  title={`新建文档 ${shortcutLabel("Mod-N")}`}
                  onClick={props.create}
                >
                  <Plus size={16} />
                </button>
                {props.folder && <button className="icon-button" aria-label="文件夹操作" onClick={event => context(event, null)}><MoreHorizontal size={16} /></button>}
                {props.folder && (
                  <button
                    className="icon-button"
                    aria-label="刷新文件夹"
                    onClick={props.refresh}
                  >
                    <RefreshCw size={14} />
                  </button>
                )}
              </div>
            </div>
            <nav aria-label="文件列表">
              {props.documents.filter(record => props.tab !== "tree" || !props.files.some(file => file.path === record.path)).map((record) => (
                <div
                  className={`file-row ${props.activeId === record.id ? "selected" : ""}`}
                  key={record.id}
                  onContextMenu={event => { if (record.path) context(event, { token: "", name: record.name, path: record.path, relative: record.name }); }}
                >
                  <button
                    className="file-select"
                    onClick={() => props.select(record.id)}
                    title={record.path || record.name}
                  >
                    <FileText size={17} />
                    <span>{record.name}</span>
                    {record.content !== record.savedContent && (
                      <span className="dirty-dot" aria-label="未保存" />
                    )}
                  </button>
                  <button
                    className="file-close"
                    aria-label={`关闭 ${record.name}`}
                    onClick={() => props.close(record.id)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {props.tab === "tree" ? <FileTree files={props.files} folder={props.folder} activePath={props.documents.find(record => record.id === props.activeId)?.path} open={props.openToken} context={context} move={(path, target) => props.operation({ action: "move", path, target })} sort={sort} descending={descending} foldersFirst={foldersFirst} /> : sorted
                .filter(
                  (file) =>
                    !props.documents.some(
                      (record) => record.path === file.path,
                    ),
                )
                .map((file) => (
                  <div className="file-row" key={file.token} onContextMenu={event => context(event, file)}>
                    <button
                      className="file-select"
                      title={file.relative}
                      onClick={() => props.openToken(file.token)}
                    >
                      <FileText size={17} />
                      <span>{file.relative}</span>
                    </button>
                  </div>
                ))}
              {!props.documents.length && !props.files.length && (
                <p className="sidebar-empty">
                  打开一个文件夹，
                  <br />
                  浏览 Markdown 文档。
                </p>
              )}
            </nav>
          </>
        ) : (
          <nav className="outline" aria-label="文档大纲">
            {props.headings.length ? (
              props.headings.map((heading, index) => (
                <button
                  key={`${heading.line}-${index}`}
                  style={{ paddingLeft: 18 + (heading.level - 1) * 14 }}
                  onClick={() => props.jump(heading.line)}
                >
                  <span>{heading.text}</span>
                </button>
              ))
            ) : (
              <p className="sidebar-empty">
                使用 # 标题，
                <br />
                在这里看见文档结构。
              </p>
            )}
          </nav>
        )}
      </div>
      {menu && <div className="file-context-menu" role="menu" aria-label="文件操作" style={{ left: menu.x, top: Math.max(45, menu.y) }} onClick={event => event.stopPropagation()}>
        <button role="menuitem" onClick={() => operate("new-file")}>新建文件…</button><button role="menuitem" onClick={() => operate("new-folder")}>新建文件夹…</button>
        {menu.file && <><hr />{menu.file.isDirectory !== "true" && <button role="menuitem" onClick={() => operate("duplicate")}>创建副本…</button>}<button role="menuitem" onClick={() => operate("rename")}>重命名…</button><button role="menuitem" onClick={() => operate("move")}>移动到…</button><button role="menuitem" onClick={() => operate("trash")}>移到废纸篓</button><button role="menuitem" onClick={() => { void host.writeClipboard(menu.file!.path); setMenu(null); }}>复制路径</button><button role="menuitem" onClick={() => { void host.reveal(menu.file!.path).catch(e => props.notify(e.message)); setMenu(null); }}>在 Finder 中显示</button></>}
        <hr /><button role="menuitem" onClick={() => operate("undo")}>撤销上次文件操作</button><hr /><label>排序<select aria-label="文件排序" value={sort} onChange={e => setSort(e.target.value as FileSort)}><option value="natural">自然名称</option><option value="name">字母顺序</option><option value="modified">修改时间</option><option value="created">创建时间</option></select></label><label><input type="checkbox" checked={descending} onChange={e => setDescending(e.target.checked)} />降序</label><label><input type="checkbox" checked={foldersFirst} onChange={e => setFoldersFirst(e.target.checked)} />文件夹优先</label>
      </div>}
      <div className="sidebar-footer"><button className="icon-button" aria-label="搜索文件夹" title={`搜索文件夹 ${shortcutLabel("Mod-Shift-F")}`} onClick={props.search}><Search size={16} /></button><button className="icon-button" aria-label="最近项目" onClick={props.recent}><History size={16} /></button>
        <button
          className="icon-button"
          aria-label="打开文件夹"
          title="打开文件夹"
          onClick={props.openFolder}
        >
          <FolderOpen size={16} />
        </button>
        <button
          className="icon-button"
          title="切换主题"
          aria-label="切换主题"
          onClick={props.toggleTheme}
        >
          {props.theme === "dark" ? <Moon size={19} /> : <Sun size={19} />}
        </button>
      </div>
    </aside>
  );
}
