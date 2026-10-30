Open Typora 0.21.0 adds local references, source-backed Q&A, persistent version history, and an English interface.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.21.0-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.21.0-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.21.0-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned. Updates preserve documents, preferences, model settings, and recovery data.

## Changes

- Add `@file` references to a selection rewrite. Choose from open documents or the authorized folder; current unsaved text is supported. Only relevant excerpts are sent after you click Generate.
- Ask questions about open documents or a folder. Retrieve keywords locally, inspect and exclude excerpts before sending, then check the answer's quotes and source links. Invented quotes and unknown source IDs are rejected. Answers can be copied or inserted with portable Markdown footnotes and one-step undo.
- Keep local document versions across app restarts. Save snapshots, inspect older content, and restore with a snapshot of the current text and one-step undo. History is bounded to 50 versions / 128 MiB per document and 512 MiB overall; it does not replace backups.
- Switch between Simplified Chinese and English in Preferences. Application controls and menus update without replacing the editor, translating documents, or clearing undo. System dialogs and third-party content may follow their own language.
- Fix a caret jump when typing a space at the end of a rendered paragraph. Preserve the editable trailing whitespace and cover continuous typing in paragraphs, headings, lists, and quotes.
- Recheck document identity, original text, IME composition, and read-only state after asynchronous history writes, so delayed operations cannot overwrite a changed target.

Reference retrieval accepts files up to 2 MiB and a 30 MiB source budget per search, returning up to eight excerpts. These are retrieval limits, not editing limits. This release uses keyword retrieval, not an embedding index or an autonomous agent. Citation checks establish correspondence with the excerpts, not the correctness of model reasoning.

See the [English workspace guide](https://github.com/AniChikage/open-typora/blob/main/docs/workspace.md), [中文指南](https://github.com/AniChikage/open-typora/blob/main/docs/workspace.zh-CN.md), and [AI setup](https://github.com/AniChikage/open-typora/blob/main/docs/ai.md). Full Typora feature parity is still in progress.
