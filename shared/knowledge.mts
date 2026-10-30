import type { AIContext, ContextDocument } from './contracts.js';

export const contextFileBytes = 2 * 1024 * 1024;
export const contextTotalBytes = 30 * 1024 * 1024;
export const contextTextLimit = 48_000;
export const evidenceLimit = 8;
export interface Evidence extends AIContext { token: string; path: string | null; hash: string; fromLine: number; toLine: number }
export interface CitedAnswer { answer: string; insufficient: boolean; citations: { sourceId: string; quote: string }[] }

const stop = new Set('a an and are as at be by can did do does for from had has have how i in is it its of on or that the their this to was were what when where which who why with would you your please 的 了 是 在 和 与 及 我 你 他 她 它 我们 什么 怎么 如何 为什么 哪些 请 帮我 一下'.split(' '));
export function searchTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const word of query.toLocaleLowerCase().normalize('NFKC').match(/[\p{L}\p{N}_-]+/gu) || []) {
    if (stop.has(word)) continue;
    if (/\p{Script=Han}/u.test(word)) {
      const chars = Array.from(word); for (let i = 0; i + 1 < chars.length; i++) { const token = chars[i] + chars[i + 1]; if (!stop.has(token)) terms.add(token); }
      if (chars.length === 1 && !stop.has(word)) terms.add(word);
    } else if (word.length > 1) terms.add(word);
  }
  return [...terms].slice(0, 80);
}
export function selectEvidence(documents: ContextDocument[], query: string, explicit = false): Evidence[] {
  const terms = searchTerms(query); let candidates: { source: ContextDocument; text: string; start: number; end: number; score: number }[] = [];
  for (const source of documents) {
    const lines = source.content.replace(/\r\n?/g, '\n').split('\n');
    const chunks: { text: string; start: number; end: number }[] = [];
    let from = 0;
    while (from < lines.length) {
      if (lines[from].length > 2600) {
        // Search every part of huge minified/code lines; never silently drop their tail.
        for (let offset = 0; offset < lines[from].length; offset += 2400) chunks.push({ text: lines[from].slice(offset, offset + 2600), start: from + 1, end: from + 1 });
        from++; continue;
      }
      let to = from, length = 0;
      while (to < lines.length && to - from < 32 && length + lines[to].length < 2600) { length += lines[to].length + 1; to++; }
      if (to === from) to++;
      chunks.push({ text: lines.slice(from, to).join('\n'), start: from + 1, end: to });
      if (to >= lines.length) break;
      from = Math.max(from + 1, to - 3);
    }
    const name = source.name.toLocaleLowerCase().normalize('NFKC');
    for (const chunk of chunks) {
      const lower = chunk.text.toLocaleLowerCase().normalize('NFKC');
      let score = 0, matched = 0;
      for (const term of terms) {
        const count = lower.split(term).length - 1;
        if (count || name.includes(term)) matched++;
        score += Math.min(count, 6) + (name.includes(term) ? 5 : 0);
      }
      score += matched * 3;
      if (chunk.text.trim() && (score > 0 || explicit)) candidates.push({ source, ...chunk, score: score || .01 });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.source.name.localeCompare(b.source.name) || a.start - b.start);
  if (explicit) {
    const best = new Set<string>(), first: typeof candidates = [], rest: typeof candidates = [];
    for (const item of candidates) { if (best.has(item.source.token)) rest.push(item); else { best.add(item.source.token); first.push(item); } }
    candidates = first.concat(rest);
  }
  const chosen: typeof candidates = []; let total = 0;
  // Prefer independent pieces of evidence instead of overlapping copies of one paragraph.
  for (const item of candidates) {
    if (chosen.some(other => other.source.token === item.source.token && item.start <= other.end && item.end >= other.start)) continue;
    if (chosen.length >= evidenceLimit || total + item.text.length > contextTextLimit) continue;
    chosen.push(item); total += item.text.length;
  }
  return chosen.map((item, index) => ({ id: 'S' + (index + 1), name: item.source.name, text: item.text, token: item.source.token, path: item.source.path, hash: item.source.hash, fromLine: item.start, toLine: item.end }));
}
function compact(text: string) { return text.replace(/\s+/gu, ' ').trim(); }
export function citedAnswer(text: string, sources: AIContext[]): CitedAnswer {
  let value: unknown;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { throw new Error('回答格式无效，请重新生成；文档未修改。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('回答格式无效，请重新生成；文档未修改。');
  const input = value as Record<string, unknown>;
  if (typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 30_000 || typeof input.insufficient !== 'boolean' || !Array.isArray(input.citations) || input.citations.length > 16) throw new Error('回答或引用格式无效。');
  const known = new Map(sources.map(source => [source.id, source])), citations: CitedAnswer['citations'] = [];
  for (const item of input.citations) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('模型返回了无法核对的引用。');
    const { sourceId, quote } = item as Record<string, unknown>;
    if (typeof sourceId !== 'string' || typeof quote !== 'string' || !quote.trim() || quote.length > 1800 || !known.has(sourceId) || !compact(known.get(sourceId)!.text).includes(compact(quote))) throw new Error('模型引用不在已发送的原文片段中，结果未写入文档。');
    if (!citations.some(citation => citation.sourceId === sourceId && citation.quote === quote)) citations.push({ sourceId, quote });
  }
  const insufficient = input.insufficient === true;
  if (!insufficient && !citations.length) throw new Error('回答没有提供可核对的原文引用，请重新生成。');
  const referenced = [...input.answer.matchAll(/\[(S\d+)\]/g)].map(match => match[1]);
  if (referenced.some(id => !citations.some(citation => citation.sourceId === id)) || (!insufficient && !referenced.length)) throw new Error('回答中的引用编号无法核对，请重新生成。');
  return { answer: input.answer, insufficient, citations };
}
export function answerMarkdown(value: CitedAnswer, sources: Evidence[], prefix: string, targetPath?: string | null): string {
  const used = new Map<string, number>();
  const body = value.answer.replace(/\[(S\d+)\]/g, (_, id: string) => { if (!used.has(id)) used.set(id, used.size + 1); return '[^' + prefix + '-' + used.get(id) + ']'; });
  const footnotes = [...used].map(([id, number]) => {
    const source = sources.find(item => item.id === id)!;
    let label = source.name.replace(/[\r\n]/g, ' ').replace(/[\[\]\\]/g, '\\$&');
    if (targetPath && source.path && targetPath.replace(/\\/g, '/').split('/')[0].toLowerCase() === source.path.replace(/\\/g, '/').split('/')[0].toLowerCase()) {
      const a = targetPath.replace(/\\/g, '/').split('/').slice(0, -1), b = source.path.replace(/\\/g, '/').split('/');
      while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
      const relative = [...a.map(() => '..'), ...b].join('/');
      if (relative && !/^[A-Za-z]:/.test(relative)) label = '[' + label + '](' + encodeURI(relative).replace(/[()#?]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + ')';
    }
    return '[^' + prefix + '-' + number + ']: ' + label + ', L' + source.fromLine + '–' + source.toLine + '. ' + value.citations.filter(citation => citation.sourceId === id).map(citation => citation.quote.replace(/\s+/gu, ' ').replace(/[\\`*_[\]<>!()]/g, '\\$&')).join(' ');
  });
  return body + (footnotes.length ? '\n\n' + footnotes.join('\n') : '');
}
