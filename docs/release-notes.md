Open Typora 0.14.0 improves large source documents, theme customization, PDF pagination and Windows Markdown previews.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

| Platform | Recommended | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.14.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.14.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.14.0-linux-x64.deb` | AppImage |

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- **Large documents:** virtualized source edits update only changed ranges; undo history stores deltas rather than entire file snapshots. Large outlines and statistics run in a worker. Fixtures above 5/10 MiB verify editing, undo/redo and exact saved bytes. Files above 300,000 characters still use source mode; the file limit remains 20 MiB.
- **Theme customization:** per-theme fonts, line height, width, paragraph spacing and colors; live CSS, print-only CSS, reset and CSS export. Settings persist across restarts. Existing CSS imports and personal backgrounds remain available.
- **Pagination:** manual pagebreak comments, H1/H2 chapter breaks, paragraph keep-together, widow/orphan counts and repeated table headers. macOS adds explicit CSS break-after handling and repeated continuation headers. Windows/Linux now print a separate portable document and honor the requested paper, margins and theme.
- **Windows preview:** an opt-in native Markdown preview handler for Everything and File Explorer, with WebView2 rendering. Supports read-only file/stream initialization, offline Markdown/math/diagrams and in-folder images; blocks remote resources and plugins, and caps reads at 1 MiB. Images require a filename from the host; the tested Everything 1.4 stream path shows explanatory text for unresolved local images. Disabling or uninstalling restores the previous handler. Requires WebView2 Runtime.
- **Recovery:** normal Electron window close waits for the latest recovery record, avoiding a stale revision and false disk conflict after recent saves.

## Validation and limits

Unit tests cover Unicode/CRLF delta history and randomized edits. Native WebKit integration exercises existing editing, IME-event, plugin and conversion paths plus large-source worker analysis and actual PDF contents. Desktop installation acceptance checks large-file editing, theme persistence and PDFs; Windows also exercises the registered COM handler and actual Everything 1.4.1.1032 preview pane. PDF samples check explicit/chapter/CSS page boundaries and table rows without omissions or duplicates.

Linux validation uses Ubuntu 22.04, DEB upgrade/install/uninstall and the extracted AppImage payload. Real FUSE mounting and a complete Kubuntu 26.04 desktop remain unverified. Physical Windows/Linux IME candidates, arbitrary third-party themes/plugins and every complex print layout are not covered. See the [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
