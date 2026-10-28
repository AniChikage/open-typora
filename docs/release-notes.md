Open Typora 0.20.2 stores remembered macOS model keys in a local configuration file.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.20.2-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.20.2-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.20.2-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned. Updates preserve documents, preferences and recovery data.

## Changes

- macOS remembered keys use plaintext `ai-settings.json` with owner-only read/write permissions (`0600`), rather than Keychain. Normal settings, rewrites and restarts use the file. The settings screen explains the storage mode; saved keys remain hidden from the renderer.
- Legacy macOS keys are not read automatically. Explicitly migrate the old key once or re-enter it; services without authentication can clear the current key and save. After migration the app stops querying Keychain.
- Session-only mode removes the persisted key. Clearing a key and changing the endpoint retain their existing behavior; manual configuration edits take effect without a stale persisted-key cache.
- The Mac Electron development host uses the same file policy. Windows/Linux retain system-backed encryption.
- Adds restart, permission, migration, session, endpoint and bridge-metadata regressions. Existing selection rewriting, retained review, IME guards and undo/redo acceptance continue to run.

See the [English AI guide](https://github.com/AniChikage/open-typora/blob/main/docs/ai.md) or [中文指南](https://github.com/AniChikage/open-typora/blob/main/docs/ai.zh-CN.md). Do not commit or share a configuration file containing your key. This release does not claim complete Typora feature parity.
