Open Typora 0.9.0 adds selection commands, cross-platform image management, and more complete document imports.

> **Independent, unofficial project. Open Typora is not developed, endorsed or supported by Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.**

## Downloads

| Platform | Installer | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.9.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.9.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.9.0-linux-x64.deb` | AppImage |

`SHA256SUMS.txt` covers all six downloads.

## Changes

- Cmd/Ctrl+D selects a word; Cmd/Ctrl+Shift+D deletes it in one undoable edit. Chinese words and inline formatting boundaries are handled without consuming surrounding syntax.
- Cmd/Ctrl+L selects a line or table row, Cmd/Ctrl+E expands a formatting scope or selects a table cell, and Cmd/Ctrl+J scrolls back to the selection. Source and local code views support word/line selection and navigation; source scopes follow the syntax tree. Selection remains available in read-only mode.
- Windows/Linux now support local image copy, move, rename and Trash operations, bulk copy/move, and HTTP image downloads. Existing destination files are never overwritten. Failed batch copies roll back their new files before any originals are moved.
- Windows/Linux DOCX, ODT and EPUB imports extract embedded media into persistent local storage. Saved imported documents retain their images after restart.
- Legacy DOC/RTF import on Windows/Linux uses optional LibreOffice plus Pandoc. Preferences reports detected converters and explains missing dependencies. macOS retains its native conversion path.
- Pandoc imports avoid its newer GitHub-specific math syntax so formulas render in the editor. Double-dollar formulas inside paragraphs retain the following text; HTML local images and portable export use the document resource bridge.
- Both READMEs prominently identify this as unofficial and link to the official Typora purchase page.

## Validation and limits

The release workflow runs real Pandoc/LibreOffice DOC/RTF/DOCX/ODT/EPUB conversions, then exercises imports and embedded images in the installed Windows application, installed Ubuntu 22.04 DEB and extracted AppImage payload. It also verifies image copy/download/move and document restart, alongside existing editing, export, recovery, theme, plugin and installer checks. Native AppKit/WebKit and Chromium regressions run locally on macOS.

Converters are optional and are not bundled. Import can change formatting; retain original documents. WMF/EMF images require conversion to PNG/JPEG. AppImage FUSE mounting, other Linux desktops and physical input-method candidates on Windows/Linux remain unverified. Windows builds are unsigned; macOS is ad hoc signed and not Apple-notarized. Full Typora feature, plugin and behavior parity is still in progress; see [the checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
