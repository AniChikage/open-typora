Open Typora 0.13.3 fixes Linux desktop launching and indentation commands reported in Issue #1.

> **Independent, unofficial project. Open Typora is not developed, endorsed or supported by Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.**

## Downloads

| Platform | Installer | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.13.3-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.13.3-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.13.3-linux-x64.deb` | AppImage |

`SHA256SUMS.txt` covers all six downloads. Install the new DEB to update the system desktop entry. Custom launchers copied into your home directory may still reference an older installation path and need updating separately.

## Fixes

- **Linux desktop launch path.** The DEB now installs to `/opt/Open-Typora/`, avoiding the whitespace in the previous installation directory. The application and desktop label remain **Open Typora**. The upgrade test installs the previous public 0.13.1 DEB, upgrades it, and checks that the old executable is removed. Desktop integration is exercised through GIO and KDE MIME association with filenames containing Chinese characters, spaces, `#`, `%`, and `&`.
- **Indentation in code and source mode.** `Ctrl+[` increases indentation and `Ctrl+]` decreases it on Windows/Linux; macOS uses `Cmd+[` and `Cmd+]`, following [Typora's documented mappings](https://support.typora.io/Shortcut-Keys/). The commands now reach both the full source editor and the active code-block editor. Selected lines change together, fence delimiters stay intact, and each operation remains separately undoable. The same commands are available from the menu in source mode. Existing list indentation, composition guards and read-only protections are retained.

## Validation and limits

The new keyboard regression checks lists, code blocks, full source mode, menu actions and undo/redo against the installed Windows/Linux payloads. Linux acceptance additionally validates the installed desktop entry, the real GIO/KDE launch chain and upgrade from the previous DEB. The full desktop, plugin, composition, conversion, workspace and recovery regressions continue to run.

Linux CI runs on Ubuntu 22.04 with KDE launcher components, not a complete Kubuntu 26.04 desktop session. AppImage acceptance exercises the extracted payload; FUSE mounting is not covered. Automated composition is not a substitute for every physical IME candidate window. Plugin support and overall Typora parity remain partial; see the [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
