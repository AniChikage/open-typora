Open Typora 0.17.4 fixes community-plugin interactions and adds real AppImage FUSE acceptance.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.17.4-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.17.4-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.17.4-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Fixes and acceptance

- Closing a background tab restores the active editor focus and selection after the tab is removed, so immediate typing works reliably.

- List folding now displays its triangle when the upstream metadata color is absent. Plugin writing-surface listeners move with active tabs and split panes. Cached references, once listeners, removal, abort signals and disabling retain their semantics.
- All six original bundled community plugins are exercised individually and together, including actual styles, tab/split interaction, read-only behavior, persistence after restart and cleanup. Native WebKit separately checks folding geometry and combined teardown.
- Native macOS system IME acceptance covers actual Chinese candidate submission, undo/redo, cancellation, mode switching and saved text. Automated composition remains a separate regression check. This does not cover every physical IME or Windows/Linux candidate window.
- The AppImage launcher keeps Chromium sandboxing enabled. Real FUSE acceptance checks mount type, direct runtime startup, sandbox state, exact saves, undo/redo and unmounting as an ordinary user. Ubuntu 22.04 runs directly; Ubuntu 24.04 uses an application-specific namespace profile with its global restriction retained. See [AppImage prerequisites](https://github.com/AniChikage/open-typora/blob/main/docs/linux-appimage.md).

Complete Typora plugin distributions, Node/Electron dependencies and unadapted private APIs remain unsupported. Full Kubuntu 26.04 desktop/Wayland acceptance is not claimed for this release. Normal updates retain documents, preferences and recovery data.
