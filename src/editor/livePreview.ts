import { StateEffect, StateField, EditorSelection } from "@codemirror/state";
import type { EditorState, Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { parseBlocks, renderMarkdown } from "./markdown";
import type { Block } from "./markdown";
import { host } from "../host";
import { renderDiagrams } from "./diagrams";
const renderEffect = StateEffect.define<boolean>();
export const setRendered = renderEffect;
const blockCache = new WeakMap<object, Block[]>();
class RenderedBlock extends WidgetType {
  constructor(
    readonly block: Block,
    readonly from: number,
    readonly to: number,
    readonly documentId: string,
  ) {
    super();
  }
  eq(other: RenderedBlock) {
    return (
      this.block.source === other.block.source &&
      this.from === other.from &&
      this.documentId === other.documentId
    );
  }
  toDOM(view: EditorView) {
    const element = document.createElement("div");
    element.className = "rendered-block";
    element.dataset.line = String(this.block.fromLine);
    element.dataset.kind = this.block.kind;
    if (this.block.kind === "frontmatter") {
      const pre = document.createElement("pre");
      pre.className = "frontmatter";
      pre.textContent = this.block.source;
      element.append(pre);
    } else
      element.innerHTML = renderMarkdown(this.block.source, this.documentId);
    element.addEventListener("mousedown", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("a")) return;
      if (event.shiftKey) return;
      event.preventDefault();
      const position = Math.min(
        this.to,
        this.from + (/^#{1,6} /.exec(this.block.source)?.[0].length ?? 0),
      );
      view.dispatch({
        selection: EditorSelection.cursor(position),
        scrollIntoView: false,
      });
      view.focus();
    });
    element.addEventListener("click", (event) => {
      const link = (event.target as HTMLElement).closest("a");
      if (link) {
        event.preventDefault();
        event.stopPropagation();
        const href = link.getAttribute("href");
        if (href && /^(https?:|mailto:)/.test(href))
          void host.openLink(href).catch(() => {});
      }
    });
    const diagram = element.querySelector<HTMLElement>(".mermaid-block");
    if (diagram) {
      diagram.dataset.mermaid = diagram.textContent || "";
      diagram.textContent = "正在绘制图表…";
      requestAnimationFrame(() => {
        void renderDiagrams(element).catch(() => {
          if (diagram.isConnected)
            diagram.textContent = diagram.dataset.mermaid!;
        });
      });
    }
    return element;
  }
  ignoreEvent() {
    return false;
  }
}
export function livePreview(documentId: string) {
  const state = StateField.define<{
    enabled: boolean;
    decorations: DecorationSet;
  }>({
    create: (editor) => ({
      enabled: true,
      decorations: build(editor, documentId),
    }),
    update(value, transaction) {
      let enabled = value.enabled;
      for (const effect of transaction.effects)
        if (effect.is(renderEffect)) enabled = effect.value;
      if (
        transaction.docChanged ||
        transaction.selection ||
        enabled !== value.enabled
      )
        return {
          enabled,
          decorations: enabled
            ? build(transaction.state, documentId)
            : Decoration.none,
        };
      return value;
    },
    provide: (field) =>
      EditorView.decorations.from(field, (value) => value.decorations),
  });
  return state;
}
function build(state: EditorState, documentId: string): DecorationSet {
  if (state.doc.length > 300_000) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  const selection = state.selection;
  let blocks = blockCache.get(state.doc);
  if (!blocks) {
    blocks = parseBlocks(state.doc.toString());
    blockCache.set(state.doc, blocks);
  }
  for (const block of blocks) {
    if (block.toLine > state.doc.lines) continue;
    const from = state.doc.line(block.fromLine).from,
      to = state.doc.line(block.toLine).to;
    const intersects = selection.ranges.some(
      (range) => range.from <= to && range.to >= from,
    );
    if (intersects) {
      const heading = /^(#{1,6}) /.exec(block.source);
      if (heading) {
        ranges.push(
          Decoration.line({
            attributes: {
              class: `live-heading live-h${heading[1].length} ${from === 0 ? "first-heading" : ""}`,
            },
          }).range(from),
        );
        ranges.push(
          Decoration.mark({ class: "heading-marker" }).range(
            from,
            from + heading[0].length,
          ),
        );
      } else {
        ranges.push(
          Decoration.line({ attributes: { class: "live-block-end" } }).range(
            state.doc.line(block.toLine).from,
          ),
        );
      }
      continue;
    }
    if (from === to) continue;
    ranges.push(
      Decoration.replace({
        widget: new RenderedBlock(block, from, to, documentId),
        block: true,
      }).range(from, to),
    );
  }
  return Decoration.set(ranges, true);
}
