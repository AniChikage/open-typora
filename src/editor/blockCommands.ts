import type { MarkdownDocument } from "./model.ts";

export interface BlockArguments { rows?: number; columns?: number; value?: string; label?: string; reference?: string }
function selectedLines(model: MarkdownDocument) {
  const selection = model.selection;
  const lo = Math.min(selection.anchor, selection.head);
  let hi = Math.max(selection.anchor, selection.head);
  if (hi > lo && model.text[hi - 1] === "\n") hi--;
  const from = model.text.lastIndexOf("\n", lo - 1) + 1;
  const next = model.text.indexOf("\n", hi);
  return { from, to: next < 0 ? model.text.length : next };
}
function transformLines(model: MarkdownDocument, transform: (line: string, index: number) => string) {
  const { from, to } = selectedLines(model), old = model.text.slice(from, to);
  if (model.nodes.some(node => ["fence", "math_block", "frontmatter", "html_block", "table_open", "footnote_definition"].includes(node.kind) && node.from < to && node.to > from)) return false;
  const lines = old.split("\n"), next = lines.map(transform);
  const map = (position: number) => {
    let oldOffset = from, newOffset = from;
    for (let i = 0; i < lines.length; i++) {
      if (position <= oldOffset + lines[i].length) {
        let suffix = 0;
        while (suffix < lines[i].length && suffix < next[i].length && lines[i].at(-suffix - 1) === next[i].at(-suffix - 1)) suffix++;
        const oldPrefix = lines[i].length - suffix, newPrefix = next[i].length - suffix;
        return newOffset + Math.min(next[i].length, Math.max(newPrefix, position - oldOffset + newPrefix - oldPrefix));
      }
      oldOffset += lines[i].length + 1; newOffset += next[i].length + 1;
    }
    return from + next.join("\n").length;
  };
  return model.replace(from, to, next.join("\n"), "paragraph-format", {
    anchor: map(model.selection.anchor), head: map(model.selection.head),
  });
}
function parts(line: string) {
  const match = /^([ \t]*(?:>[ \t]*)*)(?:(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?(?:#{1,6}[ \t]+)?(.*)$/.exec(line)!;
  return { prefix: match[1], body: match[2] };
}
export function insertBlock(model: MarkdownDocument, text: string, inside = 0, replaceParagraph = false) {
  const selection = model.selection;
  let from = Math.min(selection.anchor, selection.head), to = Math.max(selection.anchor, selection.head);
  const node = model.nodeAt(from);
  if (from === to && node) {
    if (replaceParagraph && ["paragraph_open", "heading_open", "empty"].includes(node.kind)) { from = node.from; to = node.to; }
    else if (node.source) from = to = node.to;
  }
  const before = model.text.slice(0, from), after = model.text.slice(to);
  const prefix = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const suffix = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
  const at = from + prefix.length + inside;
  return model.replace(from, to, prefix + text + suffix, "insert-block", { anchor: at, head: at });
}
export function applyBlockCommand(model: MarkdownDocument, action: string, args: BlockArguments = {}, tabSize = 2) {
  const node = model.nodeAt(model.selection.head);
  if (!node) return false;
  if (["fence", "math_block", "frontmatter", "html_block"].includes(node.kind) && !["paragraph-above", "paragraph-below"].includes(action)) return false;
  const level = /^heading-([0-6])$/.exec(action);
  if (level || action === "heading-up" || action === "heading-down") {
    if (node.kind === "table_open") return false;
    return transformLines(model, (line) => {
      const match = /^([ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?)(?:((?:#{1,6}))[ \t]+)?(.*)$/.exec(line)!;
      let count = level ? Number(level[1]) : (match[2]?.length || 0) + (action === "heading-up" ? -1 : 1);
      count = Math.max(0, Math.min(6, count));
      return match[1] + (count ? "#".repeat(count) + " " : "") + match[3];
    });
  }
  if (action === "quote") {
    const { from, to } = selectedLines(model);
    const remove = model.text.slice(from, to).split("\n").every(line => /^\s*>/.test(line));
    return transformLines(model, line => remove ? line.replace(/^([ \t]*)>[ \t]?/, "$1") : line.replace(/^([ \t]*)/, "$1> "));
  }
  if (["ordered-list", "unordered-list", "task-list"].includes(action)) {
    const { from, to } = selectedLines(model), lines = model.text.slice(from, to).split("\n");
    const expression = action === "ordered-list" ? /^\s*(?:>\s*)*\d+[.)]\s/ : action === "task-list" ? /^\s*(?:>\s*)*[-+*]\s+\[[ xX]\]\s/ : /^\s*(?:>\s*)*[-+*]\s+(?!\[[ xX]\])/;
    const remove = lines.every(line => expression.test(line));
    return transformLines(model, (line, index) => {
      const { prefix, body } = parts(line);
      return prefix + (remove ? "" : action === "ordered-list" ? `${index + 1}. ` : action === "task-list" ? "- [ ] " : "- ") + body;
    });
  }
  if (action === "indent" || action === "outdent") {
    return transformLines(model, line => {
      const match = /^((?:[ \t]*>[ \t]?)*)([ \t]*)(.*)$/.exec(line)!;
      return match[1] + (action === "indent" ? " ".repeat(tabSize) + match[2] : match[2].replace(new RegExp(`^(?: {1,${tabSize}}|\\t)`), "")) + match[3];
    });
  }
  if (action === "task-toggle" || action === "task-done" || action === "task-undone") {
    return transformLines(model, line => line.replace(/^(\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[)([ xX])(\])/, (_, before, state, after) => before + (action === "task-done" ? "x" : action === "task-undone" ? " " : state.toLowerCase() === "x" ? " " : "x") + after));
  }
  if (action === "table") {
    const rows = Math.max(2, Math.min(100, Math.trunc(args.rows || 3))), columns = Math.max(1, Math.min(30, Math.trunc(args.columns || 2)));
    const empty = "| " + Array(columns).fill("").join(" | ") + " |";
    const text = [empty, "| " + Array(columns).fill("---").join(" | ") + " |", ...Array(rows - 1).fill(empty)].join("\n");
    return insertBlock(model, text, 2);
  }
  if (action === "math-block") {
    const raw = model.selection.anchor === model.selection.head && node.kind === "paragraph_open" ? node.source : model.text.slice(Math.min(model.selection.anchor, model.selection.head), Math.max(model.selection.anchor, model.selection.head));
    return insertBlock(model, `$$\n${raw}\n$$`, 3, true);
  }
  if (action === "toc") return insertBlock(model, "[toc]", 5);
  if (action === "hr") return insertBlock(model, "---", 3);
  if (action === "yaml") {
    const existing = model.nodes.find(item => item.kind === "frontmatter");
    if (existing) { model.selection = { anchor: existing.from + 4, head: existing.from + 4 }; return true; }
    const at = 4;
    return model.replace(0, 0, "---\n\n---\n\n", "insert-block", { anchor: at, head: at });
  }
  if (action === "reference-link") {
    const from = Math.min(model.selection.anchor, model.selection.head), to = Math.max(model.selection.anchor, model.selection.head);
    let id = (args.reference || "link").replace(/[\[\]\s]/g, "-"); if (!id) id = "link";
    const base = id; let number = 2; while (new RegExp(`^\\[${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]:`, "im").test(model.text)) id = base + "-" + number++;
    const label = (args.label || model.text.slice(from, to) || "链接").replace(/[\[\]]/g, character => "\\" + character), link = `[${label}][${id}]`;
    const body = model.text.slice(0, from) + link + model.text.slice(to), prefix = body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n";
    return model.replace(0, model.text.length, body + prefix + `[${id}]: ${args.value || "https://"}\n`, "reference-link", { anchor: from + 1, head: from + label.length + 1 });
  }
  if (action === "footnote") {
    let number = 1;
    while (model.text.includes(`[^fn${number}]`)) number++;
    const id = `fn${number}`, at = Math.max(model.selection.anchor, model.selection.head), ref = `[^${id}]`;
    const text = model.text.slice(0, at) + ref + model.text.slice(at);
    const prefix = text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    const label = `[^${id}]: `, body = (args.value || "").replace(/\n/g, "\n    ");
    const point = text.length + prefix.length + label.length;
    return model.replace(0, model.text.length, text + prefix + label + body + "\n", "footnote", { anchor: point, head: point + body.length });
  }
  if (action === "paragraph-above" || action === "paragraph-below") {
    const above = action === "paragraph-above", at = above ? node.from : node.to;
    const point = above ? at : at + 2;
    return model.replace(at, at, "\n\n", "insert-paragraph", { anchor: point, head: point });
  }
  return false;
}
