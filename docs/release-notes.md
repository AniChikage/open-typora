Open Markdown Lane 0.24.2 fixes repeated Enter in rendered editing and missing-file dialog storms.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Fixes

- **[#16](https://github.com/AniChikage/open-markdown-lane/issues/16):** Keep empty paragraphs created by repeated Enter visible after typing, moving the caret and switching source modes. Normal paragraph separators remain unchanged; Markdown/CRLF preservation and undo/redo are covered.
- **[#17](https://github.com/AniChikage/open-markdown-lane/issues/17):** Batch startup, file-association and native open-file requests. Missing or unreadable files produce an aggregate, non-modal notice while readable files continue opening. Existing recovery drafts are retained; the fix does not silently delete missing-file tabs or unsaved text.

## Downloads

- macOS 14+, Apple Silicon: DMG or ZIP.
- Windows 10/11 x64: Setup.exe or ZIP.
- Linux x64: DEB or AppImage.

Verify the six packages with `SHA256SUMS.txt`. macOS is locally signed, not notarized; Windows is unsigned. macOS may request Documents-folder access again after an update.

## Validation

The regression fixture opens 35 missing files plus a readable file, checks that no per-file native error dialogs appear, and verifies all 35 unsaved recovery records remain intact. Empty-paragraph tests cover rendered positions, source roundtrip, exact save and undo/redo in Chromium and native WebKit. The Windows/Linux installer acceptance suites include the new regression. Platform results and remaining limits are recorded in [verification](https://github.com/AniChikage/open-markdown-lane/blob/main/docs/verification.md).
