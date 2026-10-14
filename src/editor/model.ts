import { parseBlocks } from "./markdown.ts";
export interface SelectionBookmark {
  anchor: number;
  head: number;
}
export interface DocumentNode {
  id: string;
  from: number;
  to: number;
  source: string;
  kind: string;
  line: number;
}
export interface DocumentRoot {
  children: DocumentNode[];
}
interface Snapshot {
  text: string;
  selection: SelectionBookmark;
}
interface Command {
  before: Snapshot;
  after: Snapshot;
  kind: string;
  time: number;
}
let sequence = 0;
export class MarkdownDocument {
  text: string;
  nodes: DocumentNode[] = [];
  root: DocumentRoot = { children: [] };
  environment: Record<string, unknown> = {};
  selection: SelectionBookmark;
  private original: string;
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private group = false;
  private sourceSession: {
    entry: Snapshot;
    undo: Command[];
    redo: Command[];
  } | null = null;
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  beginSourceSession() {
    if (this.sourceSession) return;
    this.closeGroup();
    this.sourceSession = {
      entry: { text: this.text, selection: { ...this.selection } },
      undo: this.undoStack,
      redo: this.redoStack,
    };
    this.undoStack = [];
    this.redoStack = [];
  }
  endSourceSession() {
    const session = this.sourceSession;
    if (!session) return;
    const after = { text: this.text, selection: { ...this.selection } };
    this.undoStack = session.undo;
    this.redoStack = session.redo;
    this.text = session.entry.text;
    this.selection = session.entry.selection;
    this.sourceSession = null;
    this.closeGroup();
    this.replace(
      0,
      this.text.length,
      after.text,
      "source-session",
      after.selection,
    );
    this.closeGroup();
  }
  lineEnding: string;
  constructor(source: string, lineEnding = "\n") {
    this.lineEnding = lineEnding;
    this.original = source;
    this.text = source.replace(/\r\n/g, "\n");
    this.selection = { anchor: this.text.length, head: this.text.length };
    this.parse();
  }
  serialize() {
    return this.root.children.map((node) => node.source).join("");
  }
  toMarkdown() {
    const source = this.serialize();
    return source === this.original.replace(/\r\n/g, "\n")
      ? this.original
      : source.replace(/\n/g, this.lineEnding);
  }
  private parse() {
    const old = this.nodes;
    if (this.text.length > 300_000) {
      this.nodes = [];
      this.root.children = [
        {
          id: "raw-source",
          from: 0,
          to: this.text.length,
          source: this.text,
          kind: "source",
          line: 1,
        },
      ];
      return;
    }
    const offsets = [0];
    for (let i = 0; i < this.text.length; i++)
      if (this.text[i] === "\n") offsets.push(i + 1);
    const used = new Set<string>();
    this.environment = {};
    this.nodes = parseBlocks(this.text, this.environment).map(
      (block, index) => {
        const from = offsets[block.fromLine - 1],
          to = (offsets[block.toLine] ?? this.text.length + 1) - 1;
        const same =
          old.find(
            (node) =>
              !used.has(node.id) &&
              node.source === block.source &&
              node.kind === block.kind,
          ) ||
          (old[index]?.kind === block.kind && !used.has(old[index].id)
            ? old[index]
            : undefined);
        const id = same?.id || `node-${++sequence}`;
        used.add(id);
        return {
          id,
          from,
          to,
          source: block.source,
          kind: block.kind,
          line: block.fromLine,
        };
      },
    );
    const caret = this.selection.head;
    if (
      caret < this.text.length &&
      !this.nodes.some((node) => caret >= node.from && caret <= node.to)
    ) {
      this.nodes.push({
        id: `gap-${caret}`,
        from: caret,
        to: caret,
        source: "",
        kind: "empty",
        line: this.text.slice(0, caret).split("\n").length,
      });
      this.nodes.sort((a, b) => a.from - b.from);
    }
    if (!this.nodes.length || /\n$/.test(this.text))
      this.nodes.push({
        id: old.find((n) => n.kind === "empty")?.id || `node-${++sequence}`,
        from: this.text.length,
        to: this.text.length,
        source: "",
        kind: "empty",
        line: offsets.length,
      });
    const children: DocumentNode[] = [];
    let end = 0;
    for (const node of this.nodes) {
      if (node.from > end)
        children.push({
          id: `source-gap-${end}`,
          from: end,
          to: node.from,
          source: this.text.slice(end, node.from),
          kind: "separator",
          line: 0,
        });
      children.push(node);
      end = node.to;
    }
    if (end < this.text.length)
      children.push({
        id: `source-gap-${end}`,
        from: end,
        to: this.text.length,
        source: this.text.slice(end),
        kind: "separator",
        line: 0,
      });
    this.root = { children };
  }
  closeGroup() {
    this.group = false;
  }
  refreshCaret() {
    this.parse();
  }
  replace(
    from: number,
    to: number,
    insert: string,
    kind = "command",
    selection?: SelectionBookmark,
  ) {
    from = Math.max(0, Math.min(from, this.text.length));
    to = Math.max(from, Math.min(to, this.text.length));
    insert = insert.replace(/\r\n/g, "\n");
    const before = { text: this.text, selection: { ...this.selection } };
    this.text = this.text.slice(0, from) + insert + this.text.slice(to);
    this.selection = selection || {
      anchor: from + insert.length,
      head: from + insert.length,
    };
    if (before.text === this.text) return false;
    const now = Date.now(),
      previous = this.undoStack.at(-1);
    const after = { text: this.text, selection: { ...this.selection } };
    if (
      this.group &&
      ["typing", "composition"].includes(kind) &&
      previous?.kind === kind &&
      (kind === "composition" || now - previous.time < 800) &&
      previous.after.selection.head === before.selection.head &&
      before.selection.anchor === before.selection.head
    ) {
      previous.after = after;
      previous.time = now;
    } else {
      this.undoStack.push({ before, after, kind, time: now });
      if (this.undoStack.length > 100) this.undoStack.shift();
    }
    while (
      this.undoStack.length > 1 &&
      this.undoStack.reduce(
        (bytes, command) =>
          bytes + 2 * (command.before.text.length + command.after.text.length),
        0,
      ) >
        16 * 1024 * 1024
    )
      this.undoStack.shift();
    this.group = ["typing", "composition"].includes(kind);
    this.redoStack = [];
    this.parse();
    return true;
  }
  replaceExternal(
    source: string,
    lineEnding = source.includes("\r\n") ? "\r\n" : "\n",
  ) {
    this.sourceSession = null;
    this.lineEnding = lineEnding;
    this.original = source;
    this.text = source.replace(/\r\n/g, "\n");
    this.selection = {
      anchor: Math.min(this.selection.anchor, this.text.length),
      head: Math.min(this.selection.head, this.text.length),
    };
    this.undoStack = [];
    this.redoStack = [];
    this.group = false;
    this.parse();
  }
  undo() {
    const command = this.undoStack.pop();
    if (!command) return false;
    this.redoStack.push(command);
    this.text = command.before.text;
    this.selection = { ...command.before.selection };
    this.closeGroup();
    this.parse();
    return true;
  }
  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;
    this.undoStack.push(command);
    this.text = command.after.text;
    this.selection = { ...command.after.selection };
    this.closeGroup();
    this.parse();
    return true;
  }
  nodeAt(position: number) {
    return (
      this.nodes.find((n) => position >= n.from && position <= n.to) ||
      this.nodes.at(-1)
    );
  }
}
