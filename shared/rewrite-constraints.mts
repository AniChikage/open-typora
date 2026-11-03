import MarkdownIt from 'markdown-it';
export interface RewriteConstraints { numbers: boolean; links: boolean; code: boolean; terms: string[] }
export interface ConstraintViolation { kind: 'numbers' | 'links' | 'code' | 'terms'; removed: string[]; added: string[] }
export const defaultConstraints: RewriteConstraints = { numbers: true, links: true, code: true, terms: [] };
const parser = new MarkdownIt({ html: true, linkify: true });
function protectedParts(text: string) {
  const links: string[] = [], code: string[] = [];
  for (const block of parser.parse(text, {})) {
    if (block.type === 'fence' || block.type === 'code_block') code.push(block.info + '\n' + block.content);
    for (const token of block.children || []) {
      if (token.type === 'code_inline') code.push(token.content);
      if (token.type === 'image') links.push(String(token.attrGet('src') || ''));
      if (token.type === 'link_open') links.push(String(token.attrGet('href') || ''));
    }
  }
  // Include unused reference destinations and raw HTML image/link attributes.
  for (const match of text.matchAll(/^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^>\n]+>|\S+)/gm)) links.push(match[1].replace(/^<|>$/g, ''));
  for (const match of text.matchAll(/<(?:a|img|video|audio|source)\b[^>]*?\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) links.push(match[1] ?? match[2]);
  return { links, code };
}
function numbers(text: string) {
  const dates = Array.from(text.matchAll(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\d{2,4}年\d{1,2}月\d{1,2}日?|\b\d{1,2}:\d{2}(?::\d{2})?\b|(?:周|星期|礼拜)[一二三四五六日天]|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December)\b/giu), match => match[0]);
  return dates.concat(Array.from(text.matchAll(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[%％]|[ \t]*(?:USD|CNY|RMB|EUR|GBP|MiB|GiB|MB|GB|KB|kg|km|ms|万元|亿元|万|亿|元|美元|年|月|日|天|小时|分钟|秒|个|人|页|次))?/gu), match => match[0]));
}
function difference(before: string[], after: string[]) {
  const counts = new Map<string, number>();
  for (const value of before) counts.set(value, (counts.get(value) || 0) + 1);
  const added: string[] = [];
  for (const value of after) { const count = counts.get(value) || 0; if (count) counts.set(value, count - 1); else added.push(value); }
  return { removed: [...counts].flatMap(([value, count]) => Array.from({ length: count }, () => value)), added };
}
export function constraintViolations(before: string, after: string, constraints: RewriteConstraints): ConstraintViolation[] {
  const a = protectedParts(before), b = protectedParts(after), result: ConstraintViolation[] = [];
  for (const kind of ['numbers', 'links', 'code', 'terms'] as const) {
    if (kind !== 'terms' && !constraints[kind]) continue;
    const terms = [...new Set(constraints.terms.map(term => term.trim()).filter(Boolean))].slice(0, 50);
    const occurrences = (text: string) => terms.flatMap(term => Array.from({ length: text.split(term).length - 1 }, () => term));
    const change = difference(kind === 'numbers' ? numbers(before) : kind === 'terms' ? occurrences(before) : a[kind], kind === 'numbers' ? numbers(after) : kind === 'terms' ? occurrences(after) : b[kind]);
    if (change.removed.length || change.added.length) result.push({ kind, ...change });
  }
  return result;
}
export function constraintInstruction(value: RewriteConstraints) {
  const terms = [...new Set(value.terms.map(term => term.trim()).filter(Boolean))].slice(0, 50);
  const rules = [value.numbers && 'Preserve every number, date and unit exactly, including occurrence counts.', value.links && 'Preserve every link and image destination exactly.', value.code && 'Preserve all fenced and inline code exactly.', terms.length && 'Preserve these exact terms and their occurrence counts: ' + JSON.stringify(terms) ].filter(Boolean);
  return rules.length ? '\nPreservation constraints (the user must change these settings to permit changes):\n' + rules.join('\n') : '';
}
