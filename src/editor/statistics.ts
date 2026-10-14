import { renderMarkdown } from "./markdown.ts";
export function documentStatistics(source: string, selected?: string, readingSpeed = 200) {
  const text = selected ?? source;
  const html = renderMarkdown(text).replace(/<\/(?:p|h[1-6]|li|tr|pre|blockquote|aside)>/g, "$&\n").replace(/<\/(?:td|th)>/g, "$& ");
  const body = new DOMParser().parseFromString(html, "text/html").body;
  body.querySelectorAll(".markdown-toc,.footnote-label,.footnote-reference").forEach(element => element.remove());
  const plain = body.textContent || "";
  const chinese = plain.match(/\p{Script=Han}/gu)?.length || 0;
  const nonChinese = plain.replace(/\p{Script=Han}/gu, " ");
  const words = chinese + [...new Intl.Segmenter("en", { granularity: "word" }).segment(nonChinese)].filter(segment => segment.isWordLike).length;
  return { words, characters: Array.from(text).length, compactCharacters: Array.from(text.replace(/\s/g, "")).length, lines: text ? text.split(/\r?\n/).length : 0, minutes: Math.max(1, Math.ceil(words / readingSpeed)), selected: selected !== undefined };
}
