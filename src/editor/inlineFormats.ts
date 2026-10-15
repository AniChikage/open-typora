export interface InlineFormat { from: number; to: number; open: string; close: string }
export function clearInlineFormats(text: string, from: number, to: number, formats: InlineFormat[]) {
  const edits: { from: number; to: number; text: string; order: number }[] = [];
  for (const format of formats) {
    const start = format.from + format.open.length, end = format.to - format.close.length;
    const left = Math.max(start, from), right = Math.min(end, to);
    if (left >= right) continue;
    if (left === start) edits.push({ from: format.from, to: start, text: "", order: 0 });
    else edits.push({ from: left, to: left, text: format.close, order: format.to - format.from });
    if (right === end) edits.push({ from: end, to: format.to, text: "", order: 0 });
    else edits.push({ from: right, to: right, text: format.open, order: format.from - format.to });
  }
  edits.sort((a, b) => a.from - b.from || a.order - b.order);
  let result = "", at = 0;
  for (const edit of edits) { if (edit.from < at) continue; result += text.slice(at, edit.from) + edit.text; at = edit.to; }
  result += text.slice(at);
  const map = (position: number) => position + edits.reduce((delta, edit) => edit.to <= position ? delta + edit.text.length - (edit.to - edit.from) : delta, 0);
  return { text: result, from: map(from), to: map(to) };
}
