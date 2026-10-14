import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import texmath from "markdown-it-texmath";
import katex from "katex";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";
export interface Block {
  fromLine: number;
  toLine: number;
  source: string;
  kind: string;
}
export interface Heading {
  line: number;
  level: number;
  text: string;
}
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, language): string {
    return language && hljs.getLanguage(language)
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : md.utils.escapeHtml(code);
  },
})
  .use(taskLists, { enabled: false })
  .use(texmath, {
    engine: katex,
    delimiters: "dollars",
    katexOptions: { throwOnError: false, trust: false, strict: "ignore" },
  });
const defaultFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, index, options, env, self) =>
  tokens[index].info.trim() === "mermaid"
    ? `<div class="mermaid-block">${md.utils.escapeHtml(tokens[index].content)}</div>`
    : defaultFence(tokens, index, options, env, self);
md.renderer.rules.image = (tokens, index, _options, env) => {
  const token = tokens[index],
    source = String(token.attrGet("src") || ""),
    alt = md.utils.escapeHtml(token.content || "图片");
  const documentId =
    typeof env?.documentId === "string" ? env.documentId : undefined;
  if (/^https?:\/\//i.test(source))
    return `<span class="remote-image">${alt}（远程图片：${md.utils.escapeHtml(source)}）</span>`;
  const url = /^data:image\/(png|jpeg|gif|webp);/i.test(source)
    ? source
    : documentId
      ? `open-typora-asset://local/${encodeURIComponent(documentId)}/${encodeURIComponent(source)}`
      : "";
  return url
    ? `<img src="${url}" alt="${alt}" loading="lazy" />`
    : `<span class="remote-image">${alt}（${md.utils.escapeHtml(source)}）</span>`;
};
export function renderMarkdown(source: string, documentId?: string) {
  return DOMPurify.sanitize(md.render(source, { documentId }), {
    ADD_URI_SAFE_ATTR: ["src"],
  });
}
export function parseBlocks(source: string): Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  let covered = 0;
  if (lines[0] === "---") {
    const end = lines
      .slice(1)
      .findIndex((line) => line === "---" || line === "...");
    if (end >= 0) {
      covered = end + 2;
      blocks.push({
        fromLine: 1,
        toLine: covered,
        source: lines.slice(0, covered).join("\n"),
        kind: "frontmatter",
      });
    }
  }
  for (const token of md.parse(source, {})) {
    if (
      !token.map ||
      token.level !== 0 ||
      token.map[0] < covered ||
      token.type.endsWith("_close")
    )
      continue;
    const [from, to] = token.map;
    covered = to;
    blocks.push({
      fromLine: from + 1,
      toLine: to,
      source: lines.slice(from, to).join("\n"),
      kind: token.type,
    });
  }
  return blocks;
}
export function extractHeadings(source: string): Heading[] {
  const result: Heading[] = [],
    tokens = md.parse(source.replace(/\r\n/g, "\n"), {});
  for (let i = 0; i < tokens.length; i++)
    if (tokens[i].type === "heading_open" && tokens[i].map)
      result.push({
        line: tokens[i].map![0] + 1,
        level: Number(tokens[i].tag.slice(1)),
        text: tokens[i + 1]?.content || "",
      });
  return result;
}
