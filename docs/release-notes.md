Open Typora for macOS and Windows.

### Downloads

| Platform | Download | Requirements |
| --- | --- | --- |
| macOS | `Open-Typora-0.7.0-arm64.dmg` | macOS 14+, Apple Silicon |
| Windows | `Open-Typora-0.7.0-windows-x64-Setup.exe` | Windows 10/11, x64 |

ZIP alternatives and `SHA256SUMS.txt` are included. No Node.js, Xcode, or Typora installation is required to use the application.

### What's new

- Local background-image selection in Preferences, with immediate preview, opacity, blur, position, fill/fit/tile, reset, and clear controls.
- PNG, JPEG and WebP copies persist locally across restarts and desktop windows; the original file can be moved without breaking the background. No server upload is used.
- Backgrounds work in live and source modes while document text and undo history stay intact. Personal backgrounds are excluded from HTML, PDF and converted exports.
- Invalid or cancelled image selections retain the previous background. Selection is limited to 8 MB and 40 million pixels.


[Plugin and theme compatibility](https://github.com/AniChikage/open-typora/blob/main/docs/plugins.md)

### Before installing

The application interface is currently Simplified Chinese. This is an independent, early-stage project; full Typora parity is still in progress.

The Windows application is **not code-signed**; SmartScreen may show an unknown-publisher notice. The macOS application is ad hoc signed and **not Apple-notarized**. Read the installation notes in the README before opening the application.

Windows document conversion beyond HTML/PDF requires [Pandoc](https://pandoc.org/installing.html). Legacy DOC/RTF import and bulk image file operations are not supported in the Windows host yet. Windows input-method candidate interaction still requires manual acceptance on a Windows desktop.

[Documentation](https://github.com/AniChikage/open-typora#readme) · [简体中文](https://github.com/AniChikage/open-typora/blob/main/README.zh-CN.md)
