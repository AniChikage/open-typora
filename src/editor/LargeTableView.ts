import type { DocumentNode, SelectionBookmark } from "./model.ts";
import { TableIndex, RowHeights } from "./tableData.ts";
import { tokenInlineHtml } from "./richRender.ts";
import type { Leaf } from "./richRender.ts";
import { contiguousPositions } from "./sourcePositions.ts";

export class LargeTableView {
  readonly element = document.createElement("div");
  private table = document.createElement("table");
  private head = document.createElement("thead");
  private body = document.createElement("tbody");
  leaves = new Map<string, Leaf>();
  index: TableIndex;
  private heights: RowHeights;
  private frame = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private key = "";
  private rows = new Map<number, {row: HTMLTableRowElement; leaves: Map<string, Leaf>}>();
  private lastHead = -1;
  private width = 0;
  private observer: ResizeObserver | null = null;
  private selection: SelectionBookmark = {anchor: 0, head: 0};
  private node: DocumentNode;
  private documentId: string;
  private environment: Record<string, unknown>;
  private changed: (view: LargeTableView, restore: boolean) => void;
  private composing: () => boolean;
  constructor(node: DocumentNode, documentId: string, environment: Record<string, unknown>,
    changed: (view: LargeTableView, restore: boolean) => void, composing: () => boolean) {
    this.node = node; this.documentId = documentId; this.environment = environment; this.changed = changed; this.composing = composing;
    this.index = new TableIndex(node.source); this.heights = new RowHeights(Math.max(0, this.index.length - 2));
    this.element.className = "md-large-table"; this.element.contentEditable = "false";
    this.element.setAttribute("role", "region"); this.element.setAttribute("aria-label", "大表格");
    this.table.append(this.head, this.body); this.element.append(this.table);
    this.element.addEventListener("scroll", this.schedule, {passive: true});
    this.element.addEventListener("load", this.measure, true);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => {
        if (this.element.clientWidth !== this.width) { this.width = this.element.clientWidth; this.heights = new RowHeights(Math.max(0, this.index.length - 2)); this.key = ""; }
        this.schedule();
      });
      this.observer.observe(this.element);
    }
  }
  setReadOnly(value: boolean) { this.table.contentEditable = String(!value); }
  destroy() { cancelAnimationFrame(this.frame); if (this.timer !== null) clearTimeout(this.timer); this.frame = 0; this.timer = null; this.element.removeEventListener("scroll", this.schedule); this.element.removeEventListener("load", this.measure, true); this.observer?.disconnect(); }
  private schedule = () => {
    if (this.frame || this.timer !== null) return;
    const run = () => {
      if (!this.frame && this.timer === null) return;
      cancelAnimationFrame(this.frame); if (this.timer !== null) clearTimeout(this.timer);
      this.frame = 0; this.timer = null; if (!this.composing()) this.render();
    };
    this.frame = requestAnimationFrame(run);
    // WebKit can suspend animation frames in an occluded document window.
    this.timer = setTimeout(run, 50);
  };
  update(node: DocumentNode, environment: Record<string, unknown>, selection: SelectionBookmark, readOnly: boolean) {
    if (node.source !== this.node.source) {
      const index = new TableIndex(node.source);
      if (index.length !== this.index.length) this.heights = new RowHeights(Math.max(0, index.length - 2));
      this.index = index; this.key = ""; this.rows.clear();
    }
    if (node.from !== this.node.from || environment !== this.environment) { this.key = ""; this.rows.clear(); }
    this.node = node; this.environment = environment; this.selection = {...selection};
    this.element.dataset.cid = this.table.dataset.cid = node.id;
    this.element.dataset.kind = node.kind; this.element.dataset.line = String(node.line);
    this.setReadOnly(readOnly);
    this.table.setAttribute("aria-rowcount", String(this.index.length - 1));
    if (selection.head !== this.lastHead && selection.head >= node.from && selection.head <= node.to) {
      const row = this.index.rowAt(selection.head - node.from);
      if (row >= 2) {
        const total = this.heights.offset(this.heights.count), scale = Math.max(1, total / 6_000_000);
        const top = this.heights.offset(row - 2) / scale, bottom = this.heights.offset(row - 1) / scale;
        if (top < this.element.scrollTop || bottom > this.element.scrollTop + (this.element.clientHeight || 480) - 60)
          this.element.scrollTop = Math.max(0, top - 80);
      }
    }
    this.lastHead = selection.head;
    this.render();
  }
  private row(sourceRow: number, leaves: Map<string, Leaf>) {
    const cached = this.rows.get(sourceRow);
    if (cached) { for (const [id, leaf] of cached.leaves) leaves.set(id, leaf); return cached.row; }
    const local = new Map<string, Leaf>();
    const row = document.createElement("tr"); row.dataset.sourceRow = String(sourceRow);
    row.setAttribute("aria-rowindex", String(sourceRow || 1));
    const cells = this.index.cells(sourceRow);
    for (let column = 0; column < this.index.width; column++) {
      const cell = cells[column] || {raw: "", start: this.index.line(sourceRow).length, end: this.index.line(sourceRow).length};
      const td = document.createElement(sourceRow ? "td" : "th"), span = document.createElement("span");
      const id = `${this.node.id}-row-${sourceRow}-cell-${column}`;
      span.className = "md-line"; span.dataset.leaf = id;
      span.innerHTML = tokenInlineHtml(cell.raw, this.documentId, this.environment) || "<br />";
      td.style.textAlign = this.index.align[column] || "left"; td.append(span); row.append(td);
      local.set(id, {id, nodeId: this.node.id, raw: cell.raw,
        positions: contiguousPositions(this.node.from + this.index.offsets[sourceRow] + cell.start, cell.raw.length)});
    }
    this.rows.set(sourceRow, {row, leaves: local}); for (const [id, leaf] of local) leaves.set(id, leaf);
    return row;
  }
  private spacer(height: number) {
    const row = document.createElement("tr"), cell = document.createElement("td"), space = document.createElement("div");
    row.className = "table-row-spacer"; row.contentEditable = "false"; row.setAttribute("aria-hidden", "true");
    cell.colSpan = this.index.width; cell.style.cssText = "padding:0;border:0;line-height:0;font-size:0;";
    space.style.height = `${Math.max(0, height)}px`; cell.append(space); row.append(cell); return row;
  }
  measure = () => {
    if (!this.element.isConnected || this.composing()) return;
    let changed = false;
    for (const row of this.body.querySelectorAll<HTMLTableRowElement>("tr[data-source-row]"))
      changed = this.heights.measure(Number(row.dataset.sourceRow) - 2, row.getBoundingClientRect().height) || changed;
    if (changed) { this.key = ""; this.schedule(); }
  };
  private render() {
    const atBottom = this.element.scrollTop > 0 && this.element.scrollTop + this.element.clientHeight >= this.element.scrollHeight - 4;
    const height = this.element.clientHeight || 480, total = this.heights.offset(this.heights.count), scale = Math.max(1, total / 6_000_000);
    const logicalTop = scale === 1 ? this.element.scrollTop : this.element.scrollTop / Math.max(1, this.element.scrollHeight - height) * Math.max(0, total - height);
    const from = Math.max(0, this.heights.at(Math.max(0, logicalTop - 320))), to = Math.min(this.heights.count - 1, this.heights.at(logicalTop + height + 320));
    const desired = new Set<number>();
    for (let row = from; row <= to; row++) desired.add(row);
    for (const point of [this.selection.anchor, this.selection.head]) if (point >= this.node.from && point <= this.node.to) {
      const row = this.index.rowAt(point - this.node.from); if (row >= 2) desired.add(row - 2);
    }
    const rows = [...desired].sort((a, b) => a - b), key = rows.join(",");
    if (key === this.key) return;
    this.key = key;
    const leaves = new Map<string, Leaf>(), header = this.row(0, leaves), body: HTMLElement[] = [];
    let cursor = 0;
    for (const row of rows) {
      if (row > cursor) body.push(this.spacer((this.heights.offset(row) - this.heights.offset(cursor)) / scale));
      body.push(this.row(row + 2, leaves)); cursor = row + 1;
    }
    if (cursor < this.heights.count) body.push(this.spacer((total - this.heights.offset(cursor)) / scale));
    const restore = this.element.contains(window.getSelection()?.anchorNode || null);
    if (this.head.firstElementChild !== header) this.head.replaceChildren(header);
    for (let index = 0; index < body.length; index++) if (this.body.children[index] !== body[index]) this.body.insertBefore(body[index], this.body.children[index] || null);
    const retained = new Set(body); for (const row of [...this.body.children]) if (!retained.has(row as HTMLElement)) row.remove();
    for (const row of this.rows.keys()) if (row !== 0 && !desired.has(row - 2)) this.rows.delete(row);
    this.leaves = leaves; this.changed(this, restore);
    if (atBottom) this.element.scrollTop = this.element.scrollHeight;
    requestAnimationFrame(this.measure);
  }
}
