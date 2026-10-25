Open Typora 0.16.4 improves editing responsiveness in giant code blocks and large tables, and fixes a code-fence parsing bug.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

| Platform | Recommended | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.16.4-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.16.4-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.16.4-linux-x64.deb` | AppImage |

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- **Giant code editing:** ordinary newlines and punctuation now validate the affected lines instead of reparsing the entire block. Block positions and following heading lines stay correct. Removing ordinary text that exposes a closing fence correctly updates the document's structure.
- **Large table editing:** row indexes update from the changed source range. Unchanged visible rows keep their DOM and receive shifted source maps, reducing work during typing and local row operations.
- **Faster deletion:** Backspace and Delete locate the current Unicode grapheme directly, preserving family emoji, flags and combining characters without allocating an array for the whole document prefix. Table escape checks and emoji completion inspect nearby text.
- **Undo after navigation:** arrow, Home/End and page navigation end the rendered editing group immediately. Quick left/right movement followed by Backspace remains a separately undoable edit even when browser selection notifications are coalesced; local code selection changes also close their edit group.
- **Long editing sessions:** compact position shifts combine their offsets rather than growing a chain of callbacks. Retained table rows detach small text spans so they do not hold older giant source strings alive.

## Validation and limits

Acceptance uses an actual 36,260,060-byte UTF-8 code file and an 80,000-row table. It checks Enter and backtick-containing code, Chinese composition, middle/tail Backspace, complete emoji deletion, local row insertion, exact saved bytes, undo and recovery after restart. Unit tests compare incremental indexes and block boundaries with fresh parsing, and verify retained row identity and 25,000 position shifts. Native WebKit separately checks giant-block editing and persisted recovery content. Installed Windows/Linux suites retain plugin, encoding, conversion, PDF, upgrade and uninstall checks; native Everything 1.4 preview has its own gate.

Files still load in memory. Large code blocks omit syntax highlighting and soft wrapping. Complex/footnote-bearing tables, initial parsing, column-wide changes, plugins and concurrent large tabs can remain expensive. Automated composition tests do not replace every physical IME. Linux CI uses Ubuntu 22.04 and an extracted AppImage payload; this version has not been manually accepted on a full Kubuntu 26.04 desktop or through real FUSE mounting. See [performance](https://github.com/AniChikage/open-typora/blob/main/docs/performance.md) and the [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
