import { safeDocumentHtml } from "./htmlResources.ts";
import type { MarkdownIt } from "markdown-it";
export interface DocumentHeading { line: number; level: number; text: string; id: string }
export interface FootnoteDefinition { id: string; text: string; line: number }
interface SyntaxEnvironment {
  fragment?: boolean; lineOffset?: number; headings?: DocumentHeading[];
  footnoteDefinitions?: Record<string, FootnoteDefinition>; footnoteNumbers?: Record<string, number>;
}
export function headingSlug(text: string) {
  return text.toLowerCase().trim().replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s+/g, "-") || "section";
}
export function alertTitle(kind: string) {
  const label = kind[0].toUpperCase() + kind.slice(1).toLowerCase();
  return `<span class="markdown-alert-title"><svg class="alert-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 7v4M8 4.3v1" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>${label}</span>`;
}
export function configureDocumentSyntax(md: MarkdownIt) {
  md.inline.ruler.before("emphasis", "html_break", (state, silent) => {
    const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) { const token = state.push("html_break", "br", 0); token.markup = match[0]; }
    state.pos += match[0].length; return true;
  });
  md.renderer.rules.html_break = () => "<br>";
  md.renderer.rules.html_block = (tokens, index, _options, env) => safeDocumentHtml(tokens[index].content, typeof env?.documentId === "string" ? env.documentId : undefined);
  md.renderer.rules.alert_marker = (tokens, index) => alertTitle(tokens[index].content);
  md.core.ruler.after("inline", "alert_blocks", state => {
    for (let i = 0; i < state.tokens.length - 2; i++) {
      const token = state.tokens[i], inline = state.tokens[i + 2];
      if (token.type !== "blockquote_open" || inline.type !== "inline") continue;
      const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\n|$)/i.exec(inline.content); if (!match) continue;
      token.attrJoin("class", `markdown-alert markdown-alert-${match[1].toLowerCase()}`);
      const title = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(); token.attrSet("data-alert", title);
      const marker = inline.children?.[0];
      if (marker?.type === "text" && marker.content === match[0].trim()) { marker.type = "alert_marker"; marker.markup = marker.content; marker.content = title; }
    }
  });
  md.block.ruler.before("hr", "frontmatter", (state, startLine, endLine, silent) => {
    if (startLine !== 0 || state.src.slice(state.bMarks[0], state.eMarks[0]) !== "---") return false;
    let end = 1;
    for (; end < endLine; end++) if (/^(?:---|\.\.\.)$/.test(state.src.slice(state.bMarks[end], state.eMarks[end]))) break;
    if (end === endLine) return false;
    if (silent) return true;
    const token = state.push("frontmatter", "pre", 0); token.block = true; token.map = [0, end + 1]; token.content = state.src.slice(state.bMarks[1], state.bMarks[end]);
    state.line = end + 1; return true;
  });
  md.renderer.rules.frontmatter = () => "";
  md.inline.ruler.before("emphasis", "comment", (state, silent) => {
    if (!state.src.startsWith("<!--", state.pos)) return false;
    const end = state.src.indexOf("-->", state.pos + 4); if (end < 0) return false;
    if (!silent) { const token = state.push("comment", "span", 0); token.markup = state.src.slice(state.pos, end + 3); token.content = state.src.slice(state.pos + 4, end); }
    state.pos = end + 3; return true;
  });
  md.renderer.rules.comment = () => "";
  md.block.ruler.before("reference", "footnote_definition", (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const match = /^\[\^([^\]\s]+)\]:[ \t]*(.*)$/.exec(state.src.slice(start, state.eMarks[startLine]));
    if (!match || state.sCount[startLine] >= 4) return false;
    if (silent) return true;
    let end = startLine + 1, body = match[2];
    while (end < endLine) {
      const next = state.src.slice(state.bMarks[end], state.eMarks[end]);
      if (/^(?: {4}|\t)/.test(next)) body += "\n" + next.replace(/^(?: {4}|\t)/, "");
      else if (!next.trim() && end + 1 < endLine && state.sCount[end + 1] >= 4) body += "\n";
      else break;
      end++;
    }
    const token = state.push("footnote_definition", "aside", 0);
    token.content = body; token.meta = { id: match[1] }; token.map = [startLine, end]; token.block = true;
    state.line = end; return true;
  }, { alt: ["paragraph", "reference"] });
  md.inline.ruler.before("link", "footnote_ref", (state, silent) => {
    const match = /^\[\^([^\]\s]+)\]/.exec(state.src.slice(state.pos));
    const definitions = state.env.footnoteDefinitions as Record<string, FootnoteDefinition> | undefined;
    if (!match || !definitions?.[match[1]]) return false;
    if (!silent) {
      const token = state.push("footnote_ref", "sup", 0);
      token.content = match[1]; token.markup = match[0];
      token.meta = { definition: definitions[match[1]], number: (state.env as SyntaxEnvironment).footnoteNumbers?.[match[1]] || match[1] };
    }
    state.pos += match[0].length; return true;
  });
  md.block.ruler.before("paragraph", "toc", (state, startLine, _endLine, silent) => {
    const raw = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]);
    if (!/^\[toc\]$/i.test(raw.trim())) return false;
    if (silent) return true;
    const token = state.push("toc", "nav", 0); token.block = true; token.map = [startLine, startLine + 1]; token.content = raw;
    state.line = startLine + 1; return true;
  }, { alt: ["paragraph"] });
  md.core.ruler.before("inline", "document_definitions", (state) => {
    const env = state.env as SyntaxEnvironment, definitions: Record<string, FootnoteDefinition> = env.fragment ? { ...env.footnoteDefinitions } : {};
    for (const token of state.tokens) if (token.type === "footnote_definition") {
      const id = String(token.meta?.id); definitions[id] = { id, text: token.content, line: (token.map?.[0] || 0) + 1 + (env.lineOffset || 0) };
    }
    state.env.footnoteDefinitions = definitions;
    if (!env.fragment) state.env.footnoteNumbers = {};
  });
  md.core.ruler.after("inline", "footnote_numbers", state => {
    const env = state.env as SyntaxEnvironment, numbers = env.footnoteNumbers || {};
    for (const token of state.tokens) for (const ref of token.children || []) if (ref.type === "footnote_ref") {
      if (!numbers[ref.content]) numbers[ref.content] = Object.keys(numbers).length + 1;
      ref.meta = { ...ref.meta, number: numbers[ref.content] };
    }
    state.env.footnoteNumbers = numbers;
  });
  md.core.ruler.after("inline", "heading_targets", (state) => {
    const env = state.env as SyntaxEnvironment;
    const headings: DocumentHeading[] = [], used = new Map<string, number>();
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type !== "heading_open" || !token.map) continue;
      const text = (state.tokens[i + 1]?.children || []).map(child => ["text", "code_inline", "emoji", "sub", "sup"].includes(child.type) ? child.content : child.type.endsWith("break") ? " " : "").join("");
      const line = token.map[0] + 1 + (env.lineOffset || 0), base = headingSlug(text), count = used.get(base) || 0;
      used.set(base, count + 1);
      const existing = env.fragment ? env.headings?.find(item => item.line === line) : undefined;
      const id = existing?.id || base + (count ? `-${count}` : "");
      token.attrSet("id", id); headings.push({ line, text, id, level: Number(token.tag.slice(1)) });
    }
    if (!state.env.fragment) state.env.headings = headings;
  });
  md.inline.ruler.before("emphasis", "html_embed", (state, silent) => {
    const raw = state.src.slice(state.pos), match = /^(?:<img\b[^>]*>|<(span|a|ruby|abbr|small|b|i|strong|em|code|samp|time|label)\b[^>]*>[\s\S]*?<\/\1>)/i.exec(raw);
    if (!match) return false;
    if (!silent) { const token = state.push("html_embed", "span", 0); token.content = match[0]; token.markup = match[0]; }
    state.pos += match[0].length; return true;
  });
  md.renderer.rules.html_embed = (tokens, index, _options, env) => safeDocumentHtml(tokens[index].content, typeof env?.documentId === "string" ? env.documentId : undefined, false);
  md.inline.ruler.before("emphasis", "safe_inline_html", (state, silent) => {
    const raw = state.src.slice(state.pos), close = /^<\/(u|sub|sup|mark|kbd|span)>/i.exec(raw), open = /^<(u|sub|sup|mark|kbd)>/i.exec(raw), span = /^<span\s+style\s*=\s*(["'])\s*color\s*:\s*(#[0-9a-f]{3,8}|[a-z]+)\s*;?\s*\1\s*>/i.exec(raw);
    const match = close || open || span;
    if (!match || (!close && !raw.toLowerCase().includes(`</${span ? "span" : open![1].toLowerCase()}>`))) return false;
    if (!silent) {
      const tag = span ? "span" : match[1].toLowerCase(), token = state.push(close ? "safe_html_close" : "safe_html_open", tag, close ? -1 : 1);
      token.markup = match[0]; if (span) token.attrSet("style", `color:${span[2]}`);
    }
    state.pos += match[0].length; return true;
  });
  md.renderer.rules.footnote_ref = (tokens, index) => {
    const token = tokens[index], id = md.utils.escapeHtml(token.content), definition = token.meta?.definition as FootnoteDefinition;
    return `<sup class="footnote-reference"><a href="#fn-${encodeURIComponent(token.content)}" data-footnote="${id}" title="${md.utils.escapeHtml(definition.text)}">${md.utils.escapeHtml(String(token.meta?.number))}</a></sup>`;
  };
  md.renderer.rules.footnote_definition = (tokens, index, _options, env) => {
    const token = tokens[index], id = String(token.meta?.id), number = (env as SyntaxEnvironment)?.footnoteNumbers?.[id] || id;
    return `<aside class="footnote-definition" id="fn-${encodeURIComponent(id)}"><span class="footnote-label">${md.utils.escapeHtml(String(number))}.</span> ${md.renderInline(token.content, { ...env, fragment: true })}</aside>\n`;
  };
  md.renderer.rules.toc = (_tokens, _index, _options, env) => {
    const headings = (env as SyntaxEnvironment)?.headings || [];
    return `<nav class="markdown-toc" aria-label="正文目录">${headings.map(heading => `<a href="#${md.utils.escapeHtml(heading.id)}" data-heading-line="${heading.line}" style="padding-left:${(heading.level - 1) * 18}px">${md.utils.escapeHtml(heading.text)}</a>`).join("") || '<span class="toc-empty">添加标题后自动生成目录</span>'}</nav>\n`;
  };
}
