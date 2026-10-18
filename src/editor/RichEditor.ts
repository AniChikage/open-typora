import emojiNames from "markdown-it-emoji/lib/data/full.mjs";
import { clearInlineFormats } from "./inlineFormats.ts";
import type { InlineFormat } from "./inlineFormats.ts";
import { EditorState, Compartment } from "@codemirror/state";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { indentUnit } from "@codemirror/language";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { defaultKeymap, indentMore, indentLess } from "@codemirror/commands";
import { MarkdownDocument } from "./model.ts";
import type { DocumentNode, SelectionBookmark } from "./model.ts";
import {
  renderNode,
  tableRowCells,
  fenceRange,
  codeBody,
  encodeCodeBody,
  codePosition,
} from "./richRender.ts";
import type { Leaf } from "./richRender.ts";
import { renderDiagrams } from "./diagrams.ts";
import { renderMath } from "./math.ts";
import { fenceLanguage } from "./fenceLanguage.ts";
import { applyBlockCommand } from "./blockCommands.ts";
import type { BlockArguments } from "./blockCommands.ts";
import { htmlToMarkdown } from "./clipboard.ts";
import { inlineTokens } from "./markdown.ts";
export interface RichCallbacks {
  change(): void;
  cursor(line: number, column: number): void;
  image(file: File): void;
  link(url: string): void;
  compositionFinished(): void;
}
export class RichEditor {
  leaves = new Map<string, Leaf>();
  composing = false;
  private composingLeaf: Leaf | null = null;
  private mutating = false;
  private pointing = false;
  private html = new Map<string, string>();
  private fence: { id: string; leaf: Leaf; view: EditorView } | null = null;
  private emojiPopup: HTMLDivElement;
  private emojiOptions: string[] = [];
  private emojiIndex = 0;
  private emojiFrom = 0;
  private emojiEnabled = true;
  private emojiDismissed = "";
  private tableToolbar: HTMLDivElement;
  private pendingFormat = new Map<string, string>();
  private tabSize = 2;
  private typewriter = false;
  private autoPair = false;
  private readOnly = false;
  private protectReadOnly = (event: Event) => {
    if (!this.readOnly) return;
    if (event.type === "keydown") {
      const key = event as KeyboardEvent;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Escape"].includes(key.key) || ((key.metaKey || key.ctrlKey) && ["a", "c", "f"].includes(key.key.toLowerCase()))) return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
  };
  private scrollFrame = 0;
  private fenceBehavior = new Compartment();
  private fenceOptions() { return [EditorState.readOnly.of(this.readOnly), EditorView.editable.of(!this.readOnly), indentUnit.of(" ".repeat(this.tabSize)), ...(this.autoPair ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [])]; }
  readonly root: HTMLElement;
  readonly model: MarkdownDocument;
  readonly documentId: string;
  readonly callbacks: RichCallbacks;
  constructor(
    root: HTMLElement,
    model: MarkdownDocument,
    documentId: string,
    callbacks: RichCallbacks,
  ) {
    this.root = root;
    this.model = model;
    this.documentId = documentId;
    this.callbacks = callbacks;
    root.contentEditable = "true";
    root.role = "textbox";
    root.setAttribute("aria-multiline", "true");
    root.setAttribute("aria-label", "Markdown 编辑器");
    root.spellcheck = false;
    for (const type of ["beforeinput", "keydown", "paste", "cut", "drop", "compositionstart"]) root.addEventListener(type, this.protectReadOnly, true);
    root.addEventListener("beforeinput", this.beforeInput);
    root.addEventListener("input", this.input);
    root.addEventListener("keydown", this.keydown);
    root.addEventListener("paste", this.paste);
    root.addEventListener("copy", this.copy);
    root.addEventListener("cut", this.cut);
    root.addEventListener("drop", this.drop);
    root.addEventListener("click", this.click);
    root.addEventListener("pointerdown", this.pointerDown);
    document.addEventListener("pointerup", this.pointerUp);
    root.addEventListener("compositionstart", this.compositionStart);
    root.addEventListener("compositionend", this.compositionEnd);
    document.addEventListener("selectionchange", this.selectionChange);
    this.tableToolbar = document.createElement("div");
    this.tableToolbar.className = "table-tools";
    this.tableToolbar.contentEditable = "false";
    this.tableToolbar.hidden = true;
    for (const [label, action] of [
      ["添加行", "row"],
      ["删除行", "removeRow"],
      ["添加列", "column"],
      ["删除列", "removeColumn"],
      ["左对齐", "left"],
      ["居中", "center"],
      ["右对齐", "right"],
    ]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.type = "button";
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => this.tableAction(action));
      this.tableToolbar.append(button);
    }
    this.emojiPopup = document.createElement("div"); this.emojiPopup.className = "emoji-completion"; this.emojiPopup.hidden = true; this.emojiPopup.role = "listbox"; this.emojiPopup.setAttribute("aria-label", "Emoji 建议");
    this.emojiPopup.addEventListener("mousedown", event => event.preventDefault());
    root.parentElement!.append(this.emojiPopup);
    root.parentElement!.append(this.tableToolbar);
    this.render(false);
  }
  destroy() {
    for (const type of ["beforeinput", "keydown", "paste", "cut", "drop", "compositionstart"]) this.root.removeEventListener(type, this.protectReadOnly, true);
    cancelAnimationFrame(this.scrollFrame);
    this.fence?.view.destroy();
    this.tableToolbar.remove(); this.emojiPopup.remove();
    document.removeEventListener("selectionchange", this.selectionChange);
    document.removeEventListener("pointerup", this.pointerUp);
    for (const [type, listener] of [
      ["beforeinput", this.beforeInput],
      ["input", this.input],
      ["keydown", this.keydown],
      ["paste", this.paste],
      ["copy", this.copy],
      ["cut", this.cut],
      ["drop", this.drop],
      ["click", this.click],
      ["pointerdown", this.pointerDown],
      ["compositionstart", this.compositionStart],
      ["compositionend", this.compositionEnd],
    ] as const)
      this.root.removeEventListener(type, listener as EventListener);
  }
  private textNodes(element: Node): Text[] {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest(".md-view,.md-ui")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Text[] = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    return nodes;
  }
  private raw(element: Node) {
    return this.textNodes(element)
      .map((n) => n.data)
      .join("");
  }
  private leafElement(node: Node | null | undefined) {
    const element = node?.nodeType === Node.ELEMENT_NODE
      ? node as HTMLElement
      : node?.parentElement;
    return element && this.root.contains(element)
      ? element.closest<HTMLElement>("[data-leaf]")
      : null;
  }
  private point(node: Node, offset: number) {
    const parent =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : node.parentElement;
    let element = parent?.closest<HTMLElement>("[data-leaf]");
    if (!element || !this.root.contains(element)) {
      const block = parent?.closest<HTMLElement>("[data-cid]");
      if (block)
        return (
          this.model.nodes.find((n) => n.id === block.dataset.cid)?.from || 0
        );
      if (node === this.root) {
        const child = this.root.children[
          Math.min(offset, this.root.children.length - 1)
        ] as HTMLElement;
        return (
          this.model.nodes.find((n) => n.id === child?.dataset.cid)?.from ??
          this.model.text.length
        );
      }
      return this.model.selection.head;
    }
    const leaf = this.leaves.get(element.dataset.leaf!);
    if (!leaf) return this.model.selection.head;
    const range = document.createRange();
    range.setStart(element, 0);
    try {
      range.setEnd(node, offset);
    } catch {
      return leaf.positions[0];
    }
    const fragment = range.cloneContents();
    fragment.querySelectorAll(".md-view,.md-ui").forEach((e) => e.remove());
    const local = fragment.textContent?.length || 0;
    return leaf.positions[Math.min(local, leaf.positions.length - 1)];
  }
  bookmark(): SelectionBookmark {
    if (this.fence?.view.hasFocus) {
      const selection = this.fence.view.state.selection.main,
        start = this.fence.leaf.positions[0];
      const node = this.model.nodes.find(
        (n) => n.id === this.fence!.leaf.nodeId,
      );
      if (node && this.fence.leaf.fenceLine !== undefined) {
        const body = codeBody(node, this.fence.leaf.fenceLine),
          raw = this.fence.view.state.doc.toString();
        return {
          anchor: codePosition(
            node.from + body.from,
            raw,
            body.prefix,
            selection.anchor,
          ),
          head: codePosition(
            node.from + body.from,
            raw,
            body.prefix,
            selection.head,
          ),
        };
      }
      return { anchor: start + selection.anchor, head: start + selection.head };
    }
    const selection = window.getSelection();
    if (
      !selection?.anchorNode ||
      !selection.focusNode ||
      !this.root.contains(selection.anchorNode) ||
      !this.root.contains(selection.focusNode)
    )
      return this.model.selection;
    return {
      anchor: this.point(selection.anchorNode, selection.anchorOffset),
      head: this.point(selection.focusNode, selection.focusOffset),
    };
  }
  private domPoint(position: number): { node: Node; offset: number } | null {
    const candidates = [...this.leaves.values()].filter(
      (leaf) =>
        position >= leaf.positions[0] && position <= leaf.positions.at(-1)!,
    );
    const leaf =
      candidates[0] ||
      [...this.leaves.values()].sort(
        (a, b) =>
          Math.abs(a.positions[0] - position) -
          Math.abs(b.positions[0] - position),
      )[0];
    if (!leaf) return null;
    const element = this.root.querySelector<HTMLElement>(
      `[data-leaf="${leaf.id}"]`,
    );
    if (!element) return null;
    let local = leaf.positions.findIndex((p) => p >= position);
    if (local < 0) local = leaf.raw.length;
    const texts = this.textNodes(element);
    for (const text of texts) {
      if (local <= text.length) return { node: text, offset: local };
      local -= text.length;
    }
    return { node: element, offset: 0 };
  }
  restore(selection = this.model.selection, focus = true) {
    const anchor = this.domPoint(selection.anchor),
      head = this.domPoint(selection.head);
    if (!anchor || !head) return;
    if (focus) this.root.focus({ preventScroll: true });
    window
      .getSelection()
      ?.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset);
    this.expandInline();
  }
  render(restore = true) {
    if (this.composing) return;
    this.mutating = true;
    const fresh = new Map<string, Leaf>();
    const desired: HTMLElement[] = [];
    for (const node of this.model.nodes) {
      const element = renderNode(
        node,
        this.documentId,
        fresh,
        this.model.environment,
      );
      const previous = this.root.querySelector<HTMLElement>(
        `:scope > [data-cid="${node.id}"]`,
      );
      if (this.fence?.id === node.id && previous) {
        desired.push(previous);
        continue;
      }
      const html = element.outerHTML;
      if (previous && this.html.get(node.id) === html) desired.push(previous);
      else {
        if (previous) previous.replaceWith(element);
        desired.push(element);
      }
      this.html.set(node.id, html);
    }
    this.leaves = fresh;
    for (let i = 0; i < desired.length; i++)
      if (this.root.children[i] !== desired[i])
        this.root.insertBefore(desired[i], this.root.children[i] || null);
    for (const element of [...this.root.children])
      if (!desired.includes(element as HTMLElement)) element.remove();
    if (restore && !this.fence) this.restore();
    this.mutating = false;
    void renderDiagrams(this.root).catch(() => {});
    void renderMath(this.root).catch(() => {});
  }
  private publish(restore = true) {
    this.render(restore);
    if (!this.fence && !this.composing && this.model.selection.anchor === this.model.selection.head) {
      const leaf = [...this.leaves.values()].find(leaf => leaf.kind === "fence" && this.model.selection.head >= leaf.positions[0] && this.model.selection.head <= leaf.positions.at(-1)!);
      const element = leaf && this.root.querySelector<HTMLElement>(`[data-fence="${leaf.id}"]`); if (element) this.activateFence(element);
    }
    this.callbacks.change();
    this.reportCursor();
  }
  private reportCursor() {
    const before = this.model.text.slice(0, this.model.selection.head),
      lines = before.split("\n");
    this.callbacks.cursor(lines.length, lines.at(-1)!.length + 1);
    this.updateWritingMode(); this.updateEmoji();
  }
  setOptions(options: { spellcheck: boolean; tabSize: number; typewriter: boolean; autoPair?: boolean; emoji?: boolean; readOnly?: boolean }) {
    this.readOnly = options.readOnly ?? false;
    this.root.contentEditable = String(!this.readOnly);
    this.root.setAttribute("aria-readonly", String(this.readOnly));
    this.tableToolbar.inert = this.readOnly;
    for (const checkbox of this.root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) checkbox.disabled = this.readOnly;
    this.emojiEnabled = options.emoji !== false;
    this.root.spellcheck = options.spellcheck;
    this.tabSize = options.tabSize;
    this.typewriter = options.typewriter;
    this.autoPair = options.autoPair ?? false;
    this.fence?.view.dispatch({ effects: this.fenceBehavior.reconfigure(this.fenceOptions()) });
    this.updateWritingMode();
  }
  private updateWritingMode() {
    const active = this.model.nodeAt(this.model.selection.head);
    for (const block of this.root.children) block.classList.toggle("is-active", block.getAttribute("data-cid") === active?.id);
    const activeElement = active && this.root.querySelector<HTMLElement>(`[data-cid="${active.id}"]`), selection = window.getSelection();
    if (activeElement && selection?.rangeCount && activeElement.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0), rect = typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : null;
      if (rect && rect.height) { const parent = selection.anchorNode?.parentElement, height = parent ? parseFloat(getComputedStyle(parent).lineHeight) || rect.height : rect.height; activeElement.style.setProperty("--focus-line-top", `${Math.max(0, rect.top - activeElement.getBoundingClientRect().top - (height - rect.height) / 2)}px`); activeElement.style.setProperty("--focus-line-height", `${height}px`); }
    }
    if (!this.typewriter || this.composing || !this.root.contains(window.getSelection()?.anchorNode || null)) return;
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0), rect = range.getBoundingClientRect();
      const scroller = this.root.parentElement!, bounds = scroller.getBoundingClientRect();
      if (rect.height && Math.abs(rect.top - bounds.top - bounds.height / 2) > 2) scroller.scrollTop += rect.top - bounds.top - bounds.height / 2;
    });
  }
  private expandInline() {
    const selection = window.getSelection(),
      anchor = selection?.anchorNode?.parentElement,
      head = selection?.focusNode?.parentElement;
    this.root
      .querySelectorAll<HTMLElement>(".md-inline")
      .forEach((element) =>
        element.classList.toggle(
          "md-expand",
          !!(
            (anchor && element.contains(anchor) && selection?.isCollapsed) ||
            (head && element.contains(head) && selection?.isCollapsed)
          ),
        ),
      );
    const table = anchor?.closest("table");
    this.tableToolbar.hidden = !table;
    if (table) {
      const rect = table.getBoundingClientRect(),
        parent = this.root.parentElement!.getBoundingClientRect();
      this.tableToolbar.style.top = `${Math.max(0, rect.top - parent.top - 29)}px`;
      this.tableToolbar.style.left = `${rect.left - parent.left}px`;
    }
  }
  private selectionChange = () => {
    if (
      this.mutating ||
      this.composing ||
      !this.root.contains(window.getSelection()?.anchorNode || null)
    )
      return;
    const selection = this.bookmark();
    if (
      selection.anchor !== this.model.selection.anchor ||
      selection.head !== this.model.selection.head
    ) {
      this.pendingFormat.clear();
      this.model.closeGroup();
    }
    this.model.selection = selection;
    if (!this.pointing) this.expandInline();
    this.reportCursor();
  };
  private pointerDown = () => {
    this.pointing = true;
  };
  private pointerUp = () => {
    requestAnimationFrame(() => {
      this.pointing = false;
      this.selectionChange();
    });
  };
  private beforeInput = (event: InputEvent) => {
    if (
      this.composing ||
      event.isComposing ||
      (event.target as HTMLElement)?.closest(".cm-editor")
    )
      return;
    const selection = this.bookmark();
    this.model.selection = selection;
    let from = Math.min(selection.anchor, selection.head),
      to = Math.max(selection.anchor, selection.head),
      insert = event.data || "",
      kind = "typing";
    switch (event.inputType) {
      case "historyUndo":
        event.preventDefault();
        this.undo();
        return;
      case "historyRedo":
        event.preventDefault();
        this.redo();
        return;
      case "insertParagraph":
        event.preventDefault();
        this.enter(false);
        return;
      case "insertLineBreak":
        event.preventDefault();
        this.enter(true);
        return;
      case "formatBold":
        event.preventDefault();
        this.wrap("**", "**");
        return;
      case "formatItalic":
        event.preventDefault();
        this.wrap("*", "*");
        return;
      case "deleteContentBackward":
        if (from === to) {
          const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
          if (this.autoPair && pairs[this.model.text[from - 1]] && pairs[this.model.text[from - 1]] === this.model.text[to]) {
            from--; to++; insert = ""; break;
          }
          const node = this.model.nodeAt(from),
            previous = this.model.nodes[this.model.nodes.indexOf(node!) - 1];
          const lineStart = this.model.text.lastIndexOf("\n", from - 1) + 1,
            prefix = this.model.text.slice(lineStart, from);
          if (
            node?.from === from &&
            node.kind === "paragraph_open" &&
            previous &&
            ["paragraph_open", "heading_open"].includes(previous.kind)
          ) {
            from = previous.to;
            kind = "structure";
          } else if (/^\s*#{1,6}\s+$/.test(prefix)) { from = lineStart; kind = "structure"; } else if (
            /^\s*(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?$/.test(prefix)
          ) {
            from = lineStart;
            kind = "structure";
          } else from = previousGrapheme(this.model.text, from);
        }
        insert = "";
        break;
      case "deleteContentForward":
        if (from === to) {
          const node = this.model.nodeAt(from),
            next = this.model.nodes[this.model.nodes.indexOf(node!) + 1];
          to =
            node?.to === from &&
            next?.kind === "paragraph_open" &&
            ["paragraph_open", "heading_open"].includes(node.kind)
              ? next.from
              : nextGrapheme(this.model.text, to);
        }
        insert = "";
        break;
      case "deleteWordBackward":
        if (from === to)
          from -=
            /[\p{L}\p{N}_]+\s*$|\s+$|.$/u.exec(
              this.model.text.slice(0, from),
            )?.[0].length || 0;
        insert = "";
        break;
      case "deleteWordForward":
        if (from === to)
          to +=
            /^\s*[\p{L}\p{N}_]+|^\s+|^./u.exec(this.model.text.slice(to))?.[0]
              .length || 0;
        insert = "";
        break;
      case "insertText":
      case "insertReplacementText":
        if (this.autoPair && event.inputType === "insertText" && insert.length === 1) {
          const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'" };
          if (from === to && ")]}'\"".includes(insert) && this.model.text[from] === insert) {
            event.preventDefault(); this.model.selection = { anchor: from + 1, head: from + 1 }; this.restore(); this.reportCursor(); return;
          }
          const close = pairs[insert];
          if (close && !(insert === "'" && /[\p{L}\p{N}]/u.test(this.model.text[from - 1] || ""))) {
            const body = this.model.text.slice(from, to), at = from + 1;
            event.preventDefault();
            if (this.model.replace(from, to, insert + body + close, kind, { anchor: at, head: at + body.length })) this.publish();
            return;
          }
        }
        if (from === to && this.pendingFormat.size && insert) {
          const before = [...this.pendingFormat.keys()].join(""), after = [...this.pendingFormat.values()].reverse().join("");
          const at = from + before.length + insert.length;
          this.pendingFormat.clear(); event.preventDefault();
          if (this.model.replace(from, to, before + insert + after, kind, { anchor: at, head: at })) this.publish();
          return;
        }
        break;
      default:
        return;
    }
    event.preventDefault();
    if (this.model.replace(from, to, insert, kind)) this.publish();
  };
  private input = (event: Event) => {
    if (
      this.composing ||
      (event as InputEvent).isComposing ||
      (event.target as HTMLElement).closest(".cm-editor")
    )
      return;
    // Browser-owned spellcheck/accessibility edits reconcile only their edited leaf.
    const element = this.leafElement(window.getSelection()?.anchorNode);
    const leaf = element && this.leaves.get(element.dataset.leaf!);
    if (!leaf || !element) return;
    const raw = this.raw(element);
    if (this.reconcileLeaf(leaf, raw, "native-input")) this.publish();
  };
  private reconcileLeaf(
    leaf: Leaf,
    raw: string,
    kind: string,
    localHead?: number,
  ) {
    if (raw === leaf.raw) return false;
    let before = 0,
      after = 0;
    while (
      before < raw.length &&
      before < leaf.raw.length &&
      raw[before] === leaf.raw[before]
    )
      before++;
    while (
      after < raw.length - before &&
      after < leaf.raw.length - before &&
      raw[raw.length - after - 1] === leaf.raw[leaf.raw.length - after - 1]
    )
      after++;
    const from = leaf.positions[before],
      to = leaf.positions[leaf.raw.length - after],
      insert = raw.slice(before, raw.length - after);
    const local = localHead ?? before + insert.length;
    const head =
      local < before
        ? leaf.positions[local]
        : local <= raw.length - after
          ? from + local - before
          : leaf.positions[local - raw.length + leaf.raw.length] +
            insert.length -
            (to - from);
    return this.model.replace(from, to, insert, kind, { anchor: head, head });
  }
  private compositionStart = () => {
    const element = this.leafElement(window.getSelection()?.anchorNode);
    this.model.selection = this.bookmark();
    this.model.closeGroup();
    this.composingLeaf = element
      ? this.leaves.get(element.dataset.leaf!) || null
      : null;
    this.composing = true;
  };
  private compositionEnd = () => {
    queueMicrotask(() => {
      const leaf = this.composingLeaf,
        element = leaf && this.root.querySelector(`[data-leaf="${leaf.id}"]`);
      if (leaf && element) {
        const raw = this.raw(element),
          selection = window.getSelection();
        let local = raw.length;
        if (selection?.anchorNode && element.contains(selection.anchorNode)) {
          const range = document.createRange();
          range.setStart(element, 0);
          range.setEnd(selection.anchorNode, selection.anchorOffset);
          local = range.toString().length;
        }
        this.reconcileLeaf(leaf, raw, "composition", local);
      }
      this.composing = false;
      this.composingLeaf = null;
      this.publish();
      this.callbacks.compositionFinished();
    });
  };
  private paste = (event: ClipboardEvent) => {
    if ((event.target as HTMLElement).closest(".cm-editor")) return;
    const images = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith("image/"));
    if (images.length) {
      event.preventDefault();
      this.model.selection = this.bookmark();
      for (const image of images) this.callbacks.image(image);
      return;
    }
    const html = event.clipboardData?.getData("text/html");
    const plain = event.clipboardData?.getData("text/plain") || "";
    const cell = window.getSelection()?.anchorNode?.parentElement?.closest("td,th");
    if (cell && (plain.includes("\t") || html && /<table\b/i.test(html))) {
      const table = html ? new DOMParser().parseFromString(html, "text/html").querySelector("table") : null;
      const grid = table ? [...table.rows].map(row => [...row.cells].map(cell => htmlToMarkdown(cell.innerHTML))) : plain.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").map(line => line.split("\t"));
      if (this.pasteTable(grid, cell as HTMLTableCellElement)) { event.preventDefault(); return; }
    }
    const text = event.clipboardData?.getData("text/x-open-typora-markdown") || (html ? htmlToMarkdown(html) : event.clipboardData?.getData("text/plain"));
    if (text !== undefined) {
      event.preventDefault();
      this.insert(text, "paste");
    }
  };
  clipboard() {
    const selection = this.bookmark(),
      from = Math.min(selection.anchor, selection.head),
      to = Math.max(selection.anchor, selection.head);
    if (from === to) return { markdown: "", plain: "", html: "" };
    let markdown = this.model.text.slice(from, to);
    let plain = markdown, html = "";
    const range = window.getSelection()?.rangeCount
      ? window.getSelection()!.getRangeAt(0)
      : null;
    if (range) {
      const markers = (node: Node, position: number, opening: boolean) => {
        const result: string[] = [];
        let element =
          node.nodeType === Node.ELEMENT_NODE
            ? (node as HTMLElement)
            : node.parentElement;
        while (element && element !== this.root) {
          if (
            element.matches(
              '.md-inline[data-mark="strong"],.md-inline[data-mark="em"],.md-inline[data-mark="s"],.md-inline[data-mark="code"]',
            )
          ) {
            const leaf = this.leaves.get(
                element.closest<HTMLElement>("[data-leaf]")!.dataset.leaf!,
              )!,
              before = element.firstElementChild?.textContent || "",
              after = element.lastElementChild?.textContent || "";
            const start =
                leaf.positions[Number(element.dataset.inlineFrom)] +
                before.length,
              end =
                leaf.positions[Number(element.dataset.inlineTo)] - after.length;
            if (
              opening
                ? position >= start && position < end
                : position > start && position <= end
            )
              result.push(opening ? before : after);
          }
          element = element.parentElement;
        }
        return opening ? result.reverse().join("") : result.join("");
      };
      markdown =
        markers(range.startContainer, from, true) +
        markdown +
        markers(range.endContainer, to, false);
      const container = document.createElement("div");
      container.append(range.cloneContents());
      container
        .querySelectorAll(".md-meta,.md-object-source,.md-ui")
        .forEach((e) => e.remove());
      const plainCopy = container.cloneNode(true) as HTMLElement;
      plainCopy.querySelectorAll("td,th").forEach(cell => cell.append("\t"));
      plainCopy.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,tr,br").forEach(block => block.append("\n"));
      plain = plainCopy.textContent?.replace(/\t\n/g, "\n").trimEnd() || this.model.text.slice(from, to);
      let ancestor =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? (range.commonAncestorContainer as HTMLElement)
          : range.commonAncestorContainer.parentElement;
      while (ancestor && ancestor !== this.root) {
        if (["STRONG", "EM", "S", "CODE"].includes(ancestor.tagName)) {
          const wrapper = document.createElement(
            ancestor.tagName.toLowerCase(),
          );
          wrapper.append(...container.childNodes);
          container.append(wrapper);
        }
        ancestor = ancestor.parentElement;
      }
      html = container.innerHTML;
    }
    return { markdown, plain, html };
  }
  private copy = (event: ClipboardEvent) => {
    if ((event.target as HTMLElement).closest(".cm-editor") || !event.clipboardData || window.getSelection()?.isCollapsed) return;
    event.preventDefault();
    const copied = this.clipboard();
    event.clipboardData.setData("text/plain", copied.plain);
    event.clipboardData.setData("text/html", copied.html);
    event.clipboardData.setData("text/x-open-typora-markdown", copied.markdown);
  };
  private cut = (event: ClipboardEvent) => {
    if ((event.target as HTMLElement).closest(".cm-editor")) return;
    this.copy(event);
    if (!event.defaultPrevented) return;
    const selection = this.bookmark();
    this.model.selection = selection;
    if (
      this.model.replace(
        Math.min(selection.anchor, selection.head),
        Math.max(selection.anchor, selection.head),
        "",
        "cut",
      )
    )
      this.publish();
  };
  private drop = (event: DragEvent) => {
    const droppedPath = event.dataTransfer?.getData("application/x-open-typora-file");
    if (droppedPath) { event.preventDefault(); const name = droppedPath.split("/").at(-1) || "文档"; this.insert(`[${name.replace(/[\[\]]/g, "")}](${encodeURI(droppedPath).replace(/[()]/g, c => "%" + c.charCodeAt(0).toString(16))})`, "drop"); return; }
    const images = [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith("image/"));
    if (images.length) {
      event.preventDefault();
      this.model.selection = this.bookmark();
      for (const image of images) this.callbacks.image(image);
    }
  };
  private click = (event: MouseEvent) => {
    const target = event.target as HTMLElement,
      box = target.closest<HTMLInputElement>("input[data-task]");
    if (box) {
      event.preventDefault();
      const from = Number(box.dataset.task);
      if (
        this.model.replace(
          from,
          from + 1,
          this.model.text[from].toLowerCase() === "x" ? " " : "x",
          "checkbox",
        )
      )
        this.publish(false);
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a");
    if (link) {
      event.preventDefault();
      const address = link.getAttribute("href") || "";
      if (link.dataset.headingLine) this.jump(Number(link.dataset.headingLine));
      else if (link.dataset.footnote) {
        const definition = (this.model.environment.footnoteDefinitions as Record<string, { line: number }>)?.[link.dataset.footnote];
        if (definition) this.jump(definition.line);
      } else if (event.metaKey || event.ctrlKey) {
        if (address.startsWith("#")) {
          const id = decodeURIComponent(address.slice(1)), heading = (this.model.environment.headings as { id: string; line: number }[])?.find(item => item.id === id);
          if (heading) this.jump(heading.line);
        } else this.callbacks.link(address);
      }
    }
    const fence = target.closest<HTMLElement>("[data-fence]");
    if (fence && !target.closest(".cm-editor")) this.activateFence(fence);
    const object = target.closest<HTMLElement>('.md-inline[data-mark="math"],.md-inline[data-mark="sub"],.md-inline[data-mark="sup"],.md-inline[data-mark="emoji"],.md-inline[data-mark="image"]');
    if (object && target.closest(".md-view")) { const leaf = this.leaves.get(object.closest<HTMLElement>("[data-leaf]")!.dataset.leaf!)!; const at = leaf.positions[Number(object.dataset.inlineFrom)] + (object.dataset.mark === "image" ? 2 : 1); this.model.selection = { anchor: at, head: at }; this.restore(); }
  };
  private updateEmoji() {
    const selection = this.model.selection, match = /(?:^|[\s(]):([a-zA-Z0-9_+-]{1,30})$/.exec(this.model.text.slice(0, selection.head));
    const node = this.model.nodeAt(selection.head);
    if (!this.emojiEnabled || this.composing || this.fence || selection.anchor !== selection.head || !match || ["fence", "frontmatter", "html_preview", "html_block"].includes(node?.kind || "") || !this.root.contains(window.getSelection()?.anchorNode || null) || this.emojiDismissed === `${selection.head}:${match[1]}`) { this.emojiPopup.hidden = true; return; }
    const names = Object.keys(emojiNames).filter(name => name.startsWith(match[1].toLowerCase())).slice(0, 10);
    if (!names.length) { this.emojiPopup.hidden = true; return; }
    if (names.join() !== this.emojiOptions.join()) this.emojiIndex = 0;
    this.emojiOptions = names; this.emojiFrom = selection.head - match[1].length - 1;
    this.emojiPopup.replaceChildren(...names.map((name, index) => { const button = document.createElement("button"); button.role = "option"; button.setAttribute("aria-selected", String(index === this.emojiIndex)); button.textContent = `${emojiNames[name]}  :${name}:`; button.addEventListener("click", () => this.chooseEmoji(index)); return button; }));
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null, rect = range && typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect() : this.root.getBoundingClientRect();
    this.emojiPopup.style.left = `${Math.min(window.innerWidth - 245, Math.max(12, rect.left))}px`; this.emojiPopup.style.top = `${Math.min(window.innerHeight - 300, rect.bottom + 6)}px`; this.emojiPopup.hidden = false;
  }
  private chooseEmoji(index: number) {
    const name = this.emojiOptions[index]; if (!name) return;
    this.emojiPopup.hidden = true; this.model.closeGroup();
    if (this.model.replace(this.emojiFrom, this.model.selection.head, `:${name}:`, "emoji")) this.publish();
  }
  private keydown = (event: KeyboardEvent) => {
    if (
      this.composing ||
      event.isComposing ||
      (event.target as HTMLElement).closest(".cm-editor")
    )
      return;
    if (!this.emojiPopup.hidden && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      if (event.key === "Escape") { this.emojiDismissed = `${this.model.selection.head}:${this.model.text.slice(this.emojiFrom + 1, this.model.selection.head)}`; this.emojiPopup.hidden = true; }
      else if (event.key === "Enter" || event.key === "Tab") this.chooseEmoji(this.emojiIndex);
      else { this.emojiIndex = (this.emojiIndex + (event.key === "ArrowDown" ? 1 : -1) + this.emojiOptions.length) % this.emojiOptions.length; this.updateEmoji(); }
      return;
    }
    if (event.key === "z" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.shiftKey ? this.redo() : this.undo();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey &&
        window.getSelection()?.anchorNode?.parentElement?.closest("td,th")) {
      event.preventDefault();
      this.tableAction("row");
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      this.tab(event.shiftKey);
    }
  };
  insert(text: string, kind = "command") {
    const selection = this.bookmark();
    this.model.selection = selection;
    if (
      this.model.replace(
        Math.min(selection.anchor, selection.head),
        Math.max(selection.anchor, selection.head),
        text,
        kind,
      )
    )
      this.publish();
  }
  enter(soft: boolean) {
    const selection = this.bookmark();
    this.model.selection = selection;
    const from = Math.min(selection.anchor, selection.head),
      to = Math.max(selection.anchor, selection.head);
    const table = window
      .getSelection()
      ?.anchorNode?.parentElement?.closest("td,th");
    if (table) {
      if (soft) this.insert("<br>", "structure");
      else this.tableNext(false, true);
      return;
    }
    const node = this.model.nodeAt(from),
      lineStart = this.model.text.lastIndexOf("\n", from - 1) + 1;
    const line = this.model.text.slice(
      lineStart,
      this.model.text.indexOf("\n", lineStart) < 0
        ? undefined
        : this.model.text.indexOf("\n", lineStart),
    );
    const opening = /^(\s*(?:>\s*)*(?:(?:[-+*]|\d+[.)])\s+)?)(`{3,}|~{3,})[^\n]*$/.exec(line);
    if (!soft && from === to && from === lineStart + line.length && node?.kind !== "frontmatter") {
      if (opening) { const prefix = opening[1].replace(/(?:[-+*]|\d+[.)])\s+$/, marker => " ".repeat(marker.length)), at = from + 1 + prefix.length; if (this.model.replace(from, to, `\n${prefix}\n${prefix}${opening[2]}`, "structure", { anchor: at, head: at })) this.publish(); return; }
      if (line.trim() === "$$") { const at = lineStart + 3; if (this.model.replace(lineStart, to, "$$\n\n$$", "structure", { anchor: at, head: at })) this.publish(); return; }
    }
    const list = /^(\s*(?:>\s*)*)([-+*]|\d+[.)])\s+(\[[ xX]\]\s+)?/.exec(line);
    let insert =
      soft || node?.kind === "fence" || node?.kind === "frontmatter"
        ? "\n"
        : "\n\n";
    if (!soft && list) {
      if (!line.slice(list[0].length).trim()) {
        if (this.model.replace(lineStart, to, "\n", "structure"))
          this.publish();
        return;
      }
      const marker = /^\d/.test(list[2])
        ? `${parseInt(list[2]) + 1}${list[2].at(-1)}`
        : list[2];
      insert = `\n${list[1]}${marker} ${list[3] ? "[ ] " : ""}`;
    } else if (!soft && /^\s*>/.test(line)) {
      const prefix = /^\s*(?:>\s*)+/.exec(line)![0];
      if (!line.slice(prefix.length).trim()) { if (this.model.replace(lineStart, to, prefix.replace(/>\s*$/, ""), "structure")) this.publish(); return; }
      insert = "\n" + prefix;
    }
    if (!soft && from === to) {
      const formats: { open: string; close: string }[] = [];
      let element = window.getSelection()?.anchorNode?.parentElement;
      while (element && element !== this.root) {
        if (
          element.matches(
            '.md-inline[data-mark="strong"],.md-inline[data-mark="em"],.md-inline[data-mark="s"]',
          )
        ) {
          const leaf = this.leaves.get(
              element.closest<HTMLElement>("[data-leaf]")!.dataset.leaf!,
            )!,
            open = element.firstElementChild?.textContent || "",
            close = element.lastElementChild?.textContent || "";
          const start =
              leaf.positions[Number(element.dataset.inlineFrom)] + open.length,
            end =
              leaf.positions[Number(element.dataset.inlineTo)] - close.length;
          if (from > start && from < end) formats.push({ open, close });
        }
        element = element.parentElement || undefined;
      }
      insert =
        formats.map((f) => f.close).join("") +
        insert +
        formats
          .toReversed()
          .map((f) => f.open)
          .join("");
    }
    if (this.model.replace(from, to, insert, "structure")) this.publish();
  }
  private tab(back: boolean) {
    if (window.getSelection()?.anchorNode?.parentElement?.closest("td,th")) {
      this.tableNext(back);
      return;
    }
    const selection = this.bookmark(), from = Math.min(selection.anchor, selection.head), to = Math.max(selection.anchor, selection.head),
      start = this.model.text.lastIndexOf("\n", from - 1) + 1;
    if (back || this.model.text.slice(from, to).includes("\n") || /^[ \t]*(?:>[ \t]*)*(?:[-+*]|\d+[.)])[ \t]/.test(this.model.text.slice(start))) {
      this.model.selection = selection;
      if (applyBlockCommand(this.model, back ? "outdent" : "indent", {}, this.tabSize)) this.publish();
    } else this.insert("\t");
  }
  private tableNext(back: boolean, nextRow = false) {
    const cell = window
        .getSelection()
        ?.anchorNode?.parentElement?.closest("td,th"),
      table = cell?.closest("table");
    if (!cell || !table) return;
    const cells = [...table.querySelectorAll("td,th")],
      index = cells.indexOf(cell),
      width = table.rows[0]?.cells.length || 1;
    let next = index + (back ? -1 : nextRow ? width : 1);
    if (next >= cells.length) {
      this.tableAction("row");
      const updated = this.root.querySelector(
        `table[data-cid="${table.dataset.cid}"]`,
      );
      const target =
        updated?.querySelectorAll("td,th")[
          Math.min(next, cells.length + width - 1)
        ];
      if (target) this.selectCell(target);
      return;
    }
    if (next >= 0) this.selectCell(cells[next]);
  }
  private selectCell(cell: Element) {
    const leaf = cell.querySelector<HTMLElement>("[data-leaf]");
    const info = leaf && this.leaves.get(leaf.dataset.leaf!);
    if (info) {
      this.model.selection = {
        anchor: info.positions[0],
        head: info.positions[0],
      };
      this.restore();
    }
  }
  tableAction(action: string) {
    const selection = this.bookmark();
    const node = this.model.nodeAt(selection.head);
    if (!node || node.kind !== "table_open") return;
    const lines = node.source.split("\n"),
      rows = lines.map((line) => tableRowCells(line).map((cell) => cell.raw));
    const currentCell = window
        .getSelection()
        ?.anchorNode?.parentElement?.closest<HTMLTableCellElement>("td,th"),
      row = currentCell?.parentElement as HTMLTableRowElement | null;
    let local = selection.head - node.from, sourceRow = 0;
    while (sourceRow < lines.length - 1 && local > lines[sourceRow].length) { local -= lines[sourceRow].length + 1; sourceRow++; }
    if (sourceRow === 1) sourceRow = 0;
    let column = currentCell && this.root.querySelector(`[data-cid="${node.id}"]`)?.contains(currentCell) ? currentCell.cellIndex : Math.max(0, tableRowCells(lines[sourceRow]).findIndex(cell => local >= cell.start && local <= cell.end));
    let targetRow = sourceRow, targetColumn = column;
    const oldCell = tableRowCells(lines[sourceRow])[column];
    const oldStart =
      node.from +
      lines.slice(0, sourceRow).reduce((n, line) => n + line.length + 1, 0) +
      (oldCell?.start || 0);
    if (action === "deleteTable" || (action === "removeColumn" && rows[0].length === 1)) {
      this.model.selection = selection;
      if (this.model.replace(node.from, node.to, "", "table", { anchor: node.from, head: node.from })) this.publish();
      return;
    }
    if (action === "row" || action === "rowBefore") {
      const at = Math.max(2, sourceRow + (action === "row" ? 1 : 0));
      rows.splice(
        at,
        0,
        rows[0].map(() => ""),
      );
      targetRow = at;
    }
    else if (action === "removeRow" && sourceRow > 1 && rows.length > 2)
      rows.splice(sourceRow, 1);
    else if (action === "column" || action === "columnBefore") {
      const at = column + (action === "column" ? 1 : 0);
      rows.forEach((cells, i) =>
        cells.splice(at, 0, i === 1 ? "---" : ""),
      );
      targetColumn = at;
    }
    else if (action === "removeColumn" && rows[0].length > 1)
      rows.forEach((cells) => cells.splice(column, 1));
    else if (["left", "center", "right"].includes(action))
      rows[1][column] =
        action === "left" ? ":---" : action === "right" ? "---:" : ":---:";
    else if (["moveRowUp", "moveRowDown"].includes(action)) {
      const other = sourceRow + (action === "moveRowUp" ? -1 : 1);
      if (sourceRow < 2 || other < 2 || other >= rows.length) return;
      [rows[sourceRow], rows[other]] = [rows[other], rows[sourceRow]]; targetRow = other;
    } else if (["moveColumnLeft", "moveColumnRight"].includes(action)) {
      const other = column + (action === "moveColumnLeft" ? -1 : 1);
      if (other < 0 || other >= rows[0].length) return;
      for (const cells of rows) [cells[column], cells[other]] = [cells[other], cells[column]];
      targetColumn = other;
    } else if (action === "format") { /* Normalize the table in the same transaction. */ }
    else return;
    const output = rows.map((cells) => `| ${cells.join(" | ")} |`);
    targetRow = Math.min(targetRow, rows.length - 1);
    targetColumn = Math.min(targetColumn, rows[0].length - 1);
    const cell = tableRowCells(output[targetRow])[targetColumn];
    const start =
      node.from +
      output.slice(0, targetRow).reduce((n, line) => n + line.length + 1, 0) +
      cell.start;
    const nextSelection = {
      anchor:
        start +
        Math.max(0, Math.min(cell.raw.length, selection.anchor - oldStart)),
      head:
        start +
        Math.max(0, Math.min(cell.raw.length, selection.head - oldStart)),
    };
    this.model.selection = selection;
    if (
      this.model.replace(
        node.from,
        node.to,
        output.join("\n"),
        "table",
        nextSelection,
      )
    )
      this.publish();
  }
  wrap(before: string, after = "") {
    if (this.fence?.view.hasFocus) return;
    this.model.selection = this.bookmark();
    let from = Math.min(this.model.selection.anchor, this.model.selection.head),
      to = Math.max(this.model.selection.anchor, this.model.selection.head);
    const selectedLeaves = [...this.leaves.values()].filter(leaf => !leaf.kind && leaf.positions[0] < to && leaf.positions.at(-1)! > from);
    if (from !== to && selectedLeaves.length > 1) {
      const edits = selectedLeaves.map(leaf => ({ from: Math.max(from, leaf.positions[0]), to: Math.min(to, leaf.positions.at(-1)!) })).filter(edit => edit.from < edit.to).sort((a,b) => a.from - b.from);
      let text = this.model.text;
      for (const edit of edits.toReversed()) text = text.slice(0, edit.from) + before + text.slice(edit.from, edit.to) + after + text.slice(edit.to);
      const mapped = (position: number) => {
        let delta = 0;
        for (const edit of edits) {
          if (position < edit.from) break;
          if (position <= edit.to) return position + delta + before.length;
          delta += before.length + after.length;
        }
        return position + delta;
      };
      const selection = this.model.selection;
      if (this.model.replace(0, this.model.text.length, text, "format", { anchor: mapped(selection.anchor), head: mapped(selection.head) })) this.publish();
      return;
    }
    const mark = ({ "**": "strong", "*": "em", "~~": "s", "==": "mark", "`": "code", "<u>": "u", "~": "sub", "^": "sup" } as Record<string, string>)[before] || "";
    const inline = window
      .getSelection()
      ?.anchorNode?.parentElement?.closest<HTMLElement>(
        mark ? `.md-inline[data-mark="${mark}"]` : ".md-inline",
      );
    if (
      inline &&
      mark && inline.dataset.mark === mark
    ) {
      const leafElement = inline.closest<HTMLElement>("[data-leaf]")!,
        leaf = this.leaves.get(leafElement.dataset.leaf!)!;
      const start = leaf.positions[Number(inline.dataset.inlineFrom)],
        end = leaf.positions[Number(inline.dataset.inlineTo)];
      const open = inline.firstElementChild?.classList.contains("md-meta") ? inline.firstElementChild.textContent || before : before;
      const close = inline.lastElementChild?.classList.contains("md-meta") ? inline.lastElementChild.textContent || after : after;
      this.model.replace(
        start,
        end,
        this.model.text.slice(start + open.length, end - close.length),
        "format",
        {
          anchor: Math.max(start, from - open.length),
          head: Math.max(start, to - open.length),
        },
      );
      this.publish();
      return;
    }
    if (from === to) {
      if (this.pendingFormat.has(before)) this.pendingFormat.delete(before); else this.pendingFormat.set(before, after);
      this.restore(); return;
    }
    const text = this.model.text.slice(from, to);
    if (before === "`" && text.includes("`")) {
      const size = Math.max(...[...text.matchAll(/`+/g)].map(match => match[0].length)) + 1;
      before = after = "`".repeat(size);
    }
    if (
      this.model.replace(from, to, before + text + after, "format", {
        anchor: from + before.length,
        head: to + before.length,
      })
    )
      this.publish();
  }
  command(action: string, args: BlockArguments = {}) {
    if (this.composing) return;
    this.model.selection = this.bookmark();
    this.pendingFormat.clear();
    if (action.startsWith("table-")) { this.tableAction(action.slice(6)); return; }
    if (applyBlockCommand(this.model, action, args, this.tabSize)) this.publish();
  }
  clearFormat() {
    if (this.composing || this.fence?.view.hasFocus) return;
    const selection = this.bookmark();
    let from = Math.min(selection.anchor, selection.head), to = Math.max(selection.anchor, selection.head);
    if (from === to) { const leaf = [...this.leaves.values()].find(item => !item.kind && item.positions[0] <= from && item.positions.at(-1)! >= from); if (!leaf) return; from = leaf.positions[0]; to = leaf.positions.at(-1)!; }
    const formats: InlineFormat[] = [];
    for (const leaf of this.leaves.values()) {
      if (leaf.kind || leaf.positions[0] > to || leaf.positions.at(-1)! < from) continue;
      const element = this.root.querySelector(`[data-leaf="${leaf.id}"]`);
      for (const inline of element?.querySelectorAll<HTMLElement>(".md-inline") || []) {
        const first = inline.firstElementChild, last = inline.lastElementChild;
        let open = first?.classList.contains("md-meta") ? first.textContent || "" : "", close = last?.classList.contains("md-meta") ? last.textContent || "" : "";
        if (["sub", "sup"].includes(inline.dataset.mark || "")) open = close = inline.dataset.mark === "sub" ? "~" : "^";
        if (!open || !close) continue;
        formats.push({ from: leaf.positions[Number(inline.dataset.inlineFrom)], to: leaf.positions[Number(inline.dataset.inlineTo)], open, close });
      }
    }
    const next = clearInlineFormats(this.model.text, from, to, formats);
    this.model.closeGroup();
    if (this.model.replace(0, this.model.text.length, next.text, "clear-format", { anchor: next.from, head: next.to })) this.publish();
  }
  pasteTable(grid: string[][], cell: HTMLTableCellElement) {
    if (!grid.length || grid.length > 100 || grid.some(row => row.length > 30)) return false;
    const element = cell.closest<HTMLElement>("[data-cid]"), node = this.model.nodes.find(node => node.id === element?.dataset.cid);
    if (!node || node.kind !== "table_open") return false;
    const lines = node.source.split("\n"), rows = lines.map(line => tableRowCells(line).map(cell => cell.raw));
    let row = (cell.parentElement as HTMLTableRowElement).rowIndex; if (row > 0) row++;
    const column = cell.cellIndex, width = Math.max(rows[0].length, column + Math.max(...grid.map(row => row.length)));
    if (width > 30 || row + grid.length > 102) return false;
    while (rows.length < row + grid.length + (row === 0 ? 1 : 0)) rows.push(Array(width).fill(""));
    for (const [i, cells] of rows.entries()) while (cells.length < width) cells.push(i === 1 ? "---" : "");
    for (let i = 0; i < grid.length; i++) { const at = row + i + (row === 0 && i > 0 ? 1 : 0); if (!rows[at]) rows[at] = Array(width).fill(""); for (let j = 0; j < grid[i].length; j++) rows[at][column + j] = grid[i][j].replace(/(?<!\\)\|/g, "\\|").replace(/\r?\n/g, "<br>"); }
    const output = rows.map(cells => `| ${cells.join(" | ")} |`).join("\n");
    this.model.closeGroup();
    if (this.model.replace(node.from, node.to, output, "table-paste")) this.publish();
    return true;
  }
  codeBlock() {
    if (this.fence?.view.hasFocus) return;
    const selection = this.bookmark(); this.model.selection = selection;
    let from = Math.min(selection.anchor, selection.head), to = Math.max(selection.anchor, selection.head);
    const node = this.model.nodeAt(from);
    if (from === to && node && ["paragraph_open", "empty"].includes(node.kind)) { from = node.from; to = node.to; }
    const raw = this.model.text.slice(from, to), width = Math.max(3, ...[...raw.matchAll(/`+/g)].map(match => match[0].length + 1)), marker = "`".repeat(width), at = from + width + 1 + Math.max(0, Math.min(raw.length, selection.head - from));
    if (this.model.replace(from, to, `${marker}\n${raw}\n${marker}`, "block-format", { anchor: at, head: at })) this.publish();
  }
  undo() {
    this.releaseFence();
    if (this.model.undo()) this.publish();
  }
  redo() {
    this.releaseFence();
    if (this.model.redo()) this.publish();
  }
  select(selection: SelectionBookmark, focus = true) {
    this.releaseFence();
    this.model.selection = selection;
    this.model.closeGroup();
    this.model.refreshCaret();
    this.render(false);
    const node = this.model.nodeAt(selection.head),
      element = this.root.querySelector<HTMLElement>(
        `[data-cid="${node?.id}"]`,
      );
    if (focus && element?.hasAttribute("data-fence")) {
      this.activateFence(element);
      const fence = this.fence;
      if (fence) {
        const start = fence.leaf.positions[0],
          length = fence.view.state.doc.length;
        fence.view.dispatch({
          selection: {
            anchor: Math.max(0, Math.min(length, selection.anchor - start)),
            head: Math.max(0, Math.min(length, selection.head - start)),
          },
        });
      }
    } else this.restore(selection, focus);
    element?.scrollIntoView({ block: "nearest" });
    this.reportCursor();
  }
  jump(line: number) {
    this.releaseFence();
    const from = this.model.text
      .split("\n")
      .slice(0, Math.max(0, line - 1))
      .reduce((n, l) => n + l.length + 1, 0);
    this.model.selection = {
      anchor: Math.min(from, this.model.text.length),
      head: Math.min(from, this.model.text.length),
    };
    this.restore();
    const node = this.model.nodeAt(from);
    this.root
      .querySelector(`[data-cid="${node?.id}"]`)
      ?.scrollIntoView({ block: "start" });
  }
  releaseFence() {
    if (!this.fence) return;
    const id = this.fence.id;
    this.fence.view.destroy();
    this.fence = null;
    this.html.delete(id);
    this.render(false);
  }
  private activateFence(element: HTMLElement) {
    if (this.fence && this.fence.leaf.id === element.dataset.fence) return;
    const key = element.dataset.fence!;
    this.releaseFence();
    element =
      this.root.querySelector<HTMLElement>(`[data-fence="${key}"]`) || element;
    const leaf = this.leaves.get(element.dataset.fence!)!,
      body = element.querySelector<HTMLElement>(".fence-body")!;
    if (!leaf || !body) return;
    body.replaceChildren();
    element.classList.add("fence-editing");
    const view = new EditorView({
      parent: body,
      state: EditorState.create({
        doc: leaf.raw,
        selection: {
          anchor: Math.max(0, leaf.positions.findLastIndex(position => position <= this.model.selection.anchor)),
          head: Math.max(0, leaf.positions.findLastIndex(position => position <= this.model.selection.head)),
        },
        extensions: [
          this.fenceBehavior.of(this.fenceOptions()),
          fenceLanguage(
            element.classList.contains("md-math")
              ? "math"
              : element.querySelector(".fence-language")?.textContent || "",
          ),
          drawSelection(),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: "Mod-z",
              run: () => {
                this.undo();
                return true;
              },
            },
            {
              key: "Mod-Shift-z",
              run: () => {
                this.redo();
                return true;
              },
            },
            {
              key: "Tab",
              run: (cm) => {
                if (!cm.state.selection.main.empty) return indentMore(cm);
                cm.dispatch(cm.state.replaceSelection(" ".repeat(this.tabSize)));
                return true;
              },
            },
            { key: "Shift-Tab", run: indentLess },
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const current = this.model.nodes.find((n) => n.id === leaf.nodeId);
            if (!current) return;
            const range = fenceRange(current),
              body =
                leaf.fenceLine !== undefined
                  ? codeBody(current, leaf.fenceLine)
                  : undefined,
              start = current.from + (body?.from ?? range.start),
              end = current.from + (body?.to ?? range.end);
            let text = update.state.doc.toString();
            if (
              (body ? body.closed : range.closingOnNewLine) &&
              text &&
              !text.endsWith("\n")
            )
              text += "\n";
            const oldPoint = (position: number) =>
              body
                ? codePosition(start, body.raw, body.prefix, position)
                : start + position;
            const newPoint = (position: number) =>
              body
                ? codePosition(start, text, body.prefix, position)
                : start + position;
            this.model.selection = {
              anchor: oldPoint(update.startState.selection.main.anchor),
              head: oldPoint(update.startState.selection.main.head),
            };
            this.model.replace(
              start,
              end,
              body ? encodeCodeBody(text, body.prefix) : text,
              update.transactions.some(transaction => transaction.isUserEvent("input.type.compose")) ? "composition" : "typing",
              {
                anchor: newPoint(update.state.selection.main.anchor),
                head: newPoint(update.state.selection.main.head),
              },
            );
            this.callbacks.change();
            this.reportCursor();
          }),
        ],
      }),
    });
    this.fence = { id: leaf.nodeId, leaf, view };
    view.focus();
    view.dom.addEventListener("focusout", (event) => {
      if (
        !view.dom.contains((event as FocusEvent).relatedTarget as Node | null)
      )
        queueMicrotask(() => {
          if (this.fence?.view === view && !view.hasFocus) this.releaseFence();
        });
    });
  }
}
function previousGrapheme(text: string, position: number) {
  const segments = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      text.slice(0, position),
    ),
  ];
  return segments.at(-1)?.index || 0;
}
function nextGrapheme(text: string, position: number) {
  const segment = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    .segment(text.slice(position))
    [Symbol.iterator]()
    .next().value;
  return position + (segment?.segment.length || 0);
}
