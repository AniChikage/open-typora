Open Typora 0.17.0 adds context menus for document tabs, text and tables, with safe grouped closing and precise editing targets.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

| Platform | Recommended | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.17.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.17.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.17.0-linux-x64.deb` | AppImage |

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- **Tab context menu:** save, Save As, save all, close left/right/other/saved/all tabs, and save-and-close all. Copy file names and paths, reveal a file, open its containing folder, rename it, split editing panes and open the outline. Actions target the clicked tab even when another document is active.
- **Safe grouped closing:** collect all save/discard/cancel decisions before removing any tab. Cancelling a prompt or Save As keeps the whole group open. Unsaved untitled drafts are excluded from the saved-tabs group. The file-operation lock only releases a preparation it owns.
- **Text context menu:** cut, copy, paste, paste as plain text, copy Markdown, select all, undo/redo, find, formatting, paragraph and insert commands, and source/live mode. Desktop paste uses the existing system editing path, retaining HTML, image and table handling.
- **Table context menu:** insert, delete and move rows/columns; set alignment, format the source or remove the table. Operations resolve the clicked cell's source position, including virtualized tables and inactive split panes. Header-row deletion and out-of-range movement are disabled.
- **Keyboard and themes:** Shift+F10 opens menus; arrow keys navigate items and submenus; Escape restores focus and the selection. Menus follow the current light/dark theme, scroll in short windows and keep submenus within the viewport. Read-only mode disables changes; active composition cannot be interrupted by opening a context menu.

Requested in [Issue #3](https://github.com/AniChikage/open-typora/issues/3). The implementation is part of the editor; no extra plugin is required.

## Validation and limits

Acceptance exercises actual menus, system clipboard, exact file saves, undo, background-tab rename, grouped-close cancellation, cancelled Save As, reopening, read-only plugins, Chinese composition, split panes and a virtualized 12,000-row table. Native WebKit separately verifies menus and the AppKit clipboard. Installed Windows/Linux suites run the context-menu acceptance alongside the existing large-file, encoding, conversion, PDF and recovery checks.

All cross-application clipboard formats and physical IMEs have not been exhaustively tested. Browser clipboard operations depend on browser permissions. Files still load in memory; complex table-wide changes and plugins can remain expensive. Linux CI uses Ubuntu 22.04 and an extracted AppImage payload, without a new full Kubuntu 26.04 or real FUSE acceptance pass. See the [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
