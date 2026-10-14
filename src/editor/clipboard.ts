import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import DOMPurify from "dompurify";
const converter = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
converter.use(gfm);
converter.addRule("underline", { filter: "u", replacement: content => `<u>${content}</u>` });
converter.addRule("highlight", { filter: "mark", replacement: content => `==${content}==` });
converter.addRule("subscript", { filter: "sub", replacement: content => `~${content}~` });
converter.addRule("superscript", { filter: "sup", replacement: content => `^${content}^` });
export function htmlToMarkdown(html: string) {
  // Clipboard HTML is inert before conversion; active/embed content is discarded.
  const safe = DOMPurify.sanitize(html, { FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"] });
  return converter.turndown(safe).trim();
}
