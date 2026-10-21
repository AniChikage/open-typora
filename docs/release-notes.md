Open Typora 0.13.0 adds document tabs and split editing, improves long-document rendering, and fixes workspace and untitled-tab recovery bugs.

> **Independent, unofficial project. Open Typora is not developed, endorsed or supported by Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.**

## Downloads

| Platform | Installer | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.13.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.13.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.13.0-linux-x64.deb` | AppImage |

`SHA256SUMS.txt` covers all six downloads. The Windows ZIP uses the user profile for preferences and recovery data; it is not a self-contained portable profile.

## Changes

- **Document tabs on every desktop platform.** Create, switch, close and reopen tabs in the current window. Tabs show unsaved state and full paths on hover, scroll when crowded, support drag reordering, and keep each document's selection, scroll and undo history while switching. Ctrl+Tab / Ctrl+Shift+Tab navigate; arrow keys navigate the tab bar, Alt+arrow keys reorder, and Delete closes its focused tab. Cmd/Ctrl+W closes a tab; Cmd/Ctrl+Shift+W closes the window. Windows/Linux retain Ctrl+T for table insertion and use Ctrl+Alt+N for a new tab.
- **Two-document split editing.** Compare and edit two distinct open documents side by side or stacked vertically. Switch the active pane with F6, use independent source/live modes, swap panes, drag the divider, or resize it with arrow keys. Double-click the divider to reset it. Closing a pane keeps its document open. Tab order, active document, split documents, orientation and proportions are saved with the window session. Split editing currently supports two different documents, not two views of the same document. Per-document mode, selection, scroll and undo history are retained in memory while the window remains open; they are not restored across application restarts.
- **Less repeated work during editing.** Match parsed blocks through an index rather than repeated full-array searches. Reuse unchanged block DOM and source maps, including shifted task-checkbox positions; invalidate views when references, headings, footnotes or Markdown options change. Initialize an editor only when its document is first shown, and isolate unchanged views from React updates. Markdown parsing remains document-wide, and documents above 300,000 characters still use source mode. See the [reproducible component benchmark](https://github.com/AniChikage/open-typora/blob/main/docs/performance.md) for the measured scope.
- **Fix workspace and recovery behavior.** Unreadable child folders no longer fail the entire file tree; failed root scans retain the previous inventory, and Electron folder switches and refreshes commit in request order. Searches report skipped subtrees. Ignore non-regular Markdown entries and avoid false inventory-limit warnings. Reopening a discarded untitled tab no longer tries to read a null disk path. Interior blank paragraphs and the trailing empty paragraph now retain distinct node IDs, fixing stale Chinese composition text after undo.
- **Keep composition and plugins tied to the active editor.** Candidate composition blocks tab switches and structural pane changes. Plugin DOM bindings follow the focused pane when both documents are visible. Preserve the existing read-only, plugin cleanup and source/history protections.

## Validation and limits

The desktop workspace suite exercises a 700-paragraph document, lazy editor initialization, unchanged DOM retention, scroll and undo across tabs, editing both panes, independent source mode, actual pointer caret placement, Chromium composition/undo and blocked tab switching, plugin focus, divider controls, reordering, restart recovery, and dirty-tab cancellation/reopening. It runs against installed Windows and Linux packages. Native WebKit additionally exercises tabs, split direction changes, independent modes and pane closing alongside existing composition, plugin and export regressions.

Automated composition does not establish compatibility with every physical IME candidate window. Plugin support remains partial; Node/Electron built-ins, npm dependencies, complete upstream distributions and arbitrary Typora private APIs remain unsupported. All clipboard, conversion, theme and Linux desktop combinations have not been exhausted. AppImage acceptance runs the extracted payload rather than a FUSE mount. Windows binaries are unsigned; macOS is ad hoc signed and not Apple-notarized. Remaining differences are tracked in the [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
