Open Typora for macOS and Windows.

### Downloads

| Platform | Download | Requirements |
| --- | --- | --- |
| macOS | `Open-Typora-0.5.2-arm64.dmg` | macOS 14+, Apple Silicon |
| Windows | `Open-Typora-0.5.2-windows-x64-Setup.exe` | Windows 10/11, x64 |

ZIP alternatives and `SHA256SUMS.txt` are included. No Node.js, Xcode, or Typora installation is required to use the application.

### What's new

- Windows installer with an installation-directory chooser, Start menu and desktop shortcuts, and Markdown file associations.
- Windows title bar, Ctrl shortcuts, document opening from Explorer, and single-instance handling.
- Pandoc discovery on Windows, including PATH and common installation locations; HTML and text imports work without Pandoc.
- English product presentation with an actual editor capture and a quieter layout.
- Release checks now install the Windows application, exercise editing, saving, undo/redo, images, PDF, conflict recovery, and file opening, then uninstall it. Both platform builds must pass before publication.

### Before installing

The application interface is currently Simplified Chinese. This is an independent, early-stage project; full Typora parity is still in progress.

The Windows application is **not code-signed**; SmartScreen may show an unknown-publisher notice. The macOS application is ad hoc signed and **not Apple-notarized**. Read the installation notes in the README before opening the application.

Windows document conversion beyond HTML/PDF requires [Pandoc](https://pandoc.org/installing.html). Legacy DOC/RTF import and bulk image file operations are not supported in the Windows host yet. Windows input-method candidate interaction still requires manual acceptance on a Windows desktop.

[Documentation](https://github.com/AniChikage/open-typora#readme) · [简体中文](https://github.com/AniChikage/open-typora/blob/main/README.zh-CN.md)
