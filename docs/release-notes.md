Open Typora 0.16.1 improves giant code/table editing and removes the old 20 MiB Markdown limit.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

| Platform | Recommended | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.16.1-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.16.1-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.16.1-linux-x64.deb` | AppImage |

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- **Giant code blocks:** compact source-position maps replace per-character arrays. Code bodies above 100,000 characters use bounded CodeMirror viewports before and during editing, with exact source offsets and delta updates. Cursor tracking no longer scans the whole block. Large blocks omit syntax highlighting and soft wrapping.
- **Large tables:** visible rows mount in an inner viewport with a sticky header. Unchanged rows retain their DOM, the tail stays anchored while heights settle, and Tab uses logical rows across the viewport. Adding/removing/moving rows updates a local source range. Regular top-level pipe tables avoid indexing every inline cell token.
- **Table caret stability:** viewport refreshes retain the selected row and focus the correct editing host. Tab-created empty cells keep their caret; typing no longer lands before the table and triggers a full paragraph render. Acceptance checks the exact appended row and its latency.
- **Larger Markdown files:** removes the fixed 20 MiB rejection from open, encoding/save, drafts and recovery on macOS and Electron. The full source remains in memory; there is no unlimited-size guarantee.
- Existing plugins, themes, lossless Markdown, source mode, tabs, split panes, printing and complete Windows previews remain available.

## Validation and limits

Desktop acceptance opens a 36,260,060-byte code file and an 80,000-row table, verifies bounded rendered DOM, Chinese Chromium composition, single undo, exact saved bytes and large-file recovery after restart. Native tests cover 32 MiB open/save/recovery, UTF-16 output over 64 MiB and WebKit giant-block rendering. Installed Windows/Linux suites also retain the existing editing, plugin, conversion, PDF, upgrade and uninstall regressions. Actual Everything 1.4 previews remain a separate Windows acceptance gate.

Available memory, runtime string/IPC limits, initial parsing and concurrent large tabs still bound file sizes. Complex cells, footnote-bearing/irregular tables and nested syntax may need full parsing and remain slower. Converted imports and media retain their separate budgets. Chromium event tests do not substitute for every physical IME. Linux acceptance uses Ubuntu 22.04 and the extracted AppImage payload; real FUSE mounting and this version on a complete Kubuntu 26.04 desktop remain unverified. See [performance](https://github.com/AniChikage/open-typora/blob/main/docs/performance.md) and the [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
