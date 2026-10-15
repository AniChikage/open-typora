import { useMemo, useRef, useState } from "react";
import { ChevronRight, FileText, Folder } from "lucide-react";
import type { FileEntry } from "../types";
export type FileSort = "natural" | "name" | "modified" | "created";
export function sortFiles(files: FileEntry[], sort: FileSort, descending: boolean, foldersFirst: boolean) {
  return [...files].sort((a, b) => {
    const folder = foldersFirst ? Number(b.isDirectory === "true") - Number(a.isDirectory === "true") : 0;
    const value = ["modified", "created"].includes(sort) ? Number(a[sort as "modified"] || 0) - Number(b[sort as "modified"] || 0) : a.name.localeCompare(b.name, "zh-CN", { numeric: sort === "natural" });
    return folder || (descending ? -1 : 1) * (value || a.name.localeCompare(b.name));
  });
}
export function FileTree({ files, folder, activePath, open, context, move, sort, descending, foldersFirst }: { files: FileEntry[]; folder: string | null; activePath?: string | null; open(token: string): void; context(event: React.MouseEvent, file: FileEntry): void; move(path: string, target: string): void; sort: FileSort; descending: boolean; foldersFirst: boolean }) {
  const [closed, setClosed] = useState(new Set<string>()), root = useRef<HTMLDivElement>(null);
  const children = useMemo(() => {
    const groups = new Map<string, FileEntry[]>();
    for (const file of sortFiles(files, sort, descending, foldersFirst)) { const parent = file.relative.split("/").slice(0, -1).join("/"); groups.set(parent, [...(groups.get(parent) || []), file]); }
    return groups;
  }, [files, sort, descending, foldersFirst]);
  const toggle = (path: string, expanded: boolean) => setClosed(previous => { const next = new Set(previous); expanded ? next.add(path) : next.delete(path); return next; });
  function node(file: FileEntry, depth: number) {
    const directory = file.isDirectory === "true", expanded = !closed.has(file.path);
    return <div role="treeitem" aria-expanded={directory ? expanded : undefined} aria-selected={file.path === activePath} key={file.path}>
      <button className={`file-select tree-entry ${file.path === activePath ? "selected" : ""}`} style={{ paddingLeft: 7 + depth * 14 }} title={file.relative} data-path={file.path} data-parent={file.path.slice(0, -file.name.length - 1)} draggable onDragStart={event => { event.dataTransfer.setData("application/x-open-typora-file", file.path); event.dataTransfer.effectAllowed = "move"; }} onDragOver={event => { if (directory && event.dataTransfer.types.includes("application/x-open-typora-file")) event.preventDefault(); }} onDrop={event => { const path = event.dataTransfer.getData("application/x-open-typora-file"); if (directory && path) { event.preventDefault(); event.stopPropagation(); move(path, file.path); } }} onClick={() => directory ? toggle(file.path, expanded) : open(file.token)} onContextMenu={event => context(event, file)} onKeyDown={event => {
        const buttons = [...root.current!.querySelectorAll<HTMLButtonElement>("button.tree-entry")], index = buttons.indexOf(event.currentTarget);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus(); }
        if (event.key === "ArrowRight" && directory) { event.preventDefault(); expanded ? buttons[index + 1]?.focus() : toggle(file.path, false); }
        if (event.key === "ArrowLeft") { event.preventDefault(); if (directory && expanded) toggle(file.path, true); else { const parent = event.currentTarget.dataset.parent; buttons.find(button => button.dataset.path === parent)?.focus(); } }
      }}>{directory ? <><ChevronRight size={12} className={expanded ? "tree-chevron-open" : ""} /><Folder size={16} /></> : <><span style={{ width: 12 }} /><FileText size={16} /></>}<span>{file.name}</span></button>
      {directory && expanded && <div role="group">{children.get(file.relative)?.map(child => node(child, depth + 1))}</div>}
    </div>;
  }
  return <div ref={root} role="tree" aria-label="文件树" onDragOver={event => { if (event.dataTransfer.types.includes("application/x-open-typora-file")) event.preventDefault(); }} onDrop={event => { const path = event.dataTransfer.getData("application/x-open-typora-file"); if (path && folder) { event.preventDefault(); move(path, folder); } }}>{children.get("")?.map(file => node(file, 0))}</div>;
}
