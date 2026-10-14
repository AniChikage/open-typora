import { useEffect, useMemo, useState } from "react";
import { Dialog } from "./Dialog";
import type { DocumentRecord, FileEntry } from "../types";
export function QuickOpen({ documents, files, select, open, close }: { documents: DocumentRecord[]; files: FileEntry[]; select(id: string): void; open(token: string): Promise<void>; close(): void }) {
  const [query, setQuery] = useState(""), [index, setIndex] = useState(0), [opening, setOpening] = useState(false);
  const results = useMemo(() => {
    const candidates = [...documents.map(doc => ({ key: doc.id, name: doc.name, path: doc.path || "本地草稿", opened: true })), ...files.filter(file => !documents.some(doc => doc.path === file.path)).map(file => ({ key: file.token, name: file.relative, path: file.path, opened: false }))];
    const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return candidates.filter(item => terms.every(term => item.name.toLocaleLowerCase().includes(term) || item.path.toLocaleLowerCase().includes(term))).slice(0, 100);
  }, [documents, files, query]);
  useEffect(() => { document.getElementById(`quick-result-${index}`)?.scrollIntoView({ block: "nearest" }); }, [index]);
  const choose = async (i: number) => { const item = results[i]; if (!item || opening) return; if (item.opened) { select(item.key); close(); } else { setOpening(true); try { await open(item.key); close(); } finally { setOpening(false); } } };
  return <Dialog title="快速打开" close={close}>
    <input className="quick-open-query" aria-label="搜索文档" placeholder="按文件名或路径搜索" value={query} onChange={e => { setQuery(e.target.value); setIndex(0); }} onKeyDown={event => {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setIndex(i => Math.max(0, Math.min(results.length - 1, i + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter") { event.preventDefault(); void choose(index); }
    }} aria-controls="quick-open-results" aria-activedescendant={results[index] ? `quick-result-${index}` : undefined} role="combobox" aria-expanded="true" />
    <div id="quick-open-results" className="quick-open-results" role="listbox" aria-label="匹配文档">{results.map((item, i) => <button role="option" aria-selected={index === i} id={`quick-result-${i}`} key={item.key} disabled={opening} onMouseEnter={() => setIndex(i)} onClick={() => void choose(i)}><span>{item.name}</span><small>{item.path}</small></button>)}{!results.length && <p className="sidebar-empty">没有匹配文档。打开文件夹后可搜索其中的 Markdown 文件。</p>}</div>
  </Dialog>;
}
