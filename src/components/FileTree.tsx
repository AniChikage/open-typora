import { useMemo, useState } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import type { FileEntry } from "../types";
interface Entry { path: string; name: string; children: Map<string, Entry>; file?: FileEntry }
export function FileTree({ files, activePath, open }: { files: FileEntry[]; activePath?: string | null; open(token: string): void }) {
  const [expanded, setExpanded] = useState(new Set<string>());
  const root = useMemo(() => {
    const tree: Entry = { path: "", name: "", children: new Map() };
    for (const file of files) {
      let entry = tree, prefix = "";
      for (const segment of file.relative.split("/")) {
        prefix += (prefix ? "/" : "") + segment;
        if (!entry.children.has(segment)) entry.children.set(segment, { path: prefix, name: segment, children: new Map() });
        entry = entry.children.get(segment)!;
      }
      entry.file = file;
    }
    return tree;
  }, [files]);
  const children = (entry: Entry) => [...entry.children.values()].sort((a,b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
  function node(entry: Entry, depth: number) {
    if (entry.file) return <div className={`file-row ${entry.file.path === activePath ? "selected" : ""}`} key={entry.path} role="treeitem"><button className="file-select" style={{ paddingLeft: 18 + depth * 14 }} title={entry.file.relative} onClick={() => open(entry.file!.token)}><FileText size={16} /><span>{entry.name}</span></button></div>;
    const opened = expanded.has(entry.path) || (!!activePath && files.some(file => file.path === activePath && file.relative.startsWith(entry.path + "/")) && !expanded.has("closed:" + entry.path));
    return <div role="treeitem" aria-expanded={opened} key={entry.path}><button className="tree-folder file-select" style={{ paddingLeft: 6 + depth * 14 }} onClick={() => setExpanded(previous => {
      const next = new Set(previous); if (opened) { next.delete(entry.path); next.add("closed:" + entry.path); } else { next.add(entry.path); next.delete("closed:" + entry.path); } return next;
    })}><ChevronRight size={12} className={opened ? "tree-chevron-open" : ""} /><Folder size={16} /><span>{entry.name}</span></button>{opened && <div role="group">{children(entry).map(child => node(child, depth + 1))}</div>}</div>;
  }
  return <div role="tree" aria-label="文件树">{children(root).map(entry => node(entry, 0))}</div>;
}
