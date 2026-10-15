Open Typora for macOS and Windows.

### Downloads

| Platform | Download | Requirements |
| --- | --- | --- |
| macOS | `Open-Typora-0.6.0-arm64.dmg` | macOS 14+, Apple Silicon |
| Windows | `Open-Typora-0.6.0-windows-x64-Setup.exe` | Windows 10/11, x64 |

ZIP alternatives and `SHA256SUMS.txt` are included. No Node.js, Xcode, or Typora installation is required to use the application.

### What's new

- Six built-in themes: clear white, warm paper, mist, graphite, midnight, and forest. Preferences includes previews and selection is saved locally.
- A plugin manager with five adapted, unmodified community plugin sources: read-only, no images, paragraph focus, static markers, and dark inversion.
- Local single-file CommonJS installation, configuration, shortcuts, unloading, and removal to Trash. Compatibility is limited to the documented API subset; this is not full Typora plugin-pack support.
- Read-only mode protects live text, source mode, local code editors, undo and editing commands. Disabling it restores normal editing.
- Windows CSS theme installation now embeds local imports, fonts, and images, matching the macOS resource handling.
- Native WebKit acceptance executes the upstream plugins and dynamically imports an installed module under the existing script policy, including a real undoable document edit.

[Plugin and theme compatibility](https://github.com/AniChikage/open-typora/blob/main/docs/plugins.md)

### Before installing

The application interface is currently Simplified Chinese. This is an independent, early-stage project; full Typora parity is still in progress.

The Windows application is **not code-signed**; SmartScreen may show an unknown-publisher notice. The macOS application is ad hoc signed and **not Apple-notarized**. Read the installation notes in the README before opening the application.

Windows document conversion beyond HTML/PDF requires [Pandoc](https://pandoc.org/installing.html). Legacy DOC/RTF import and bulk image file operations are not supported in the Windows host yet. Windows input-method candidate interaction still requires manual acceptance on a Windows desktop.

[Documentation](https://github.com/AniChikage/open-typora#readme) · [简体中文](https://github.com/AniChikage/open-typora/blob/main/README.zh-CN.md)
