Open Typora 0.11.0 adds local plugin folders and improves Chinese replacement across paragraph boundaries.

> **Independent, unofficial project. Open Typora is not developed, endorsed or supported by Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.**

## Downloads

| Platform | Installer | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.11.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.11.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.11.0-linux-x64.deb` | AppImage |

`SHA256SUMS.txt` covers all six downloads.

## Changes

- **Install plugin folders.** Select a folder with `index.js`, `index.cjs`, or a `package.json` main entry. Relative JS/CJS modules, JSON configuration and CSS strings are embedded in a managed module, with shared-module caching and circular CommonJS references. Installed plugins work after their original folder is removed and after an application restart.
- **Consistent plugin cleanup on macOS.** Both file and folder installations receive the host's tracked timers, matching Windows/Linux. Disabling a plugin stops timers created through those bindings and removes its owned styles.
- **Correct Chinese replacement across paragraphs.** Repeated characters no longer shift an IME replacement past the original selection or retain an unwanted paragraph separator. Replacing two paragraphs with the same visible characters remains an undoable source edit. Chinese and emoji commits are retained when the browser replaces an entire paragraph element.
- Keeps the existing composition guards, candidate cancellation, source/live switching and single-commit undo behavior. The six bundled upstream plugins and six original themes remain available.

## Validation and limits

Unit tests cover repeated Chinese selections, emoji, paragraph element replacement, package installation, module caching/cycles, cleanup and invalid paths. Native WebKit checks the actual installed module under the application script policy, including relative JS/JSON/CSS, an undoable Unicode command and timer cleanup. Installed Windows/Linux acceptance exercises the folder picker, enabling/disabling, source removal, restart, and Chromium composition protocols in body/list/table/local-code/source editors and repeated paragraph selections. Physical candidate-window testing is distinct from these automated protocols.

Plugin folders are limited to 64 JS/CJS/JSON/CSS files, 4 MB total, 1 MB each and 8 directory levels. Hidden entries and `node_modules` are skipped. CSS font/image URLs are not automatically embedded. Node/Electron built-ins, npm dependencies, full upstream plugin distributions and arbitrary Typora private APIs are not supported. Plugins remain trusted application code; direct global or DOM mutations outside owned helpers require plugin-managed cleanup. See [plugin compatibility](https://github.com/AniChikage/open-typora/blob/main/docs/plugins.md).

All physical IMEs and editing positions, cross-app clipboards, arbitrary conversion combinations, architectures and Linux desktops are not exhaustively verified. AppImage acceptance runs the extracted payload, not FUSE mounting. Windows builds are unsigned; macOS is ad hoc signed and not Apple-notarized. The [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md) records remaining differences; this release does not establish complete Typora parity.
