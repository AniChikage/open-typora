# Printing and PDF pagination

Preferences provides A4/Letter paper, margins in points, header/footer templates, H1/H2 chapter breaks, paragraph keep-together, repeated table headers and widow/orphan counts (2–5 lines). Page variables include the existing title and page-number options shown in Preferences.

Use **段落 → 插入分页符** to insert this portable Markdown comment:

```markdown
<!-- pagebreak -->
```

The editor shows a labelled divider. HTML printing and PDF start the following content on a new page; the label is not printed. The source comment remains in the file.

For finer rules, open **自定义当前主题 → 打印专用 CSS**:

```css
.print-document h2 { break-before: page; }
.print-document .appendix { break-after: page; }
.print-document blockquote { break-inside: avoid; }
```

The native macOS exporter measures text lines, blocks and table rows, then composes vector PDF pages. Windows/Linux print a separate portable document through Chromium, so application controls are not printed and requested paper/margins are passed to the PDF engine. Both use the exported theme and print CSS.

Content taller than a usable page must split. Complex nested tables, oversized rows and every third-party CSS layout are not covered; print engines can choose different line wrapping. The acceptance suites inspect actual PDF page sizes, explicit/chapter/CSS boundaries, row counts and continuation headers, plus visual samples. Keep a copy of the generated PDF when reporting a pagination issue.
