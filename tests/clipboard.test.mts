import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><body></body>");
for (const key of ["window", "document", "Node", "DOMParser"]) Reflect.set(globalThis, key, Reflect.get(dom.window, key));
const { clipboardTable, tsvGrid, tableMarkdown, tablePasteBlock, htmlToMarkdown } = await import("../src/editor/clipboard.ts");
const data = (plain: string, html = "") => ({ getData: (type: string) => type === "text/html" ? html : type === "text/plain" ? plain : "" });

test("quoted TSV preserves embedded tabs, CRLF, quotes and a trailing empty column", () => {
  assert.deepEqual(tsvGrid('A\tB\t\r\n"a\tb"\t"first\r\nsecond"\t"say ""hi"""\r\n'), [["A", "B", ""], ["a\tb", "first\r\nsecond", 'say "hi"']]);
});
test("TSV terminal line ending is not a row, but a selected empty row is retained", () => {
  assert.deepEqual(tsvGrid('A\tB\r\n\t\r\n'), [["A", "B"], ["", ""]]);
  assert.deepEqual(tsvGrid('\t'), [["", ""]]);
  assert.deepEqual(tsvGrid('A\tB\n'), [["A", "B"]]);
});
test("ordinary multiline text and malformed quoted text use the normal paste path", () => {
  for (const value of ['one\ntwo', '"a\tb"', '"unfinished\tvalue', '"quoted"suffix\tother']) assert.equal(tsvGrid(value), null);
});
test("spreadsheet plain values do not become Markdown formatting or HTML", () => {
  const grid=tsvGrid('**literal**\t<script>alert(1)</script>\t&amp;\tA|B\t=literal');
  assert.ok(grid); const source=tableMarkdown(grid);
  assert.ok(source.includes('\\*\\*literal\\*\\*'));
  assert.ok(source.includes('&lt;script&gt;'));
  assert.ok(source.includes('&amp;amp;'));
  assert.ok(source.includes('A\\|B'));
});
test("HTML tables without th, including a single column, convert to GFM tables", () => {
  const html='<table><tr><td>Name</td></tr><tr><td>Chinese 中文</td></tr></table>';
  assert.deepEqual(clipboardTable(data('',html))?.cells, [["Name"],["Chinese 中文"]]);
  assert.equal(htmlToMarkdown(html), '| Name |\n| --- |\n| Chinese 中文 |');
});
test("rowspan zero and colspan keep the original cell positions", () => {
  const html='<table><tr><td>Key</td><td colspan="2">Values</td></tr><tr><td rowspan="0">Group</td><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>';
  assert.deepEqual(clipboardTable(data('',html))?.cells, [["Key","Values",""],["Group","A","1"],["","B","2"]]);
});
test("general rich HTML retains its surrounding paragraphs and table", () => {
  const html='<p>Before</p><table><tr><td>A</td><td>B</td></tr><tr><td>X</td><td>Y</td></tr></table><p>After</p>';
  assert.equal(clipboardTable(data('A\tB\nX\tY',html)),null);
  assert.equal(htmlToMarkdown(html),'Before\n\n| A | B |\n| --- | --- |\n| X | Y |\n\nAfter');
});
test("rich code with tabs remains a code paste, while ordinary TSV is recognized", () => {
  assert.equal(clipboardTable(data('a\tb','<pre><code>a\tb</code></pre>')),null);
  assert.deepEqual(clipboardTable(data('a\tb'))?.cells,[["a","b"]]);
});
test("table conversion sanitizes active HTML and preserves inline formatting and breaks", () => {
  const html='<table><tr><td><strong>Header</strong></td><td>Other</td></tr><tr><td onclick="alert(1)"><em>line</em><br>second<script>alert(1)</script></td><td><a href="javascript:alert(1)">safe text</a></td></tr></table>';
  const table=clipboardTable(data('',html));assert.ok(table);const grid=table.cells;
  const text=tableMarkdown(grid);assert.ok(text.includes('**Header**'));
  assert.ok(text.includes('*line*<br>second'));assert.ok(!text.includes('alert(1)'));assert.ok(!text.includes('onclick'));
});
test("untrusted span expansion is rejected intact instead of allocating a huge grid", () => {
  const html='<table><tr><td colspan="1000">keep</td></tr>'+('<tr><td>x</td></tr>').repeat(1000)+'</table>';
  assert.equal(clipboardTable(data('',html)),null);
  assert.ok(htmlToMarkdown(html).includes('keep'));
});
test("table insertion creates block boundaries without extra blank lines", () => {
  assert.equal(tablePasteBlock('TABLE','Before after',7,7),'\n\nTABLE\n\n');
  assert.equal(tablePasteBlock('TABLE','Before\n\nafter',8,8),'TABLE\n\n');
  assert.equal(tablePasteBlock('TABLE','',0,0),'TABLE');
  assert.equal(tablePasteBlock('TABLE','replace',0,7),'TABLE');
});

test("HTML header alignment survives the spreadsheet conversion", () => {
  const html='<table><tr><th align="right">A</th><th style="text-align:center">B</th></tr><tr><td>1</td><td>2</td></tr></table>';
  const table=clipboardTable(data('',html));assert.ok(table);
  assert.equal(tableMarkdown(table.cells,table.align),'| A | B |\n| ---: | :---: |\n| 1 | 2 |');
  assert.equal(htmlToMarkdown(html),'| A | B |\n| ---: | :---: |\n| 1 | 2 |');
});
test("ragged tab-indented text is not mistaken for a rectangular spreadsheet",()=>{
  assert.equal(tsvGrid('if\tcondition\n\treturn\tvalue'),null);
});
