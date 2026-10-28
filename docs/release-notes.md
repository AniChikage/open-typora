Open Typora 0.20.0 adds optional AI selection editing with reviewable changes.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.20.0-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.20.0-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.20.0-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- Configure your own OpenAI-compatible chat API, OpenRouter, LM Studio or native Ollama service. No hosted model, subscription or API key is bundled.
- Rewrite a selection from live editing or source mode. Review the original and suggestion for each change, keep individual original passages, and explicitly apply the reviewed result as one undoable edit.
- Paragraphs, bold text, list items, table cells and local code selections use the existing Markdown bookmarks and transaction history. Generation alone never modifies a document.
- Delayed proposals cannot overwrite text changed while the request was pending, or write into a different tab or split pane. Read-only plugins block AI edits; cancel stops the request and ignores late results.
- Rapid source/live switching now commits its history before a following undo or redo, preventing a lost redo immediately after the mode change.
- Chinese composition guards cover capture, prompt submission and applying edits. Incoming suggestions do not move editor focus. Escape during IME candidate input keeps the settings dialog open.
- Remembered keys use the macOS Keychain or Electron's system-backed encryption. Session-only keys are supported; an insecure Linux storage backend cannot persist a key. Saved keys are never returned to the renderer, and changing endpoints does not carry the old key over.
- Requests refuse redirects, enforce time/size budgets, reject truncated output and show safe authentication/rate-limit errors without echoing provider error bodies.
- Adds deterministic HTTP, native URLSession, WebKit and installed Windows/Linux AI acceptance. Physical input methods and actual model inference remain separate tests from those fixtures.

Read the [AI setup, data scope and limits](https://github.com/AniChikage/open-typora/blob/main/docs/ai.md). Model output still needs human review. This release does not claim complete Typora feature parity. Updates preserve documents, preferences and recovery data.
