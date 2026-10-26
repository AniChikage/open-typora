import type { DocumentRecord } from "./types";
export type TabCloseKind = "left" | "right" | "others" | "saved" | "all";
export function tabCloseTargets(documents: Pick<DocumentRecord, "id" | "path" | "content" | "savedContent">[], id: string, kind: TabCloseKind): string[] {
  const index = documents.findIndex(record => record.id === id);
  if (index < 0) return [];
  return documents.filter((record, at) => kind === "left" ? at < index : kind === "right" ? at > index : kind === "others" ? record.id !== id : kind === "saved" ? !!record.path && record.content === record.savedContent : true).map(record => record.id);
}
export type TabCopyKind = "name" | "stem" | "path" | "quoted-path" | "directory";
export function tabCopyText(record: Pick<DocumentRecord, "name" | "path">, kind: TabCopyKind): string | null {
  if (kind === "name") return record.name;
  if (kind === "stem") { const dot = record.name.lastIndexOf("."); return dot > 0 ? record.name.slice(0, dot) : record.name; }
  const path = record.path; if (!path) return null;
  if (kind === "path") return path;
  if (kind === "quoted-path") return '"' + path.replace(/"/g, '\\"') + '"';
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return separator === 0 ? path[0] : separator === 2 && path[1] === ":" ? path.slice(0, 3) : path.slice(0, separator);
}
