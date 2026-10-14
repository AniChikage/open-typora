import {
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Moon,
  Sun,
  X,
} from "lucide-react";
import type { DocumentRecord, FileEntry } from "../types";
import type { Heading } from "../editor/markdown";
interface Props {
  documents: DocumentRecord[];
  activeId: string;
  files: FileEntry[];
  folder: string | null;
  headings: Heading[];
  tab: "files" | "outline";
  setTab(tab: "files" | "outline"): void;
  select(id: string): void;
  openToken(token: string): void;
  openFolder(): void;
  create(): void;
  refresh(): void;
  close(id: string): void;
  jump(line: number): void;
  theme: string;
  toggleTheme(): void;
}
export function Sidebar(props: Props) {
  return (
    <aside className="sidebar" aria-label="文档侧栏">
      <div className="sidebar-tabs" role="tablist" aria-label="侧栏内容">
        <button
          role="tab"
          aria-selected={props.tab === "files"}
          onClick={() => props.setTab("files")}
        >
          文件
        </button>
        <button
          role="tab"
          aria-selected={props.tab === "outline"}
          onClick={() => props.setTab("outline")}
        >
          大纲
        </button>
      </div>
      <div className="sidebar-body">
        {props.tab === "files" ? (
          <>
            <button className="folder-button" onClick={props.openFolder}>
              <FolderOpen size={18} />
              <span>打开文件夹</span>
            </button>
            <div className="sidebar-section-label">
              <span>
                {props.folder ? props.folder.split("/").at(-1) : "打开的文档"}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="新建文档"
                  title="新建文档 ⌘N"
                  onClick={props.create}
                >
                  <Plus size={16} />
                </button>
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
              {props.documents.map((record) => (
                <div
                  className={`file-row ${props.activeId === record.id ? "selected" : ""}`}
                  key={record.id}
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
              {props.files
                .filter(
                  (file) =>
                    !props.documents.some(
                      (record) => record.path === file.path,
                    ),
                )
                .map((file) => (
                  <div className="file-row" key={file.token}>
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
                  让想法有处安放。
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
                  style={{ paddingLeft: 20 + (heading.level - 1) * 13 }}
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
      <div className="sidebar-footer">
        <span>Open Typora</span>
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
