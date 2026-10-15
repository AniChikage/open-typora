import { parseBlocks } from "./markdown.ts";
export interface ImageReference { from: number; to: number; source: string; url: string; alt: string; width: string; height: string }
export function imageReferences(text: string): ImageReference[] {
  const result: ImageReference[] = [];
  const lines = text.split("\n"), offsets = [0]; for (const line of lines) offsets.push(offsets.at(-1)! + line.length + 1);
  const blocked = parseBlocks(text).filter(block => ["fence", "code_block", "frontmatter", "math_block"].includes(block.kind)).map(block => ({ from: offsets[block.fromLine - 1], to: offsets[block.toLine] }));
  for (const code of text.matchAll(/(`+)([^`]|(?!\1)`)*?\1/g)) blocked.push({ from: code.index, to: code.index + code[0].length });
  const expression = /!\[((?:\\.|[^\]\\])*)\]\((<[^>]*>|(?:\\.|[^\s)])*(?:\([^)]*\)[^\s)]*)*)(?:\s+["'][^"']*["'])?\)|<img\b[^>]*>/gi;
  for (const match of text.matchAll(expression)) {
    if (blocked.some(range => match.index >= range.from && match.index < range.to) || /(?:^|[^\\])(?:\\\\)*\\$/.test(text.slice(0, match.index))) continue;
    let url = "", alt = "", width = "", height = "";
    if (match[0].startsWith("<")) { const attributes = new DOMParser().parseFromString(match[0], "text/html").querySelector("img"); url = attributes?.getAttribute("src") || ""; alt = attributes?.getAttribute("alt") || ""; width = attributes?.getAttribute("width") || ""; height = attributes?.getAttribute("height") || ""; }
    else { url = (match[2] || "").replace(/^<|>$/g, "").replace(/\\([()])/g, "$1"); alt = match[1].replace(/\\([\[\]])/g, "$1"); }
    if (url) result.push({ from: match.index, to: match.index + match[0].length, source: match[0], url, alt, width, height });
  }
  return result;
}
export function imageMarkdown(url: string, alt: string, width = "", height = "") {
  const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  if (width || height) return `<img src="${escape(url)}" alt="${escape(alt)}"${width ? ` width="${escape(width)}"` : ""}${height ? ` height="${escape(height)}"` : ""} />`;
  return `![${alt.replace(/[\[\]\\]/g, c => "\\" + c)}](<${url.replaceAll(">", "%3E")}>)`;
}
export function updateImageReferences(text: string, mapping: Record<string, string>) {
  for (const image of imageReferences(text).reverse()) if (Object.hasOwn(mapping, image.url)) {
    text = text.slice(0, image.from) + (mapping[image.url] ? imageMarkdown(mapping[image.url], image.alt, image.width, image.height) : "") + text.slice(image.to);
  }
  return text;
}
