import { t } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { Dialog } from "./Dialog";
import type { DocumentRecord, FileEntry, RecentEntry } from "../types";
export function QuickOpen({ documents, files, recent, openRecent, select, open, close }: { documents: DocumentRecord[]; files: FileEntry[]; recent: RecentEntry[]; openRecent(path: string): Promise<void>; select(id: string): void; open(token: string): Promise<unknown>; close(): void }) {
  const [query, setQuery] = useState(""), [index, setIndex] = useState(0), [opening, setOpening] = useState(false), [error, setError] = useState("");
  const results = useMemo(() => {
    const candidates = [...documents.map(doc => ({ key: doc.id, name: doc.name, path: doc.path || t("本地草稿"), opened: true, recent: false })), ...files.filter(file => file.isDirectory !== "true" && !documents.some(doc => doc.path === file.path)).map(file => ({ key: file.token, name: file.relative, path: file.path, opened: false, recent: false })), ...recent.filter(item => !item.folder && !documents.some(doc => doc.path === item.path) && !files.some(file => file.path === item.path)).map(item => ({ key: item.path, path: item.path, name: item.name, opened: false, recent: true }))];
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return candidates.filter(item => terms.every(term => item.name.toLocaleLowerCase().includes(term) || item.path.toLocaleLowerCase().includes(term))).slice(0, 100);
  }, [documents, files, recent, query]);
  useEffect(() => { document.getElementById(`quick-result-${index}`)?.scrollIntoView({ block: "nearest" }); }, [index]);
  const choose = async (i: number) => { const item = results[i]; if (!item || opening) return; if (item.opened) { select(item.key); close(); } else { setOpening(true); try { const result = item.recent ? (await openRecent(item.path), true) : await open(item.key); if (result !== undefined) close(); } catch (e) { setError((e as Error).message); } finally { setOpening(false); } } };
  return <Dialog title={t("快速打开")} close={close}>
    <input className="quick-open-query" aria-label={t("搜索文档")} placeholder={t("按文件名或路径搜索")} value={query} onChange={e => { setQuery(e.target.value); setIndex(0); }} onKeyDown={event => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setIndex(i => Math.max(0, Math.min(results.length - 1, i + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter") { event.preventDefault(); void choose(index); }
    }} aria-controls="quick-open-results" aria-activedescendant={results[index] ? `quick-result-${index}` : undefined} role="combobox" aria-expanded="true" />
    {error && <p role="alert" className="form-error">{t(error)}</p>}
    <div id="quick-open-results" className="quick-open-results" role="listbox" aria-label={t("匹配文档")}>{results.map((item, i) => <button role="option" aria-selected={index === i} id={`quick-result-${i}`} key={item.key} disabled={opening} onMouseEnter={() => setIndex(i)} onClick={() => void choose(i)}><span>{item.name}</span><small>{item.path}</small></button>)}{!results.length && <p className="sidebar-empty">{t("没有匹配文档。打开文件夹后可搜索其中的 Markdown 文件。")}</p>}</div>
  </Dialog>;
}
