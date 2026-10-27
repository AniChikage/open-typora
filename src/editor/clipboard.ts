import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import DOMPurify from "dompurify";
const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
converter.use(gfm);
converter.addRule("underline", { filter: "u", replacement: content => `<u>${content}</u>` });
converter.addRule("highlight", { filter: "mark", replacement: content => `==${content}==` });
converter.addRule("subscript", { filter: "sub", replacement: content => `~${content}~` });
converter.addRule("superscript", { filter: "sup", replacement: content => `^${content}^` });

// Office/WPS copy ordinary <td> cells (often with an image alternative), not
// the <th> header row required by Turndown's default GFM table rule.
converter.addRule("clipboardTable", {
  filter: "table",
  replacement: (content: string, node: Node) => {
    const grid = htmlTableGrid(node as HTMLTableElement);
    return "\n\n" + (grid ? tableMarkdown(grid.cells, grid.align) : content) + "\n\n";
  },
});

export function tableCellMarkdown(value: string) {
  let output = "", slashes = 0;
  for (const character of value.replace(/\r\n?/g, "\n")) {
    if (character === "\n") { output += "<br>"; slashes = 0; continue; }
    if (character === "|" && slashes % 2 === 0) output += "\\";
    output += character;
    slashes = character === "\\" ? slashes + 1 : 0;
  }
  return output;
}

export function tableMarkdown(grid: string[][], align: string[] = []) {
  let width = 0;
  for (const row of grid) width = Math.max(width, row.length);
  if (!grid.length || !width) return "";
  const rowText = (row: string[]) => "| " + Array.from({ length: width }, (_, i) => tableCellMarkdown(row[i] || "")).join(" | ") + " |";
  return [rowText(grid[0]), rowText(Array.from({ length: width }, (_, i) => align[i] === "left" ? ":---" : align[i] === "right" ? "---:" : align[i] === "center" ? ":---:" : "---")), ...grid.slice(1).map(rowText)].join("\n");
}

interface ClipboardGrid { cells: string[][]; align: string[] }

function htmlTableGrid(table: HTMLTableElement): ClipboardGrid | null {
  const rows = Array.from(table.rows).filter(row => row.closest("table") === table);
  const grid: string[][] = rows.map(() => []), align: string[] = [];
  // Bound expansion of untrusted span attributes, without truncating a range.
  const maxExpandedCells = 1_000_000;
  let occupied = 0, width = 0;
  for (let r = 0; r < rows.length; r++) {
    let column = 0;
    for (const cell of Array.from(rows[r].cells)) {
      while (grid[r][column] !== undefined) column++;
      const height = cell.rowSpan === 0 ? rows.length - r : Math.min(Math.max(1, cell.rowSpan), rows.length - r);
      const span = Math.max(1, cell.colSpan);
      occupied += height * span;
      if (occupied > maxExpandedCells || (column + span) * rows.length > maxExpandedCells) return null;
      const value = converter.turndown(cell.innerHTML).trim().replace(/ *\n */g, "\n");
      for (let dr = 0; dr < height; dr++) for (let dc = 0; dc < span; dc++) {
        grid[r + dr][column + dc] = dr === 0 && dc === 0 ? value : "";
      }
      if (r === 0) for (let dc = 0; dc < span; dc++) align[column + dc] = (cell.getAttribute("align") || cell.style.textAlign || "").toLowerCase();
      column += span;
      width = Math.max(width, column);
    }
  }
  if (!width) return null;
  return { cells: grid.map(row => Array.from({ length: width }, (_, i) => row[i] || "")), align };
}

/** Parse Excel-style quoted TSV, including embedded tabs/newlines and doubled quotes. */
export function tsvGrid(text: string): string[][] | null {
  if (!text.includes("\t")) return null;
  const rows: string[][] = [], row: string[] = [];
  let value = "", quoted = false, ended = false, hasDelimiter = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (character === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; ended = true; }
      } else value += character;
    } else if (character === '"' && value === "" && !ended) quoted = true;
    else if (character === "\t") { row.push(value); value = ""; ended = false; hasDelimiter = true; }
    else if (character === "\r" || character === "\n") {
      row.push(value); rows.push([...row]); row.length = 0; value = ""; ended = false;
      if (character === "\r" && text[i + 1] === "\n") i++;
    } else {
      if (ended) return null; // Preserve malformed quoted text through the ordinary paste path.
      value += character;
    }
  }
  if (quoted || !hasDelimiter) return null;
  if (row.length || value !== "" || ended || !/[\r\n]$/.test(text)) { row.push(value); rows.push(row); }
  if (rows.some(row => row.length !== rows[0].length)) return null;
  // Plain cell contents are data, not Markdown or executable HTML.
  return rows.map(row => row.map(value => converter.escape(value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).replace(/[~^$=]/g, "\\$&")));
}

export function clipboardTable(data: Pick<DataTransfer, "getData">): ClipboardGrid | null {
  const html = data.getData("text/html");
  if (/<table\b/i.test(html)) {
    const safe = DOMPurify.sanitize(html, { FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"] });
    const body = new DOMParser().parseFromString(safe, "text/html").body;
    const tables = body.querySelectorAll("table");
    if (tables.length !== 1) return null;
    const table = tables[0], rest = body.cloneNode(true) as HTMLElement;
    rest.querySelector("table")!.remove();
    if (rest.textContent?.trim()) return null; // General rich HTML must retain text outside its table.
    return htmlTableGrid(table);
  }
  if (/<(?:pre|code)\b/i.test(html)) return null;
  const cells = tsvGrid(data.getData("text/plain"));
  return cells ? { cells, align: [] } : null;
}

export function tablePasteBlock(markdown: string, source: string, from: number, to: number) {
  const before = source.slice(0, from), after = source.slice(to);
  const prefix = !before || /\n[ \t]*\n$/.test(before) ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = !after || /^\n[ \t]*\n/.test(after) ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return prefix + markdown + suffix;
}

export function htmlToMarkdown(html: string) {
  // Clipboard HTML is inert before conversion; active/embed content is discarded.
  const safe = DOMPurify.sanitize(html, { FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"] });
  return converter.turndown(safe).trim();
}
