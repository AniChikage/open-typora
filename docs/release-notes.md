Open Typora 0.10.0 improves Chinese composition handling and the community plugin compatibility host.

> **Independent, unofficial project. Open Typora is not developed, endorsed or supported by Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.**

## Downloads

| Platform | Installer | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.10.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.10.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.10.0-linux-x64.deb` | AppImage |

`SHA256SUMS.txt` covers all six downloads.

## Changes

- Chinese candidate commits wait for the final input event before updating the document. Cancelling a candidate creates no empty undo entry; separate commits remain separate undo steps. Cross-paragraph replacement retains the surrounding Markdown.
- Source and local code editors preserve composition undo groups, and cancelling source composition retains existing redo history. A pending source/live switch waits for commit; hidden documents no longer steal the active editor's selection during a mode change. Editing preferences and read-only changes wait for composition to finish. Plugins receive the final committed Markdown rather than provisional candidates.
- IME key 229 and active composition do not trigger host editing or plugin shortcuts. Plugin adapter writes are refused with a notice while composition is pending, protecting the marked text.
- Adds the pinned, unmodified upstream list-folding plugin. Click the triangle beside a list to fold its remaining items; optional per-document session state survives editor refreshes.
- Adds **Plugin commands**, including upstream static/dynamic actions, selection metadata, labels, checked states and disabled actions.
- Plugin events distinguish file loading from editing, support ordered/once/removable listeners and cross-plugin publishing, and isolate asynchronous callback failures. Dynamic hotkeys support registration, arrays, removal and pause/resume with collision checks. Owned timers and debounced callbacks stop when a plugin is disabled or fails.

## Validation and limits

Kernel tests cover delayed final input, cancellation, separate commits, key 229 and cross-paragraph replacement. Native WebKit regressions cover Chinese composition in formatted text, lists and table cells, alongside actual module loading and plugin commands. Installed Windows/Linux acceptance uses Chromium's composition protocol in live text, lists, tables, local code and source mode, including pending mode switches, autosave, undo/redo and plugin-write protection. These protocol tests are distinct from physical input-method candidate-window testing.

Full plugin packages, Node/Electron modules and arbitrary Typora private interfaces are not supported. Session state recording is not a complete replacement for the upstream disk service. Plugins are trusted code; direct DOM writes and arbitrary global aliases remain outside tracked adapter cleanup. Other physical IMEs, all input positions, cross-app clipboards, architectures and Linux desktops are not exhaustively verified. AppImage acceptance exercises its extracted payload, not FUSE mounting. Windows builds are unsigned; macOS is ad hoc signed and not Apple-notarized. See [the checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md) for remaining differences.
