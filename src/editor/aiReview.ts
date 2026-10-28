export interface RewriteSelection { documentId: string; source: string; from: number; to: number; text: string }
export interface RewriteChange { from: number; to: number; before: string; after: string }
function spans(text: string) { return Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(text), part => part.segment); }
function operations(a: string[], b: string[]) {
  if ((a.length + 1) * (b.length + 1) > 1_000_000) return null;
  const width = b.length + 1, table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i * width + j] = a[i] === b[j] ? 1 + table[(i + 1) * width + j + 1] : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
  const result: { kind: "equal" | "remove" | "add"; text: string }[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) result.push({ kind: "equal", text: a[i++] }), j++;
    else if (j < b.length && (i === a.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) result.push({ kind: "add", text: b[j++] });
    else result.push({ kind: "remove", text: a[i++] });
  }
  return result;
}
function fallback(before: string, after: string): RewriteChange[] {
  const a = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(before), part => part.segment);
  const b = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(after), part => part.segment);
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix++;
  const from = a.slice(0, prefix).join("").length, removed = a.slice(prefix, a.length - suffix).join(""), added = b.slice(prefix, b.length - suffix).join("");
  return removed || added ? [{ from, to: from + removed.length, before: removed, after: added }] : [];
}
export function rewriteChanges(before: string, after: string): RewriteChange[] {
  if (before === after) return [];
  // Bound both segmentation and the quadratic diff. Large selections fall back
  // to line groups or one exact, grapheme-safe replacement, never truncation.
  const words = before.length + after.length <= 50_000 ? operations(spans(before), spans(after)) : null;
  const diff = words || operations(before.match(/[^\n]*\n|[^\n]+$/g) || [], after.match(/[^\n]*\n|[^\n]+$/g) || []);
  if (!diff) return fallback(before, after);
  const changes: RewriteChange[] = []; let position = 0, pending: RewriteChange | null = null;
  for (const part of diff) {
    if (part.kind === "equal") { if (pending) { changes.push(pending); pending = null; } position += part.text.length; }
    else {
      pending ||= { from: position, to: position, before: "", after: "" };
      if (part.kind === "remove") { pending.before += part.text; position += part.text.length; pending.to = position; }
      else pending.after += part.text;
    }
  }
  if (pending) changes.push(pending);
  // Adjacent edits across a short space/punctuation gap are one review decision.
  const merged: RewriteChange[] = [];
  for (const change of changes) {
    const previous = merged.at(-1), gap = previous && before.slice(previous.to, change.from);
    if (previous && gap !== undefined && gap.length <= 4 && !gap.includes("\n")) {
      previous.before += gap + change.before; previous.after += gap + change.after; previous.to = change.to;
    } else merged.push({ ...change });
  }
  return merged;
}
export function reviewedText(original: string, changes: RewriteChange[], accepted: readonly boolean[]) {
  let result = "", from = 0;
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index];
    if (change.from < from || original.slice(change.from, change.to) !== change.before) throw new Error("差异内容已变化，请重新生成。");
    result += original.slice(from, change.from) + (accepted[index] ? change.after : change.before); from = change.to;
  }
  return result + original.slice(from);
}
export function selectionCurrent(selection: RewriteSelection, documentId: string, source: string) {
  return documentId === selection.documentId && source === selection.source && source.slice(selection.from, selection.to) === selection.text;
}
