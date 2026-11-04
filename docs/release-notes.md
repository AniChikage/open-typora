Open Markdown Lane 0.24.0 improves the writing workspace while retaining the existing Markdown editing and storage model.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Markdown-Lane-0.24.0-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Markdown-Lane-0.24.0-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Markdown-Lane-0.24.0-linux-x64.deb` or AppImage.

Verify downloads with `SHA256SUMS.txt`. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- Clearer active tabs, document icons, unsaved indicators and drag destination feedback. Existing tab menus, keyboard navigation and split views remain available.
- Direct file/list/outline navigation, a visible folder-search entry and more legible selected files and tree rows.
- A right-hand outline and AI tool area, plus a version-history shortcut. Collapsing the sidebar or switching to the outline retains the AI instruction and generated review. The explicit Close AI action ends the review.
- Protect active editor and AI-prompt composition when switching or collapsing the right sidebar; the AI Close action also respects composition.
- Improve heading hierarchy and page spacing while retaining saved font, line-height, width, theme and background settings.
- Keep interactive controls outside the native macOS window-drag strip. Existing documents, drafts, model settings and application-data locations are retained.

## Validation scope

Automated coverage includes exact save/undo/redo, split restoration, sidebar state, light/dark and compact layouts, AI review, synthetic Chinese composition and the existing community issue regressions. Controlled HTTP fixtures validate AI integration; they are not live-provider inference or physical-IME acceptance. Platform package and FUSE results are reported by the release workflow. See [verification](https://github.com/AniChikage/open-markdown-lane/blob/v0.24.0/docs/verification.md) for the final evidence and limitations.
