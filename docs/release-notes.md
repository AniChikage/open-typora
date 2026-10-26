Open Typora 0.18.0 migrates first-party JavaScript to TypeScript and fixes the local single-file plugin picker.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.18.0-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.18.0-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.18.0-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- First-party desktop modules, shared loaders, native/browser bridges, build scripts and tests now use TypeScript. The editor and React interface were already TypeScript. Production code, scripts and tests use strict checking, with shared document and IPC contracts.
- Installers run emitted JavaScript. Electron retains a sandboxed CommonJS preload; macOS retains its native Swift/AppKit host and classic WebKit bridge. Original third-party JavaScript plugins keep their upstream source. Existing runtime dependencies are unchanged.
- Installing a single `.js`/`.cjs` plugin now opens the file picker correctly. The folder flag previously received the IPC event object. A desktop regression exercises both picker modes, disabled-by-default installation, execution after source removal, undo and cleanup.
- Existing regression suites continue to cover Linux file launch paths and indentation, tab/body/table context menus, large documents and code/table viewports, themes, PDF pagination, plugin lifecycle and composition handling. Windows tests exercise Everything preview with full content and relative images; Linux tests distinguish extracted payloads from real FUSE mounts.

For contributors, Node.js 26 is required for `.mts` scripts. Run `npm ci`, `npm run typecheck`, `npm test`, and the relevant integration suites; see [CONTRIBUTING.md](https://github.com/AniChikage/open-typora/blob/main/CONTRIBUTING.md).

This release does not claim complete Typora feature parity, support for complete Typora plugin distributions, or every physical IME/desktop combination. Full Kubuntu 26.04/Wayland acceptance is not claimed. Normal updates retain documents, preferences and recovery data.
