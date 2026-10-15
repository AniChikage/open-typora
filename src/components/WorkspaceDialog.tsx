import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { host } from "../host";
import type { FileEntry, FileOperation, RecentEntry, SearchMatch, SearchResult } from "../types";

export function FileOperationDialog({ operation, files, folder, run, close }: { operation: FileOperation; files: FileEntry[]; folder: string | null; run(operation: FileOperation): Promise<void>; close(): void }) {
  const [name, setName] = useState(operation.name || ""), [target, setTarget] = useState(folder || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const titles = { "new-file": "新建文件", "new-folder": "新建文件夹", duplicate: "创建副本", rename: "重命名", move: "移动到文件夹", trash: "移到废纸篓", undo: "撤销文件操作" };
  async function submit() { setBusy(true); setError(""); try { await run({ ...operation, name: name.trim(), target }); close(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <Dialog title={titles[operation.action]} close={() => { if (!busy) close(); }}><form onSubmit={event => { event.preventDefault(); void submit(); }}>
    <p className="dialog-note workspace-path">{operation.path}</p>
    {operation.action === "move" ? <label className="workspace-field">目标文件夹<select aria-label="目标文件夹" value={target} onChange={e => setTarget(e.target.value)}><option value={folder || ""}>{folder?.split("/").at(-1) || "当前文件夹"}</option>{files.filter(file => file.isDirectory === "true").map(file => <option key={file.path} value={file.path}>{file.relative}</option>)}</select></label> : <label className="workspace-field">名称<input aria-label="文件名称" value={name} required maxLength={200} onChange={e => setName(e.target.value)} onFocus={event => { const end = event.target.value.lastIndexOf("."); event.target.setSelectionRange(0, end > 0 ? end : event.target.value.length); }} /></label>}
    {error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button className="primary-button" disabled={busy || (!name.trim() && operation.action !== "move")}>{busy ? "正在处理…" : "确定"}</button></div>
  </form></Dialog>;
}
export function RecentDialog({ entries, action, close }: { entries: RecentEntry[]; action(action: string, path?: string): Promise<void>; close(): void }) {
  const [error, setError] = useState("");
  async function run(kind: string, path?: string) { try { await action(kind, path); if (kind === "open") close(); } catch (e) { setError((e as Error).message); } }
  return <Dialog title="最近文件与文件夹" close={close}><div className="recent-list">{entries.map(item => <div className="recent-row" key={item.path}><button className="recent-open" onClick={() => void run("open", item.path)}><span>{item.folder ? "▸ " : ""}{item.name}{item.pinned ? " · 已置顶" : ""}</span><small>{item.path}</small></button>{item.folder && <button aria-label={`${item.pinned ? "取消置顶" : "置顶"} ${item.name}`} onClick={() => void run("pin", item.path)}>{item.pinned ? "取消置顶" : "置顶"}</button>}<button aria-label={`移除 ${item.name}`} onClick={() => void run("remove", item.path)}>×</button></div>)}{!entries.length && <p className="sidebar-empty">最近打开的文件和文件夹会显示在这里。</p>}</div>{error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-actions"><button onClick={() => void run("clear")}>清除未置顶项目</button><button onClick={close}>完成</button></div></Dialog>;
}
export function GlobalSearch({ folder, open, close }: { folder: string | null; open(match: SearchMatch): Promise<void>; close(): void }) {
  const [query, setQuery] = useState(""), [regex, setRegex] = useState(false), [caseSensitive, setCase] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    const revision = ++sequence.current; setError(""); setResult(null);
    if (!query || !folder) { setBusy(false); return; }
    setBusy(true);
    const timer = setTimeout(() => { void host.searchFiles(query, { regex, caseSensitive }).then(value => { if (sequence.current === revision) setResult(value); }).catch(e => { if (sequence.current === revision) setError(e.message); }).finally(() => { if (sequence.current === revision) setBusy(false); }); }, 280);
    return () => { clearTimeout(timer); sequence.current++; };
  }, [query, regex, caseSensitive, folder]);
  return <Dialog title="搜索文件夹内容" close={close}><input className="quick-open-query" aria-label="搜索文件夹内容" placeholder={folder ? "搜索 Markdown 内容" : "请先打开文件夹"} value={query} onChange={event => setQuery(event.target.value)} disabled={!folder} /><div className="search-options"><label><input type="checkbox" checked={caseSensitive} onChange={e => setCase(e.target.checked)} />区分大小写</label><label><input type="checkbox" checked={regex} onChange={e => setRegex(e.target.checked)} />正则表达式</label></div><p role="status" className="dialog-note">{busy ? "正在搜索…" : result ? `${result.matches.length} 处匹配${result.truncated ? "（显示前 500 处）" : ""}${result.skipped ? `，${result.skipped} 个文件因大小或读取问题跳过` : ""}` : folder || "打开文件夹后即可搜索。"}</p>{error && <p role="alert" className="form-error">{error}</p>}<div className="quick-open-results global-search-results">{result?.matches.map((match, index) => <button key={`${match.path}:${match.line}:${match.column}:${index}`} onClick={() => void open(match).then(close).catch(e => setError(e.message))}><span>{match.name} <small>第 {match.line} 行</small></span><code>{match.preview}</code></button>)}</div></Dialog>;
}
