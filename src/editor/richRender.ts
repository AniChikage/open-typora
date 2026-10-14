import {
  editableHtml,
  renderMarkdown,
  inlineTokens,
  decodeMarkdownText,
  highlightCode,
} from "./markdown.ts";
import type { DocumentNode } from "./model.ts";
export interface Leaf {
  id: string;
  nodeId: string;
  raw: string;
  positions: number[];
  kind?: string;
  fenceLine?: number;
}
export function codeBody(node: DocumentNode, startLine: number) {
  const lines = node.source.split("\n"),
    offsets = [0];
  for (let i = 0; i < lines.length; i++)
    offsets.push(offsets[i] + lines[i].length + 1);
  const opening = /^(.*?)(`{3,}|~{3,})/.exec(lines[startLine] || "");
  const prefix = (opening?.[1] || "").replace(
      /(?:[-+*]|\d+[.)])\s+$/,
      (marker) => " ".repeat(marker.length),
    ),
    marker = opening?.[2] || "```";
  let endLine = lines.length,
    closed = false;
  for (let i = startLine + 1; i < lines.length; i++) {
    const content = lines[i].startsWith(prefix)
      ? lines[i].slice(prefix.length)
      : lines[i];
    if (new RegExp(`^${marker[0]}{${marker.length},}\\s*$`).test(content)) {
      endLine = i;
      closed = true;
      break;
    }
  }
  const from = Math.min(node.source.length, offsets[startLine + 1]),
    to = Math.min(node.source.length, offsets[endLine]);
  let raw = "";
  const positions: number[] = [];
  for (let i = startLine + 1; i < endLine; i++) {
    const skip = lines[i].startsWith(prefix) ? prefix.length : 0,
      line = lines[i].slice(skip);
    for (let c = 0; c < line.length; c++) {
      raw += line[c];
      positions.push(node.from + offsets[i] + skip + c);
    }
    if (offsets[i] + lines[i].length < to) {
      raw += "\n";
      positions.push(node.from + offsets[i] + lines[i].length);
    }
  }
  positions.push(node.from + to);
  return { from, to, prefix, raw, positions, closed };
}
export function encodeCodeBody(raw: string, prefix: string) {
  return raw ? prefix + raw.replace(/\n(?!$)/g, "\n" + prefix) : "";
}
export function codePosition(
  from: number,
  raw: string,
  prefix: string,
  position: number,
) {
  return (
    from +
    (position === 0 && raw
      ? prefix.length
      : encodeCodeBody(raw.slice(0, position), prefix).length) +
    (raw[position - 1] === "\n" && position < raw.length ? prefix.length : 0)
  );
}
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
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
  const closing = new RegExp(
    `(?:^|\\n) {0,3}${open[1][0]}{${open[1].length},}[ \\t]*$`,
  ).exec(node.source);
  return {
    start: open[0].length,
    closingOnNewLine: !!closing && closing.index >= open[0].length - 1,
    end:
      closing && closing.index >= open[0].length - 1
        ? closing.index + (closing[0].startsWith("\n") ? 1 : 0)
        : node.source.length,
  };
}
const meta = (text: string) =>
  `<span class="md-meta">${escapeHtml(text)}</span>`;
