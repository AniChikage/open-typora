# Contributing to Open Typora

Thanks for helping improve Open Typora. Small, focused contributions are easier to review and verify.

## Report a problem

Search [existing issues](https://github.com/AniChikage/open-typora/issues) first. A useful report includes:

- Open Typora version, operating system version, and CPU architecture.
- Steps to reproduce, expected behavior, and actual behavior.
- A minimal Markdown document and a screenshot when they help explain the problem.
- For input problems: input method, rich/source mode, editing location, and the key sequence.
- For import/export problems: source format, target format, and Pandoc version.
- For AI problems: interface type, non-secret error text, and a public selection/instruction that reproduces the issue. Distinguish a connection failure, generated output and an editor/apply problem; remove keys and private endpoints.

Remove personal information and credentials from examples. For a behavior comparison, describe the observed behavior and reference public documentation where possible.

## Set up development

Use Node.js 26 and npm. The macOS host needs macOS 14+ and Xcode Command Line Tools. Windows packaging needs Windows x64, Visual Studio 2022 Build Tools with Desktop development with C++, and PowerShell 7 (`pwsh`); Linux packaging uses Ubuntu 22.04 x64. Install Pandoc for the complete conversion and WebKit test suites. See the [source-build instructions](README.md#build-from-source).

```sh
git clone https://github.com/AniChikage/open-typora.git
cd open-typora
npm ci
npm run dev:app
```

All first-party JavaScript has TypeScript source: `.ts`/`.tsx` for the renderer and browser bridges, `.mts` for Node ES modules, and `.cts` for Electron's sandboxed CommonJS preload. `npm run typecheck` checks production code, tooling, and tests with `strict: true`. `npm run build:runtime` compiles desktop/bridge files to ignored `build/runtime/`; package scripts copy those outputs, never TypeScript source. Node 26 strips types when running `.mts` development scripts and tests; the separate typecheck remains required. Original third-party plugins and interoperability fixtures remain JavaScript.

The development command launches Vite and an Electron host. `npm run dev` runs a browser preview whose Save action downloads a file; it does not exercise the native filesystem bridge.

## Make a change

1. Create a branch for one fix or feature.
2. Keep Markdown, selection, and undo behavior intact. Do not change existing documents as a side effect of rendering.
3. Add a regression test when fixing a data-loss, encoding, selection, or editing-history bug.
4. Run the checks relevant to your change and describe the results in the pull request.
5. Update user documentation when behavior or requirements change.

Core checks:

```sh
npm run typecheck
npm test
npm run build
```

Additional suites:

| Command | Coverage | Environment |
| --- | --- | --- |
| `npm run test:native` | File bytes, atomic saves, recovery, conflicts, and workspace operations | macOS |
| `npm run test:webkit` | Actual WKWebView, native bridge, document conversion, and PDF export | macOS + Pandoc |
| `npm run test:desktop` | Editing, images, saving, recovery, and export in Electron | macOS, Windows or Linux desktop |
| `npm run test:parity` | Multi-line list/code indentation, table keyboard operations, legacy diagrams and portable HTML | Electron desktop |
| `npm run test:kernel-desktop` | Code/formula editing, keyboard interactions, and mode history | macOS desktop |
| `npm run test:features` | Outline, tables, preferences, navigation, and writing modes | macOS desktop |
| `npm run test:alignment` | File workflows, themes, images, and conversion | macOS desktop + Pandoc |
| `npm run test:clipboard-native` | Actual AppKit clipboard → native WebKit source/live tables, exact saves and undo | macOS; no Pandoc required |
| `npm run test:spreadsheet` | Office/WPS clipboard HTML/TSV, live/source/code paste, exact saves and undo | Electron desktop |
| `npm run test:encoding` | Encoding conversion, save protection, composition, and image paste | macOS desktop |
| `npm run test:menus` | Tab, text and table context menus; grouped closing and split targets | Electron desktop |
| `npm run test:indentation` | List/source/local-code indentation and undo | Electron desktop |
| `npm run test:huge` | Large code/table editing, source bytes, selection and history | Electron desktop |
| `npm run test:ai` | Model settings, scoped requests, diff review, history, stale results, cancellation, IME guards, read-only and splits | Electron desktop; local HTTP fixtures, no API key |
| `npm run test:ai-native` | URLSession transport, file permissions, restart/session credentials, legacy migration, protocol errors and limits | macOS; local HTTP fixtures, no API key |
| `npm run test:ai-webkit` | Native bridge, review/apply and history in WKWebView | macOS; local HTTP fixtures, no API key |

Automated desktop suites use isolated temporary application data. To keep screenshots and reports outside the checkout, set `OPEN_TYPORA_QA_DIR` to an absolute output directory. Synthetic composition tests do not replace manual input-method checks.

For AI changes, keep deterministic acceptance on the owned HTTP fixtures. Never require contributors to supply a paid key or send their documents to a provider. Check the request payload, unchanged source during generation, partial acceptance, one-step undo/redo, stale/cancelled responses, read-only guards, split targets and composition. Record any real-provider or physical-IME check separately, with its app version and environment; see the [AI guide](docs/ai.md) and [versioned verification](docs/verification.md).

## Build and install

```sh
npm run package:mac
```

This creates `release/native/Open Typora.app` and a ZIP archive. Run `npm run package:release` to additionally create a drag-to-install DMG and `SHA256SUMS.txt`; the DMG wraps the same native application. To install it locally, quit the running application and run:

```sh
node scripts/install.mts
```

Use `npm run package:preview` for a separate preview application and data directory when checking a change without touching your normal session. Native builds are locally signed, not Apple-notarized.

On Windows x64, run `npm run package:win` to create the NSIS EXE installer, ZIP, and checksums in `release/windows/`. The same original M icon is generated as a multi-resolution ICO. The Windows package contains only the two runtime file-bridge dependencies; frontend libraries are already bundled.

After packaging on Windows, `npm run test:windows` installs the EXE into an isolated temporary folder, runs the desktop suite against the installed executable, checks Unicode document arguments, single-instance opening and file-association registration, and uninstalls the application. It preserves recovery data. Evidence goes to `OPEN_TYPORA_QA_DIR` in the runner temporary directory. This is automated acceptance on a Windows Server runner, not a manual Windows 10/11 IME check.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/editor/` | Markdown model, rendering, source mapping, and edit transactions |
| `src/components/` | Dialogs and navigation |
| `native/` | AppKit/WebKit host, files, images, and conversion |
| `electron/` | Windows/Linux release host, development, and desktop regression |
| `shared/` | Commands, bridge contracts, AI validation and starter documents shared by the hosts |
| `tests/` | Unit, native, and desktop integration tests |
| `design/` | Original icon and design sources |

Read [the architecture](docs/architecture.md) before changing the editor or native bridge. The [feature checklist](docs/feature-parity.md) records supported workflows and remaining differences.

Do not commit generated bundles, test output, credentials, personal documents, or third-party proprietary source/assets. `ai-settings.json` is ignored because the macOS file can contain a plaintext API key; never attach a real copy to a bug report. Contributions are licensed under the project's [MIT license](LICENSE); preserve existing third-party notices.

## Publish a release

Set the package version, commit the change, and push a matching `v<version>` tag. The [release workflow](.github/workflows/release.yml) builds on Apple Silicon macOS, Windows x64 and Ubuntu 22.04 x64 runners. All three builds, the Windows preview build, real FUSE acceptance on Ubuntu 22.04/24.04, and required tests must pass before publication. Windows is installed and uninstalled; Linux tests the installed DEB and extracted AppImage payload, including recovery preservation on uninstall. The publisher verifies combined checksums before publishing DMG, EXE, two ZIPs, DEB, AppImage and `SHA256SUMS.txt`. Published assets are never overwritten by a rerun.

Main and `codex/**` branch changes run macOS, Windows and Linux acceptance without publishing. The native clipboard suite uses the system clipboard; CI runs it on a separate macOS desktop. Update `docs/release-notes.md` for each version, both READMEs and current setup examples when the download version changes, and `docs/verification.md` with the actual coverage. Keep historical benchmark and test versions intact. Linux builds use `npm run package:linux`; in an isolated Ubuntu x64 environment, `xvfb-run -a node tests/linux-install.mts` installs/removes the DEB with sudo and runs both packaged payloads. Never run that installer test against your ordinary Linux installation.
