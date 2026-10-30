import english from './en.json' with { type: 'json' };
export type Locale = 'zh-CN' | 'en';
const catalog: Readonly<Record<string, string>> = english;
const templates = Object.entries(catalog).filter(([key]) => key.includes('{0}')).sort((a, b) => b[0].length - a[0].length).map(([key, value]) => ({
  pattern: new RegExp('^' + key.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? '([\\s\\S]*?)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$'), value,
}));
export function translate(locale: string, source: string, ...values: (string | number)[]): string {
  const trimmed = source.trim();
  let result = locale === 'en' ? catalog[source] ?? (catalog[trimmed] ? source.slice(0, source.indexOf(trimmed)) + catalog[trimmed] + source.slice(source.indexOf(trimmed) + trimmed.length) : source) : source;
  if (locale === 'en' && result === source && !catalog[source] && /[\u3400-\u9fff]/u.test(source)) {
    for (const { pattern, value } of templates) {
      const match = source.match(pattern);
      if (match) { result = value.replace(/\{(\d+)\}/g, (_, index: string) => { const part = match[Number(index) + 1] || ''; return catalog[part] || part; }); break; }
    }
  }
  return result.replace(/\{(\d+)\}/g, (match, index: string) => values[Number(index)] === undefined ? match : String(values[Number(index)]));
}
