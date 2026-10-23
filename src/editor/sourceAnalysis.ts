// Linear source analysis used off the UI thread for large documents.
export interface SourceAnalysis {
  headings: { line: number; level: number; text: string; id: string }[];
  characters: number; compactCharacters: number; lines: number; words: number;
  minutes: number; selected: boolean; truncated: boolean; approximate: boolean;
}
export function analyzeSource(source: string, readingSpeed = 200): SourceAnalysis {
  let characters = 0, compactCharacters = 0, words = 0, inWord = false;
  for (const character of source) {
    characters++;
    if (/\s/u.test(character)) { inWord = false; continue; }
    compactCharacters++;
    if (/\p{Script=Han}/u.test(character)) { words++; inWord = false; }
    else if (/[\p{L}\p{N}]/u.test(character)) { if (!inWord) words++; inWord = true; }
    else if (!/[’']/u.test(character)) inWord = false;
  }
  const headings: SourceAnalysis['headings'] = [], slugs = new Map<string, number>();
  let line = 0, previous = '', fence = '', fenceSize = 0, frontmatter = false, truncated = false, comment = false;
  for (const match of source.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!match[0] && match.index === source.length) break;
    const text = match[0].replace(/\r?\n$/, ''); line++;
    if (line === 1 && text === '---') { frontmatter = true; continue; }
    if (frontmatter) { if (/^(---|\.\.\.)$/.test(text)) frontmatter = false; continue; }
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(text);
    if (marker) {
      if (!fence) { fence = marker[1][0]; fenceSize = marker[1].length; }
      else if (marker[1][0] === fence && marker[1].length >= fenceSize && /^ {0,3}(?:`+|~+)\s*$/.test(text)) fence = '';
      previous = ''; continue;
    }
    if (fence) continue;
    if (comment || text.includes('<!--')) { comment = !text.includes('-->'); previous = ''; continue; }
    const atx = /^ {0,3}(#{1,6})(?:\s+|$)(.*)/.exec(text);
    const setext = previous.trim() && /^ {0,3}(=+|-+)\s*$/.exec(text);
    if (atx || setext) {
      const title = (atx ? atx[2].replace(/\s+#+\s*$/, '') : previous).replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').trim();
      const slug = title.toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s+/g, '-') || 'section';
      const count = slugs.get(slug) || 0; slugs.set(slug, count + 1);
      if (headings.length < 2000) headings.push({ line: atx ? line : line - 1, level: atx ? atx[1].length : setext![1][0] === '=' ? 1 : 2, text: title, id: count ? `${slug}-${count}` : slug });
      else truncated = true;
      previous = '';
    } else previous = text;
  }
  return { headings, characters, compactCharacters, lines: source ? line + (source.endsWith('\n') ? 1 : 0) : 0, words, minutes: Math.max(1, Math.ceil(words / readingSpeed)), selected: false, truncated, approximate: true };
}
