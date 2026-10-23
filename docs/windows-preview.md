# Markdown preview in Everything and File Explorer

The Windows x64 installer includes a native COM preview handler for `.md`, `.markdown` and `.mdown`. It is optional and does not change the default Markdown editor.

1. Install Open Typora and [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/).
2. In Preferences, find **系统 Markdown 预览** and enable it.
3. In Everything, show the Preview pane (View → Preview, usually Alt+P) and select a Markdown file. In File Explorer, turn on the Preview pane and enable preview handlers in Folder Options.
4. If a host cached the old handler, close and reopen its window.

Registration is per-user; no administrator permission is requested. Enabling saves the current handler for each extension. Disabling or uninstalling restores it when Open Typora still owns the mapping; another application's subsequent choice is left intact. Updates refresh the installed DLL path without enabling preview for users who have not opted in.

## Scope

- Read-only headings, lists, tables, code, offline math and supported diagrams use the shared Markdown renderer. There is no document editing bridge or plugin execution.
- Reads at most the first 1 MiB of the source file and labels truncated previews. UTF-8, BOM-marked UTF-16 LE/BE and a GB18030 fallback are supported. The editor remains the place for explicit encoding selection.
- Images inside the document's folder can load when the host provides its filename. Absolute paths, parent traversal and remote images are blocked. A stream without a filename cannot resolve local images.
- Links and new windows do not navigate. The preview does not fetch remote scripts, fonts or media.
- Windows x64 and WebView2 Runtime are required. Missing runtime produces an explanatory message. The handler retains WebView2's normal process isolation.

The Windows acceptance suite installs the package, registers the handler, hosts it through real file and stream COM interfaces, exercises focus/resize/unload, and opens the actual Everything 1.4.1.1032 preview pane with an isolated file list. It checks rendered heading/table text, captures screenshots, verifies source hashes and tests restoration of a previous handler. This does not imply manual coverage of every Everything beta, Explorer extension, Windows policy or architecture.

If it fails, include the Windows/Everything versions, whether Explorer preview works, the WebView2 Runtime version, and a small Markdown sample. Temporarily disable **系统 Markdown 预览** to restore the prior handler.
