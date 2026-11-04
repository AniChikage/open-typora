Open Markdown Lane 0.23.0 is the first desktop release under the new project name.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Markdown-Lane-0.23.0-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Markdown-Lane-0.23.0-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Markdown-Lane-0.23.0-linux-x64.deb` or AppImage.

Verify downloads with `SHA256SUMS.txt`. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- Rename application menus, dialogs, exports, installers, documentation and the browser demo to **Open Markdown Lane**. Repository: https://github.com/AniChikage/open-markdown-lane.
- Preserve existing documents, drafts, tabs, split views, version history, themes, plugins and model configuration. Existing application-data folders and internal compatibility identifiers remain stable. Linux retains the original encryption namespace so saved model credentials remain decryptable.
- Migrate browser preference keys before rendering, with the existing new keys taking precedence and fallback reads if storage is full.
- Replace the previous macOS application only after verifying the new bundle; installation failure restores the previous bundle. Windows removes the old executable; the Linux package replaces the previous package.
- Fix rich-text regex replacement dropping a literal `$<name>` when the expression has no named capture groups.
- Upgrade acceptance now verifies the current public installer's checksum rather than depending on retired release downloads.

## Scope

This release preserves the existing editing, AI review, multi-document changes and recovery workflows. It does not add new model services or expand third-party plugin compatibility. See the [upgrade guide](https://github.com/AniChikage/open-markdown-lane/blob/v0.23.0/docs/renaming.md) and [verification record](https://github.com/AniChikage/open-markdown-lane/blob/v0.23.0/docs/verification.md) for platform-specific coverage and manual input-method limits.
