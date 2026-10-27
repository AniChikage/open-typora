Open Typora 0.19.0 adds spreadsheet clipboard paste (Issue #5).

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.19.0-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.19.0-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.19.0-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- Copy a cell range from Excel or WPS and paste it into a document to create an editable Markdown table. Both live editing and source mode recognize HTML tables and tab-separated text. The copied first row becomes the Markdown header.
- Spreadsheet HTML takes precedence over the screenshot that Office applications also place on the clipboard. Plain image paste keeps its existing behavior.
- Blank cells, literal pipes, quoted tabs and multiline cell values retain their positions. Merged HTML cells expand into a rectangular grid with empty covered cells, since Markdown tables do not support merged cells.
- Pasting into an existing live table uses the same parser. A paste remains one undo/redo transaction; code fences retain literal spreadsheet text, and Paste as Plain Text bypasses table conversion.
- The old 100-row/30-column grid-paste restriction is removed. Bulk expansion uses a one-million-cell resource budget; existing large tables can still receive smaller edits without reconstruction.
- Pasting into a distant virtualized table row now uses its actual source row, preventing writes to an earlier visible row. A range that fits the existing dimensions updates only the affected lines.
- Regression coverage includes native WebKit, the real desktop clipboard, file/recovery bytes and the Windows/Linux installer acceptance workflows.

See [clipboard behavior](https://github.com/AniChikage/open-typora/blob/main/docs/clipboard.md) for supported inputs and boundaries. This release does not claim complete Typora feature parity or every Office/WPS, IME, or Linux desktop combination. Updates preserve documents, preferences and recovery data.
