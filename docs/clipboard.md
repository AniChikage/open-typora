# Spreadsheet clipboard paste

Copy a selected cell range in Excel, WPS or another spreadsheet application, then paste normally into the live editor or source mode. The editor creates an editable Markdown table; the first copied row becomes its header. A paste is one undo/redo transaction.

HTML table data is preferred to the screenshot that Office applications may also put on the clipboard. If only tab-separated text is available, quoted cells, doubled quotes, embedded tabs/newlines and empty cells are parsed as a grid. Ordinary multiline text without a column delimiter stays text. Pasting a screenshot without table data still inserts an image.

Merged HTML cells are flattened: their value stays in the top-left cell, and covered cells become empty. Markdown does not have merged cells. Literal pipes are escaped and cell line breaks become `<br>`. Spreadsheet fonts, colors, column widths, formulas and macros are not imported as workbook features; this pastes the copied cell contents, not an XLSX file.

In an existing live table, paste starts at the current cell and fills/expands its grid. HTML merged-cell expansion and bulk table reconstruction have a one-million-cell budget; an oversized operation is refused rather than partially pasted. Distant virtualized rows use their source positions; a range that fits the existing dimensions replaces only the affected source lines. Code fences keep literal clipboard text. Use **Paste as Plain Text** (Cmd/Ctrl+Shift+V) to bypass automatic table conversion elsewhere.

Automated acceptance covers the native WebKit and Electron renderers, HTML plus an image alternative, quoted TSV, merged and blank cells, source/code behavior, exact saves/recovery and undo/redo. Individual Office/WPS versions and operating-system clipboard formats can differ; a successful test on one combination is not universal coverage.
