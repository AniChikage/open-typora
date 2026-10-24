import { headingSlug } from "./markdownExtensions.ts";
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
  from: number;
  removed: string;
  inserted: string;
  before: SelectionBookmark;
  after: SelectionBookmark;
  kind: string;
  time: number;
}
let sequence = 0;
// Build strings from UTF-16 units so history never retains a source substring.
// Primitive structuredClone may return the original backing storage on newer V8.
function detachedSpan(value: string): string {
  if (!value.length) return "";
  const chunks: string[] = [];
  for (let from = 0; from < value.length; from += 8192) {
    const end = Math.min(value.length, from + 8192), units = new Uint16Array(end - from);
    for (let index = from; index < end; index++) units[index - from] = value.charCodeAt(index);
    chunks.push(String.fromCharCode(...units));
  }
  return chunks.length === 1 ? chunks[0] : chunks.join("");
}
export class MarkdownDocument {
  text: string;
  nodes: DocumentNode[] = [];
  root: DocumentRoot = { children: [] };
  environment: Record<string, unknown> = {};
  selection: SelectionBookmark;
  private original: string;
  private normalizedOriginal: string;
  private serializedText: string | null = null;
  private serializedMarkdown = "";
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private group = false;
  private compositionSession: { entry: Snapshot; undo: Command[]; redo: Command[]; nodes:DocumentNode[];environment:Record<string,unknown> } | null = null;
  beginComposition() {
    if (this.compositionSession) return;
    this.closeGroup();
    this.compositionSession = { entry: { text:this.text,selection:{...this.selection} }, undo:this.undoStack, redo:this.redoStack,nodes:this.nodes,environment:this.environment };
    this.undoStack=[]; this.redoStack=[];
  }
  endComposition() {
    const session=this.compositionSession; if (!session) return false;
    const after={text:this.text,selection:{...this.selection}};
    this.undoStack=session.undo; this.redoStack=session.redo;
    this.text=session.entry.text; this.selection=session.entry.selection; this.nodes=session.nodes;this.environment=session.environment; this.compositionSession=null;
    this.closeGroup();
    const changed=this.replace(0,this.text.length,after.text,"composition",after.selection);
    this.closeGroup(); return changed;
  }
  private sourceSession: {
    entry: Snapshot;
    nodes: DocumentNode[];
    environment: Record<string,unknown>;
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
      nodes:this.nodes,environment:this.environment,
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
    this.nodes=session.nodes;this.environment=session.environment;
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
    this.normalizedOriginal = this.text;
    this.selection = { anchor: this.text.length, head: this.text.length };
    this.parse();
  }
  serialize() {
    return this.root.children.map((node) => node.source).join("");
  }
  toMarkdown() {
    const source = this.text;
    if (source === this.normalizedOriginal) return this.original;
    if (source !== this.serializedText) {
      this.serializedText = source;
      this.serializedMarkdown = this.lineEnding === "\n" ? source : source.replace(/\n/g, this.lineEnding);
    }
    return this.serializedMarkdown;
  }
  private richParsing = false;
  enableRichParsing() {
    if (this.richParsing) return;
    this.richParsing = true;
    if (this.text.length > 300_000) this.parse();
  }
  private incremental(edit: {from:number;to:number;insert:string;removed:string}) {
    const old = this.nodes;
    if (!old.length || /(?:^|\n) {0,3}\[[^\]\n]+\]:/.test(edit.insert + "\n" + edit.removed)) return false;
    let first = 0, last = old.length - 1;
    // Find affected blocks without walking the document's text or inline tokens.
    while (first < last) { const middle = (first + last) >>> 1; if (old[middle].to < edit.from) first = middle + 1; else last = middle; }
    const begin = Math.max(0, first - 2);
    let finish = first;
    while (finish < old.length && old[finish].from <= edit.to) finish++;
    finish = Math.min(old.length, finish + 3);
    const delta = edit.insert.length - (edit.to - edit.from);
    const lineDelta = (edit.insert.match(/\n/g)?.length || 0) - (edit.removed.match(/\n/g)?.length || 0);
    const start = old[begin].from, startLine = old[begin].line;
    // Changes to a definition can affect reference resolution anywhere in the file.
    if (old.slice(begin, finish).some(node => /(?:^|\n) {0,3}\[[^\]\n]+\]:/.test(node.source))) return false;
    while (true) {
      const end = finish < old.length ? old[finish].from + delta : this.text.length;
      const source = this.text.slice(start, end), offsets = [0];
      for (let i=0;i<source.length;i++) if(source[i] === "\n") offsets.push(i+1);
      const oldSource=old.slice(begin,finish).map(node=>node.source).join("\n");
      const refs=(text:string)=>(text.match(/\[\^[^\]\n]+\](?!:)/g)||[]).join("\0");
      if(refs(source)!==refs(oldSource)||/(?:^|\n) {0,3}\[[^\]\n]+\]:/.test(source))return false;
      const env = {...this.environment, footnoteNumbers:{...(this.environment.footnoteNumbers as Record<string,number>||{})},fragment:true, lineOffset:startLine-1};
      const parsed = parseBlocks(source,env).map(block => ({
        id:"",from:start+offsets[block.fromLine-1],to:start+(offsets[block.toLine] ?? source.length+1)-1,
        source:block.source,kind:block.kind,line:startLine+block.fromLine-1,
      }));
      const tail = old.slice(begin,finish).filter(node=>node.kind!=="empty").slice(-2);
      const nextTail = parsed.slice(-tail.length);
      const stable = tail.length>0 && nextTail.length===tail.length && tail.every((node,index)=>node.source===nextTail[index].source && node.kind===nextTail[index].kind && node.to+delta===nextTail[index].to);
      if (!stable && finish < old.length) { finish = Math.min(old.length, finish + Math.max(8,finish-begin)); continue; }
      const candidates = new Map<string,DocumentNode[]>();
      for(const node of old.slice(begin,finish)) { const key=node.kind+"\0"+node.source;const entries=candidates.get(key)||[];entries.push(node);candidates.set(key,entries); }
      const previous=old.slice(begin,finish),used=new Set<string>();
      // Reserve exact identities first, then preserve the edited block's identity.
      // Local code editors keep this ID across every IME update and final commit.
      for(const node of parsed) {node.id=candidates.get(node.kind+"\0"+node.source)?.shift()?.id||"";if(node.id)used.add(node.id);}
      for(const [index,node] of parsed.entries())if(!node.id){let same=previous[index];if(!same||same.kind!==node.kind||used.has(same.id))same=previous.find(item=>item.kind===node.kind&&!used.has(item.id))!;node.id=same?.id||`node-${++sequence}`;used.add(node.id);}
      this.nodes = [...old.slice(0,begin),...parsed,...old.slice(finish).map(node=>({...node,from:node.from+delta,to:node.to+delta,line:node.line+lineDelta}))];
      if (finish===old.length && (!this.nodes.length || /\n$/.test(this.text))) this.nodes.push({id:`node-${++sequence}`,from:this.text.length,to:this.text.length,source:"",kind:"empty",line:startLine+offsets.length-1});
      // Existing headings keep their IDs; updated headings are supplied by the fragment parser.
      if (Array.isArray(this.environment.headings)) {
        const oldEndLine=finish<old.length?old[finish].line:Infinity;
        const before=(this.environment.headings as Array<{line:number}>).filter(item=>item.line<startLine);
        const after=(this.environment.headings as Array<{line:number}>).filter(item=>item.line>=oldEndLine).map(item=>({...item,line:item.line+lineDelta}));
        const headings=[...before,...((env as Record<string,unknown>).fragmentHeadings as Array<{line:number;text:string;id:string}>||[]).filter(item=>item.line>=startLine&&item.line<oldEndLine+lineDelta),...after] as Array<{line:number;text:string;id:string}>;
        const used=new Map<string,number>();
        this.environment={...this.environment,headings:headings.map(heading=>{const base=headingSlug(heading.text),count=used.get(base)||0;used.set(base,count+1);return {...heading,id:base+(count?`-${count}`:"")};})};
      }
      this.ensureCaretNode();this.rebuildRoot();
      return true;
    }
  }
  private ensureCaretNode() {
    const caret=this.selection.head;
    this.nodes=this.nodes.filter(node=>node.kind!=="empty"||node.from===this.text.length||node.from===caret);
    if(caret<this.text.length&&!this.nodes.some(node=>caret>=node.from&&caret<=node.to)) {
      this.nodes.push({id:`gap-${caret}`,from:caret,to:caret,source:"",kind:"empty",line:1+(this.text.slice(0,caret).match(/\n/g)?.length||0)});
      this.nodes.sort((a,b)=>a.from-b.from);
    }
  }
  private rebuildRoot() {
    const children: DocumentNode[] = []; let end=0;
    for(const node of this.nodes) {
      if(node.from>end) children.push({id:`source-gap-${end}`,from:end,to:node.from,source:this.text.slice(end,node.from),kind:"separator",line:0});
      children.push(node);end=node.to;
    }
    if(end<this.text.length) children.push({id:`source-gap-${end}`,from:end,to:this.text.length,source:this.text.slice(end),kind:"separator",line:0});
    this.root={children};
  }
  private parse(edit?: {from:number;to:number;insert:string;removed:string}) {
    const old = this.nodes;
    if (this.text.length > 300_000 && !this.richParsing) {
      this.environment = {};
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
    if (edit && this.richParsing && this.text.length > 300_000 && this.incremental(edit)) return;
    const offsets = [0];
    for (let i = 0; i < this.text.length; i++)
      if (this.text[i] === "\n") offsets.push(i + 1);
    const used = new Set<string>();
    // Exact matches are consumed in document order, including duplicate paragraphs.
    const candidates = new Map<string, Map<string, DocumentNode[]>>();
    for (let i = old.length - 1; i >= 0; i--) {
      const node = old[i], sources = candidates.get(node.kind) || new Map<string, DocumentNode[]>();
      const matches = sources.get(node.source) || [];
      matches.push(node); sources.set(node.source, matches); candidates.set(node.kind, sources);
    }
    this.environment = {};
    this.nodes = parseBlocks(this.text, this.environment).map(
      (block, index) => {
        const from = offsets[block.fromLine - 1],
          to = (offsets[block.toLine] ?? this.text.length + 1) - 1;
        const matches = candidates.get(block.kind)?.get(block.source);
        while (matches?.length && used.has(matches.at(-1)!.id)) matches.pop();
        const same = matches?.pop() ||
          (old[index]?.kind === block.kind && !used.has(old[index].id) ? old[index] : undefined);
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
      const gapId = used.has(`gap-${caret}`) ? `node-${++sequence}` : `gap-${caret}`;
      used.add(gapId);
      this.nodes.push({
        id: gapId,
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
        id: old.findLast(n => n.kind === "empty" && !used.has(n.id))?.id || `node-${++sequence}`,
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
    if (this.text.length <= 300_000) this.parse();
    else if(this.richParsing){this.ensureCaretNode();this.rebuildRoot();}
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
    const before = { ...this.selection };
    const nextSelection = selection || { anchor: from + insert.length, head: from + insert.length };
    // Source editors and mode/composition commits may supply a whole document.
    // Retain only its changed span in history, including on multi-megabyte files.
    if (from === 0 && to === this.text.length) {
      let prefix = 0, suffix = 0;
      while (prefix < to && prefix < insert.length && this.text.charCodeAt(prefix) === insert.charCodeAt(prefix)) prefix++;
      while (suffix < to - prefix && suffix < insert.length - prefix && this.text.charCodeAt(to - suffix - 1) === insert.charCodeAt(insert.length - suffix - 1)) suffix++;
      from = prefix; to -= suffix; insert = insert.slice(prefix, insert.length - suffix);
    }
    let removed = this.text.slice(from, to);
    this.selection = nextSelection;
    if (removed === insert) return false;
    removed = detachedSpan(removed); insert = detachedSpan(insert);
    this.text = this.text.slice(0, from) + insert + this.text.slice(to);
    const now = Date.now(), previous = this.undoStack.at(-1);
    const merge = this.group && ["typing", "composition"].includes(kind) && previous?.kind === kind &&
      (kind === "composition" || now - previous.time < 800) && previous.after.head === before.head && before.anchor === before.head;
    if (merge && from >= previous.from && to <= previous.from + previous.inserted.length) {
      const at = from - previous.from;
      previous.inserted = previous.inserted.slice(0, at) + insert + previous.inserted.slice(to - previous.from);
      previous.after = { ...this.selection }; previous.time = now;
    } else if (merge && from === previous.from + previous.inserted.length) {
      previous.removed += removed; previous.inserted += insert;
      previous.after = { ...this.selection }; previous.time = now;
    } else {
      this.undoStack.push({ from, removed, inserted: insert, before, after: { ...this.selection }, kind, time: now });
      if (this.undoStack.length > 100) this.undoStack.shift();
    }
    while (this.undoStack.length > 1 && this.undoStack.reduce((bytes, command) => bytes + 2 * (command.removed.length + command.inserted.length), 0) > 16 * 1024 * 1024) this.undoStack.shift();
    this.group = ["typing", "composition"].includes(kind);
    this.redoStack = [];
    this.parse({from,to,insert,removed});
    return true;
  }
  replaceExternal(
    source: string,
    lineEnding = source.includes("\r\n") ? "\r\n" : "\n",
  ) {
    this.sourceSession = null;
    this.compositionSession = null;
    this.lineEnding = lineEnding;
    this.original = source;
    this.text = source.replace(/\r\n/g, "\n");
    this.normalizedOriginal = this.text;
    this.serializedText = null;
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
    this.text = this.text.slice(0, command.from) + command.removed + this.text.slice(command.from + command.inserted.length);
    this.selection = { ...command.before };
    this.closeGroup();
    this.parse({from:command.from,to:command.from+command.inserted.length,insert:command.removed,removed:command.inserted});
    return true;
  }
  redo() {
    const command = this.redoStack.pop();
    if (!command) return false;
    this.undoStack.push(command);
    this.text = this.text.slice(0, command.from) + command.inserted + this.text.slice(command.from + command.removed.length);
    this.selection = { ...command.after };
    this.closeGroup();
    this.parse({from:command.from,to:command.from+command.removed.length,insert:command.inserted,removed:command.removed});
    return true;
  }
  nodeAt(position: number) {
    return (
      this.nodes.find((n) => position >= n.from && position <= n.to) ||
      this.nodes.at(-1)
    );
  }
}
