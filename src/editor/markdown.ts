import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import { configureMath } from "./mathMarkdown.ts";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import { full as emoji } from "markdown-it-emoji";
import { configureDocumentSyntax } from "./markdownExtensions.ts";
import type { Token } from "markdown-it";
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
  id: string;
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
  .use(configureMath)
  .use(mark).use(sub).use(sup).use(emoji, { shortcuts: {} })
  .use(configureDocumentSyntax);
export function setMarkdownOptions(options: { highlight: boolean; subscript: boolean; superscript: boolean; emoji: boolean; inlineMath: boolean }) {
  for (const [rule, enabled] of [["mark", options.highlight], ["sub", options.subscript], ["sup", options.superscript], ["emoji", options.emoji], ["math_inline", options.inlineMath]] as const)
    enabled ? md.enable(rule, true) : md.disable(rule, true);
}
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
export function renderMarkdown(
  source: string,
  documentId?: string,
  environment: Record<string, unknown> = {},
) {
  return DOMPurify.sanitize(md.render(source, { ...environment, documentId }), {
    ADD_URI_SAFE_ATTR: ["src"],
  });
}
export function parseBlocks(
  source: string,
  environment: Record<string, unknown> = {},
): Block[] {
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
  for (const token of md.parse(source, environment)) {
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
export function inlineTokens(
  source: string,
  environment: Record<string, unknown> = {},
) {
  return md.parseInline(source, { ...environment, fragment: true })[0].children || [];
}
export function decodeMarkdownText(source: string) {
  return md.utils.unescapeAll(source);
}
export function highlightCode(source: string, language: string) {
  return language && hljs.getLanguage(language)
    ? hljs.highlight(source, { language, ignoreIllegals: true }).value
    : md.utils.escapeHtml(source);
}
export function editableHtml(
  source: string,
  documentId: string,
  inline: (token: Token) => string,
  fence: (token: Token) => string,
  environment: Record<string, unknown> = {},
) {
  const renderer = Object.create(md.renderer) as typeof md.renderer;
  renderer.rules = {
    ...md.renderer.rules,
    fence: (tokens, index) => fence(tokens[index]),
  };
  const env = { ...environment, documentId, fragment: true },
    tokens = md.parse(source, env);
  const html = tokens
    .map((token, index) => {
      if (token.type === "inline") return inline(token);
      if (
        token.type === "list_item_open" &&
        tokens[index + 1]?.type === "list_item_close"
      )
        return (
          renderer.renderToken(tokens, index, md.options) +
          inline(
            Object.assign(Object.create(token), {
              content: "",
              type: "inline",
            }),
          )
        );
      return renderer.rules[token.type]
        ? renderer.rules[token.type]!(tokens, index, md.options, env, renderer)
        : renderer.renderToken(tokens, index, md.options);
    })
    .join("");
  return DOMPurify.sanitize(html, {
    ADD_URI_SAFE_ATTR: ["src"],
    ADD_ATTR: [
      "contenteditable",
      "data-leaf",
      "data-task",
      "data-inline-from",
      "data-inline-to",
      "data-mark",
    ],
  });
}
export function extractHeadings(source: string): Heading[] {
  const env: { headings?: Heading[] } = {};
  md.parse(source.replace(/\r\n/g, "\n"), env);
  return env.headings || [];
}
