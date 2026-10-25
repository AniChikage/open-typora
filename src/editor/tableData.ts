import type { SourceEdit } from "./sourcePositions.ts";
import type { StateBlock } from "markdown-it";
export function tableRowCells(line: string) {
  const cells: { raw: string; start: number; end: number }[] = [];
  let start = /^\s*\|/.test(line) ? line.indexOf("|") + 1 : 0;
  for (let i = start; i <= line.length; i++) {
    if (line[i] === "\\" && i + 1 < line.length) { i++; continue; }
    if (i === line.length || line[i] === "|") {
      if (i === line.length && !line.slice(start).trim() && /\|\s*$/.test(line)) break;
      const original = line.slice(start, i), raw = original.trim();
      const from = start + (raw ? original.length - original.trimStart().length : Math.min(1, original.length));
      cells.push({ raw, start: from, end: from + raw.length }); start = i + 1;
    }
  }
  return cells;
}
export class TableIndex {
  readonly offsets: number[];
  readonly width: number;
  readonly align: string[];
  readonly source: string;
  constructor(source: string, previous?: TableIndex, edit?: SourceEdit) {
    this.source = source;
    if (previous && edit) {
      const first = previous.rowAt(edit.from), last = previous.rowAt(edit.to);
      const delta = edit.insert.length - (edit.to - edit.from);
      this.offsets = previous.offsets.slice(0, first + 1);
      // Reindex only the touched lines; shift the remaining numeric offsets.
      const end = previous.end(last) + delta;
      for (let at = this.offsets[first]; at < end; at++)
        if (source[at] === "\n" && at + 1 < source.length) this.offsets.push(at + 1);
      for (let row = last + 1; row < previous.length; row++) this.offsets.push(previous.offsets[row] + delta);
    } else {
      this.offsets = [0];
      for (let at = 0; at < source.length; at++) if (source[at] === "\n" && at + 1 < source.length) this.offsets.push(at + 1);
    }
    this.width = tableRowCells(this.line(0)).length;
    this.align = tableRowCells(this.line(1)).map(cell => /^:.*:$/.test(cell.raw) ? "center" : /:$/.test(cell.raw) ? "right" : "left");
  }
  get length() { return this.offsets.length; }
  end(row: number) { return row + 1 < this.length ? this.offsets[row + 1] - 1 : this.source.length; }
  line(row: number) { return this.source.slice(this.offsets[row], this.end(row)); }
  rowAt(position: number) {
    let from = 0, to = this.length;
    while (from < to) { const middle = (from + to) >>> 1; if (this.offsets[middle] <= position) from = middle + 1; else to = middle; }
    return Math.max(0, from - 1);
  }
  cells(row: number) { return tableRowCells(this.line(row)); }
}
export function compactPipeRow(row: string, width: number) {
  if (!row.startsWith("|") || row.includes("[^")) return false;
  let pipes = 0;
  for (let at = 0; at < row.length; at++) {
    if (row[at] === "\\") at++;
    else if (row[at] === "|") pipes++;
  }
  return pipes - (/\|[ \t]*$/.test(row) ? 1 : 0) === width;
}

// Only the editor's block index uses this rule. Export/print still use full Markdown parsing.
// Restrict it to unambiguous top-level pipe rows; other table syntax keeps the normal parser.
export function compactTable(state: StateBlock, start: number, end: number, silent: boolean) {
  if (!state.env.compactBlocks || state.level !== 0 || start + 2 >= end || state.sCount[start] >= 4) return false;
  const line = (at: number) => state.src.slice(state.bMarks[at] + state.tShift[at], state.eMarks[at]);
  const header = line(start), delimiter = line(start + 1);
  const width = tableRowCells(header).length, separators = tableRowCells(delimiter);
  if (!header.startsWith("|") || header.includes("[^") || !width || width !== separators.length || !separators.every(cell => /^:?-+:?$/.test(cell.raw))) return false;
  let next = start + 2;
  for (; next < end; next++) {
    if (state.sCount[next] >= 4) break;
    const row = line(next);
    if (!row.trim()) break;
    if (!row.startsWith("|")) {
      if (!state.md.block.ruler.getRules("blockquote").some(rule => rule(state, next, end, true))) return false;
      break;
    }
    if (!compactPipeRow(row, width)) return false;
  }
  if (next - start < 200) return false;
  if (silent) return true;
  const token = state.push("table_open", "table", 0);
  token.block = true; token.map = [start, next]; state.line = next;
  return true;
}

// Sparse measured corrections to a uniform row estimate, with O(log n) updates/lookups.
export class RowHeights {
  private corrections: Float64Array;
  private measured = new Map<number, number>();
  readonly count: number;
  readonly estimate: number;
  constructor(count: number, estimate = 40) { this.count = count; this.estimate = estimate; this.corrections = new Float64Array(count + 1); }
  measure(row: number, height: number) {
    if (!(height > 0) || Math.abs(height - (this.measured.get(row) ?? this.estimate)) < 1) return false;
    const delta = height - (this.measured.get(row) ?? this.estimate); this.measured.set(row, height);
    for (let at = row + 1; at <= this.count; at += at & -at) this.corrections[at] += delta;
    return true;
  }
  offset(row: number) {
    let value = row * this.estimate;
    for (let at = Math.min(this.count, row); at > 0; at -= at & -at) value += this.corrections[at];
    return value;
  }
  at(offset: number) {
    let from = 0, to = this.count;
    while (from < to) { const middle = (from + to) >>> 1; if (this.offset(middle + 1) < offset) from = middle + 1; else to = middle; }
    return Math.min(this.count - 1, from);
  }
}
