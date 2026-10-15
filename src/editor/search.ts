export interface SearchOptions { regex: boolean; caseSensitive: boolean; wholeWord: boolean }
export interface TextMatch { from: number; to: number; replacement: string }
export function textMatches(text: string, query: string, replacement: string, options: SearchOptions): TextMatch[] {
  if (!query) return [];
  let pattern = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (options.wholeWord) pattern = `(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`;
  const expression = new RegExp(pattern, options.caseSensitive ? "gmu" : "gmiu"), result: TextMatch[] = [];
  for (const match of text.matchAll(expression)) {
    const substitute = options.regex ? replacement.replace(/\$(\$|&|`|'|<([^>]+)>|\d{1,2})/g, (raw, group: string, named: string) => {
      if (group === "$") return "$";
      if (group === "&") return match[0];
      if (group === "`") return text.slice(0, match.index);
      if (group === "'") return text.slice(match.index + match[0].length);
      if (named) return match.groups?.[named] ?? "";
      const index = Number(group); if (index > 0 && index < match.length) return match[index] || "";
      if (group.length === 2 && Number(group[0]) > 0 && Number(group[0]) < match.length) return (match[Number(group[0])] || "") + group[1];
      return raw;
    }) : replacement;
    result.push({ from: match.index, to: match.index + match[0].length, replacement: substitute });
  }
  return result;
}
export function replaceTextMatches(text: string, matches: TextMatch[]) {
  let result = "", from = 0;
  for (const match of matches) { result += text.slice(from, match.from) + match.replacement; from = match.to; }
  return result + text.slice(from);
}
