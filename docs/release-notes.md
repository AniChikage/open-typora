Open Typora for macOS and Windows.

### Downloads

| Platform | Download | Requirements |
| --- | --- | --- |
| macOS | `Open-Typora-0.7.1-arm64.dmg` | macOS 14+, Apple Silicon |
| Windows | `Open-Typora-0.7.1-windows-x64-Setup.exe` | Windows 10/11, x64 |

ZIP alternatives and `SHA256SUMS.txt` are included. No Node.js, Xcode, or Typora installation is required to use the application.

### What's fixed

- Fixed macOS windows that could not be moved by dragging the document title or empty title-bar area. The native AppKit host now handles window dragging directly; Electron-only CSS no longer determines macOS behavior.
- The drag area follows window resizing. Document selection, sidebar controls and the macOS window buttons remain available.
- Added native mouse-event routing regression checks for title-bar dragging and for keeping document and control clicks inside WebKit.

### Validation

The fix is being verified on macOS 26.5.2 (Apple Silicon). The original report was on macOS 27.0.1; that exact system version is not available locally and still needs reporter confirmation.

[Plugin and theme compatibility](https://github.com/AniChikage/open-typora/blob/main/docs/plugins.md)

### Before installing

The application interface is currently Simplified Chinese. This is an independent, early-stage project; full Typora parity is still in progress.

The Windows application is **not code-signed**; SmartScreen may show an unknown-publisher notice. The macOS application is ad hoc signed and **not Apple-notarized**. Read the installation notes in the README before opening the application.

Windows document conversion beyond HTML/PDF requires [Pandoc](https://pandoc.org/installing.html). Legacy DOC/RTF import and bulk image file operations are not supported in the Windows host yet. Windows input-method candidate interaction still requires manual acceptance on a Windows desktop.

[Documentation](https://github.com/AniChikage/open-typora#readme) · [简体中文](https://github.com/AniChikage/open-typora/blob/main/README.zh-CN.md)
