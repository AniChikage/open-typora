Open Typora 0.12.0 adds header-to-table editing and fixes table pipes and asynchronous plugin cleanup.

> **Independent, unofficial project. Open Typora is not developed, endorsed or supported by Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.**

## Downloads

| Platform | Installer | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.12.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.12.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.12.0-linux-x64.deb` | AppImage |

`SHA256SUMS.txt` covers all six downloads. The Windows ZIP runs without installation; preferences, cache and recovery data still use the user profile rather than a folder beside the executable.

## Changes

- **Create tables by typing.** Type a standalone header such as `| Name | Status |` and press Enter. The editor creates the separator and an empty body row, and places the caret in its first cell. Inline header formatting and escaped pipes are retained. Supports up to 30 columns; soft Enter, code and escaped closing pipes do not trigger conversion. Table creation is a separate undo step.
- **Keep literal pipes inside table cells.** Typing, pasting and browser composition commits escape literal pipes instead of silently splitting a cell into more columns. Backspace/Delete remove a pipe and its source escape together. Multiline text paste becomes cell line breaks instead of breaking the table. Chinese text, caret position, source/live switching and undo/redo are preserved.
- **Stop asynchronous plugin work after disable.** Pending commands can no longer write through the compatibility API or reacquire a read-only lock after their plugin has been disabled or failed. Owned effects are removed before awaiting asynchronous teardown. An old instance cannot unlock its replacement, and late registrations through tracked event/timer helpers are discarded.

## Validation and limits

Regression coverage includes header conversion and its undo boundary, table pipe typing/paste/composition/caret/deletion, false-trigger cases, delayed plugin commands, immediate cleanup, and replacement-instance lock ownership. The desktop acceptance suites exercise actual Chromium key input and composition protocols plus source/live switching, automatic saving and undo/redo. The native WebKit suite covers header creation, Chinese pipe input and independent undo under the app's resource scheme. Physical input-method candidate windows are a separate acceptance boundary.

Plugin support remains partial: Node/Electron built-ins, npm dependencies, complete upstream plugin distributions and arbitrary Typora private APIs are unsupported. Plugins are trusted application code; direct global or DOM writes outside owned helpers remain the plugin author's cleanup responsibility. See [plugin compatibility](https://github.com/AniChikage/open-typora/blob/main/docs/plugins.md).

All physical IMEs, editing positions, clipboards, conversion combinations and Linux desktops have not been exhaustively verified. AppImage acceptance exercises the extracted payload rather than FUSE mounting. Windows builds are unsigned; macOS is ad hoc signed and not Apple-notarized. This release does not establish complete Typora parity; remaining differences are tracked in the [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
