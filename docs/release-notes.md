Open Typora 0.8.0 — editing improvements and the first Linux packages.

### Downloads

| Platform | Installer | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.8.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.8.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.8.0-linux-x64.deb` | AppImage |

Checksums for all six downloads are in `SHA256SUMS.txt`. No Node.js or Typora installation is required.

### What's new

- Linux x64 DEB and AppImage packages, desktop launcher, Markdown association and single-instance file opening, including file URLs with spaces and Unicode names.
- Windows/Linux shortcuts now follow the documented platform profile: Ctrl+P for quick open, Ctrl+T for tables, Ctrl+Shift+K/M/Q for code/math/quotes, Ctrl+Shift+1/2/3 for sidebar views, and F3/Shift+F3 for find navigation. Menus, toolbar hints and plugin shortcut reservations use the same mapping. Mac bindings are retained.
- Tab and Shift+Tab indent every selected list line, including quoted lists, preserve the selection and undo as one operation. Fixed quoted-list outdent consuming the quote prefix's spacing.
- Local code-block editing now indents/outdents a multi-line selection without replacing the selected code.
- Cmd/Ctrl+Enter inserts a table row below the current row. Shift+Enter inserts an inline cell break without splitting the Markdown table.
- Common legacy `sequence` and `flow` diagrams render offline and participate in export. Original Markdown is retained. Layout uses Mermaid; unsupported legacy extensions report an error instead of silently omitting content. [Compatibility scope](https://github.com/AniChikage/open-typora/blob/main/docs/diagrams.md).

### Validation

86 unit tests and 91 native checks passed. macOS 26.5.2 native WebKit regression covers editing, undo, plugin/background behavior, encoding, PDF pagination and actual Pandoc conversions/reimports; new native checks cover legacy diagrams, quoted-list Tab, table row insertion, cell breaks and exact source restoration. Electron interaction tests additionally exercise multi-line code indentation and portable HTML diagrams with no renderer errors.

Windows CI installs the NSIS build, exercises the installed application, checks Markdown association, and uninstalls while retaining recovery data. Linux CI installs the DEB on Ubuntu 22.04 x64, exercises both the installed DEB application and extracted AppImage payload, then verifies uninstall preserves recovery data. AppImage FUSE mounting and physical input-method candidates on Windows/Linux remain unverified.

### Installation and limits

Quit the old app before replacing it. Application updates preserve your documents and configuration.

For Ubuntu 22.04 x64 or a compatible system: `sudo apt install ./Open-Typora-0.8.0-linux-x64.deb`. Other compatible distributions may use AppImage; see the README for FUSE and extracted execution instructions.

The interface is currently Simplified Chinese. Windows is not code-signed; macOS is ad hoc signed and not Apple-notarized. Additional conversions on Windows/Linux require Pandoc; legacy DOC/RTF import and bulk image file operations remain limited in the Electron host. This independent early-stage project does not yet provide complete Typora feature or behavior parity.

[Documentation](https://github.com/AniChikage/open-typora#readme) · [简体中文](https://github.com/AniChikage/open-typora/blob/main/README.zh-CN.md)
