import type { WorkspaceLayout } from "../shared/contracts.js";
export type { WorkspaceLayout } from "../shared/contracts.js";
export function normalizeWorkspace(value: unknown, ids: string[], activeId: string): WorkspaceLayout | null {
  if (!value || typeof value !== "object" || ids.length < 2) return null;
  const layout = value as WorkspaceLayout;
  if (layout.direction !== "columns" && layout.direction !== "rows") return null;
  let primaryId = ids.includes(layout.primaryId) ? layout.primaryId : ids.find(id => id !== layout.secondaryId)!;
  const secondaryId = ids.includes(layout.secondaryId) && layout.secondaryId !== primaryId ? layout.secondaryId : ids.find(id => id !== primaryId)!;
  if (ids.includes(activeId) && activeId !== primaryId && activeId !== secondaryId) primaryId = activeId;
  const ratio = Number.isFinite(layout.ratio) ? Math.max(.2, Math.min(.8, layout.ratio)) : .5;
  return primaryId === layout.primaryId && secondaryId === layout.secondaryId && ratio === layout.ratio ? layout : { primaryId, secondaryId, direction: layout.direction, ratio };
}
export function activateWorkspace(layout: WorkspaceLayout | null, currentId: string, nextId: string) {
  if (!layout || nextId === layout.primaryId || nextId === layout.secondaryId) return layout;
  return currentId === layout.secondaryId ? { ...layout, secondaryId: nextId } : { ...layout, primaryId: nextId };
}
export function reorderDocuments<T extends { id: string }>(documents: T[], sourceId: string, targetId: string) {
  const from = documents.findIndex(item => item.id === sourceId), to = documents.findIndex(item => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return documents;
  const next = [...documents], [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