export function renderNode(
  node: DocumentNode,
  documentId: string,
  leaves: Map<string, Leaf>,
  environment: Record<string, unknown> = {},
): HTMLElement {
  const holder = document.createElement("div");
  let pointer = 0,
    index = 0;
  const cells = node.kind === "table_open" ? tableCells(node.source) : [];
  const leaf = (raw: string, map?: [number, number] | null, kind?: string) => {
    let start = pointer;
    if (map)
      start = node.source
        .split("\n")
        .slice(0, map[0])
        .reduce((n, line) => n + line.length + 1, 0);
    const positions: number[] = [];
    let search = start;
    for (const [lineIndex, line] of raw.split("\n").entries()) {
      const lineStart = lineIndex
        ? node.source.lastIndexOf("\n", search - 1) + 1
        : start;
      if (map && kind !== "fence") {
        const actual = node.source.slice(lineStart).split("\n")[0];
        const task = /^\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\]/.exec(actual);
        const prefix =
          task ||
          /^\s*(?:>\s*)*(?:#{1,6}\s+|[-+*]\s+|\d+[.)]\s+)?/.exec(actual);
        search = lineStart + (prefix?.[0].length || 0);
      }
      let found = node.source.indexOf(line, search),
        at = found >= 0 ? found : search;
      if (!line.trim() && map && kind !== "fence")
        at =
          lineStart +
          node.source.slice(lineStart).split("\n")[0].length -
          line.length;
      if (lineIndex)
        positions.push(
          node.from + Math.max(0, node.source.lastIndexOf("\n", at - 1)),
        );
      for (let c = 0; c < line.length; c++) positions.push(node.from + at + c);
      search = at + line.length + 1;
    }
    positions.push(node.from + Math.max(start, search - 1));
    pointer = search - 1;
    const id = `${node.id}-leaf-${index++}`;
    leaves.set(id, { id, nodeId: node.id, raw, positions, kind });
    return id;
  };
  const fenceLeaf = (startLine?: number) => {
    const range = fenceRange(node),
      body = startLine !== undefined ? codeBody(node, startLine) : undefined,
      raw = body ? body.raw : node.source.slice(range.start, range.end),
      id = `${node.id}-leaf-${index++}`;
    leaves.set(id, {
      id,
      nodeId: node.id,
      raw,
      positions:
        body?.positions ||
        Array.from(
          { length: raw.length + 1 },
          (_, i) => node.from + range.start + i,
        ),
      kind: "fence",
      fenceLine: startLine,
    });
    return { id, raw };
  };
  if (node.kind === "empty") {
    const id = leaf("");
    holder.innerHTML = `<p><span data-leaf="${id}"><br /></span></p>`;
  } else if ((node.kind === "fence" || /^\$\$\s*$/.test(node.source)) && !node.source.includes("\n")) {
    const id = leaf(node.source); holder.innerHTML = `<p><span data-leaf="${id}" class="md-fence-opening">${escapeHtml(node.source)}</span></p>`;
  } else if (node.kind === "blockquote_open" && /^\s*(?:>\s*)+$/.test(node.source)) {
    const id = leaf("", [0, 1]); holder.innerHTML = `<blockquote><p><span data-leaf="${id}"><br /></span></p></blockquote>`;
  } else if (node.kind === "frontmatter") {
    const id = leaf(node.source, null, "code");
    holder.innerHTML = `<pre class="md-frontmatter"><code data-leaf="${id}">${escapeHtml(node.source)}</code></pre>`;
  } else if (/^\$\$/.test(node.source)) {
    const { id, raw } = fenceLeaf();
    holder.innerHTML = `<div class="md-fence md-math" contenteditable="false" data-fence="${id}"><div class="fence-preview">${renderMarkdown(node.source, documentId)}</div><pre class="fence-body"><code>${escapeHtml(raw)}</code></pre></div>`;
  } else {
    holder.innerHTML = editableHtml(
      node.source,
      documentId,
      (token) => {
        const cell = cells.shift(),
          raw = cell ? cell.raw : token.content;
        if (cell) pointer = cell.start;
        const id = leaf(raw, cell ? null : token.map);
        if (cell) {
          const item = leaves.get(id)!;
          item.positions = Array.from(
            { length: raw.length + 1 },
            (_, i) => node.from + cell.start + i,
          );
          pointer = cell.end;
        }
        const sourceLine = token.map
          ? node.source.split("\n")[token.map[0]]
          : "";
        const task = /^\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[([ xX])\]\s/.exec(
          sourceLine || "",
        );
        const taskFrom = node.from + node.source.split("\n").slice(0, token.map?.[0] || 0).reduce((n, line) => n + line.length + 1, 0) + sourceLine.indexOf("[") + 1;
        const checkbox = task
          ? `<input class="task-checkbox" data-task="${taskFrom}" type="checkbox" contenteditable="false" ${task[1].toLowerCase() === "x" ? "checked" : ""} />`
          : "";
        return `${checkbox}<span class="md-line" data-leaf="${id}">${tokenInlineHtml(raw, documentId, environment) || "<br />"}</span>`;
      },
      (token) => {
        const openingLine = node.source.split("\n")[token.map?.[0] || 0];
        if (token.map?.[1] === (token.map?.[0] || 0) + 1 && !node.source.includes("\n")) { const raw = openingLine.replace(/^\s*(?:>\s*)*(?:(?:[-+*]|\d+[.)])\s+)?/, ""), id = leaf(raw, token.map); return `<p><span data-leaf="${id}" class="md-fence-opening">${escapeHtml(raw)}</span></p>`; }
        const { id, raw } = fenceLeaf(token.map?.[0] || 0);
        if (token.info.trim() === "mermaid")
          return `<div class="md-fence" contenteditable="false" data-fence="${id}"><div class="fence-preview">${renderMarkdown(node.source, documentId)}</div><pre class="fence-body"><code>${escapeHtml(token.content)}</code></pre><span class="fence-language">mermaid</span></div>`;
        return `<div class="md-fence" contenteditable="false" data-fence="${id}"><pre class="fence-body"><code data-leaf="${id}">${highlightCode(raw, token.info.trim().split(/\s/)[0])}</code></pre><span class="fence-language">${escapeHtml(token.info)}</span></div>`;
      },
      environment,
    );
  }
  const element =
    (holder.firstElementChild as HTMLElement) || document.createElement("p");
  element.dataset.cid = node.id;
  element.dataset.kind = node.kind;
  element.dataset.line = String(node.line);
  // Task-list syntax belongs to the model; the native checkbox is an interactive view.
  element
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    .forEach((box) => {
      box.disabled = false;
      box.contentEditable = "false";
    });
  return element;
}
export function tableRowCells(line: string) {
  const cells: { raw: string; start: number; end: number }[] = [];
  let start = /^\s*\|/.test(line) ? line.indexOf("|") + 1 : 0;
  for (let i = start; i <= line.length; i++) {
    if (line[i] === "\\" && i + 1 < line.length) {
      i++;
      continue;
    }
    if (i === line.length || line[i] === "|") {
      if (i === line.length && !line.slice(start).trim() && /\|\s*$/.test(line))
        break;
      const original = line.slice(start, i),
        raw = original.trim(),
        from = start + original.length - original.trimStart().length;
      cells.push({ raw, start: from, end: from + raw.length });
      start = i + 1;
    }
  }
  return cells;
}
function tableCells(source: string) {
  const cells: { raw: string; start: number; end: number }[] = [];
  let offset = 0;
  for (const [index, line] of source.split("\n").entries()) {
    if (index === 1) {
      offset += line.length + 1;
      continue;
    }
    for (const cell of tableRowCells(line))
      cells.push({
        raw: cell.raw,
        start: offset + cell.start,
        end: offset + cell.end,
      });
    offset += line.length + 1;
  }
  return cells;
}
// Markdown-it owns recognition; DOM text retains the original spelling and delimiters.
function tokenInlineHtml(
  raw: string,
  documentId: string,
  environment: Record<string, unknown>,
) {
  type Frame = {
    from: number;
    before: string;
    tag: string;
    mark: string;
    html: string;
    href?: string;
  };
  const stack: Frame[] = [{ from: 0, before: "", tag: "", mark: "", html: "" }];
  let cursor = 0;
  const append = (html: string) => {
    stack.at(-1)!.html += html;
  };
  const object = (source: string, view: string, mark: string, from: number) =>
    `<span class="md-inline" data-mark="${mark}" data-inline-from="${from}" data-inline-to="${from + source.length}"><span class="md-object-source">${escapeHtml(source)}</span><span class="md-view" contenteditable="false">${view}</span></span>`;
  const text = (value: string) => {
    let decoded = "",
      html = "",
      attempts = 0;
    while (
      decoded.length < value.length &&
      cursor < raw.length &&
      attempts++ < raw.length + 1
    ) {
      const rest = raw.slice(cursor),
        entity = /^&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/i.exec(rest),
        escaped = /^\\[\\`*_{}\[\]()#+.!~<>|-]/.exec(rest);
      const unit =
        entity?.[0] ||
        escaped?.[0] ||
        String.fromCodePoint(raw.codePointAt(cursor)!);
      const visible = decodeMarkdownText(unit);
      if (!value.startsWith(decoded + visible)) break;
      html +=
        entity && visible !== unit
          ? object(unit, escapeHtml(visible), "entity", cursor)
          : escaped
            ? meta("\\") + escapeHtml(unit.slice(1))
            : escapeHtml(unit);
      cursor += unit.length;
      decoded += visible;
    }
    if (decoded !== value) {
      const missing = value.slice(decoded.length),
        found = raw.indexOf(missing, cursor);
      if (found >= 0) {
        html += escapeHtml(raw.slice(cursor, found + missing.length));
        cursor = found + missing.length;
      } else html += escapeHtml(missing);
    }
    return html;
  };
  const suffix = (at: number) => {
    if (raw[at] === ">") return ">";
    if (raw[at] !== "]") return "";
    let end = at + 1;
    if (raw[end] === "(") {
      let depth = 1;
      end++;
      while (end < raw.length && depth) {
        if (raw[end] === "\\") {
          end += 2;
          continue;
        }
        if (raw[end] === "(") depth++;
        if (raw[end] === ")") depth--;
        end++;
      }
    } else if (raw[end] === "[") {
      end = raw.indexOf("]", end + 1) + 1 || end;
    }
    return raw.slice(at, end);
  };
  for (const token of inlineTokens(raw, environment)) {
    if (token.type === "text" || token.type === "text_special") {
      append(text(token.content));
      continue;
    }
    if (token.type === "softbreak" || token.type === "hardbreak") {
      const end = raw.indexOf("\n", cursor);
      const before = end < 0 ? "" : raw.slice(cursor, end);
      append(meta(before) + '<span class="md-newline">\n</span><br />');
      cursor = end < 0 ? cursor : end + 1;
      continue;
    }
    if (token.type === "code_inline") {
      const from = cursor,
        marker = token.markup;
      cursor += marker.length;
      const end = raw.indexOf(marker, cursor);
      if (end < 0) {
        append(escapeHtml(raw.slice(from)));
        cursor = raw.length;
        continue;
      }
      const body = raw.slice(cursor, end);
      append(
        `<span class="md-inline" data-mark="code" data-inline-from="${from}" data-inline-to="${end + marker.length}">${meta(marker)}<code>${escapeHtml(body)}</code>${meta(marker)}</span>`,
      );
      cursor = end + marker.length;
      continue;
    }
    if (token.type === "image") {
      const from = cursor,
        start = raw.indexOf("]", from + 2),
        after = suffix(start);
      const end =
        start < 0 ? from + token.content.length : start + after.length;
      const source = raw.slice(from, end);
      append(
        object(
          source,
          renderMarkdown(source, documentId, environment).replace(
            /^<p>|<\/p>\n?$/g,
            "",
          ),
          "image",
          from,
        ),
      );
      cursor = end;
      continue;
    }
    if (token.type.startsWith("math_inline")) {
      const from = cursor,
        marker = raw.startsWith("$$", from) ? "$$" : "$",
        end = raw.indexOf(marker, from + marker.length);
      if (end >= 0) {
        const source = raw.slice(from, end + marker.length);
        append(
          object(
            source,
            renderMarkdown(source, documentId, environment).replace(
              /^<p>|<\/p>\n?$/g,
              "",
            ),
            "math",
            from,
          ),
        );
        cursor = end + marker.length;
      }
      continue;
    }
    if (token.nesting === 1) {
      const before =
        token.type === "link_open"
          ? raw[cursor] === "["
            ? "["
            : raw[cursor] === "<"
              ? "<"
              : ""
          : token.markup;
      const frame: Frame = {
        from: cursor,
        before,
        tag: token.tag,
        mark: token.tag,
        html: "",
        href:
          token.type === "link_open"
            ? String(token.attrGet("href") || "")
            : undefined,
      };
      stack.push(frame);
      cursor += before.length;
      continue;
    }
    if (token.nesting === -1 && stack.length > 1) {
      const frame = stack.pop()!,
        after =
          token.type === "link_close"
            ? frame.before
              ? suffix(cursor)
              : ""
            : token.markup;
      cursor += after.length;
      const href =
        frame.href !== undefined ? ` href="${escapeHtml(frame.href)}"` : "";
      append(
        `<span class="md-inline" data-mark="${frame.mark === "a" ? "link" : frame.mark}" data-inline-from="${frame.from}" data-inline-to="${cursor}">${meta(frame.before)}<${frame.tag}${href}>${frame.html}</${frame.tag}>${meta(after)}</span>`,
      );
      continue;
    }
    append(text(token.content));
  }
  if (cursor < raw.length) append(escapeHtml(raw.slice(cursor)));
  while (stack.length > 1) {
    const frame = stack.pop()!;
    append(escapeHtml(frame.before) + frame.html);
  }
  return stack[0].html;
}
