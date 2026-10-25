import type { DocumentNode } from "./model.ts";

export function fenceRange(node: DocumentNode) {
  if (/^\$\$/.test(node.source)) {
    const start = /^\$\$[ \t]*\n?/.exec(node.source)![0].length;
    return {
      start,
      end: Math.max(start, node.source.lastIndexOf("$$")),
      closingOnNewLine: node.source.slice(0, start).endsWith("\n"),
    };
  }
  const open = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(node.source);
  if (!open)
    return { start: 0, end: node.source.length, closingOnNewLine: false };
  const limit = node.source.endsWith("\n") ? node.source.length - 1 : node.source.length;
  const newline = node.source.lastIndexOf("\n", limit - 1), closingStart = newline + 1;
  const closed = closingStart >= open[0].length && new RegExp(`^ {0,3}${open[1][0]}{${open[1].length},}[ \\t]*$`).test(node.source.slice(closingStart, limit));
  return {start: open[0].length, closingOnNewLine: closed, end: closed ? closingStart : node.source.length};
}
