Open Typora 0.20.1 keeps AI review open after applying a rewrite.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.20.1-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.20.1-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.20.1-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned. Updates preserve documents, preferences and recovery data.

## Changes

- Applying an AI suggestion keeps the panel open, confirms the applied changes and retains your rewrite instruction. Consumed differences disappear so they cannot be applied twice.
- Continue rewriting the approved text, or select a different passage and read the current selection. The next request uses the updated source bookmark; generating still does not modify a document.
- Each application is a separate undoable edit. Undoing or changing the target text disables stale continuation; read-only, split-pane and IME composition guards remain in place.
- Adds a two-round desktop regression with exact save bytes, partial approval, independent undo/redo and stale-result protection. Native WebKit acceptance also checks the retained panel and refreshed target.

AI remains optional and uses your own compatible API or local model server. See the [English guide](https://github.com/AniChikage/open-typora/blob/main/docs/ai.md) or [中文指南](https://github.com/AniChikage/open-typora/blob/main/docs/ai.zh-CN.md) for setup, data scope and limits. Model output needs human review; this release does not claim complete Typora feature parity.
