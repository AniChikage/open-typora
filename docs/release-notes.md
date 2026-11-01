Open Typora 0.21.1 fixes local plugin bundles that installed successfully but failed to load above the old ~1 MB resource cap ([#7](https://github.com/AniChikage/open-typora/issues/7)).

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.21.1-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.21.1-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.21.1-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned. Updates preserve documents, preferences, model settings, and recovery data.

## Changes

- Align installation and loading limits on macOS and Electron: 16 MiB per plugin source file, 32 MiB total source per folder, and 64 MiB per generated module. Folder packages still support up to 64 files and 8 directory levels.
- Count UTF-8 bytes rather than JavaScript characters, and include loader plus JSON/CSS escaping overhead when checking generated modules. Reject an oversized build before committing its installation.
- Validate installed modules before dynamic import. Plugin Manager reports the actual size limit and how to recover, rather than only showing a generic failed-import error. Electron returns HTTP 413 for oversized modules.
- Retain canonical-path checks, source validation, explicit enablement and existing plugin API boundaries. Larger bundles do not add Node/Electron APIs or guarantee compatibility with every Typora plugin.

The multi-document AI editing feature is still in development and is not part of this patch.
