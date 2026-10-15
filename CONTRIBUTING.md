# Contributing to Open Typora

Thanks for helping improve Open Typora. Small, focused contributions are easier to review and verify.

## Report a problem

Search [existing issues](https://github.com/AniChikage/open-typora/issues) first. A useful report includes:

- Open Typora version, macOS version, and CPU architecture.
- Steps to reproduce, expected behavior, and actual behavior.
- A minimal Markdown document and a screenshot when they help explain the problem.
- For input problems: input method, rich/source mode, editing location, and the key sequence.
- For import/export problems: source format, target format, and Pandoc version.

Remove personal information and credentials from examples. For a behavior comparison, describe the observed behavior and reference public documentation where possible.

## Set up development

Use Node.js 26 and npm. Native builds require macOS 14+ and Xcode Command Line Tools. Install Pandoc for the complete conversion and WebKit test suites.

```sh
git clone https://github.com/AniChikage/open-typora.git
cd open-typora
npm ci
npm run dev:app
```

The development command launches Vite and an Electron host. `npm run dev` runs a browser preview whose Save action downloads a file; it does not exercise the native filesystem bridge.

## Make a change

1. Create a branch for one fix or feature.
2. Keep Markdown, selection, and undo behavior intact. Do not change existing documents as a side effect of rendering.
3. Add a regression test when fixing a data-loss, encoding, selection, or editing-history bug.
4. Run the checks relevant to your change and describe the results in the pull request.
5. Update user documentation when behavior or requirements change.

Core checks:

```sh
npm test
npm run build
```

Additional suites:

| Command | Coverage | Environment |
| --- | --- | --- |
| `npm run test:native` | File bytes, atomic saves, recovery, conflicts, and workspace operations | macOS |
| `npm run test:webkit` | Actual WKWebView, native bridge, document conversion, and PDF export | macOS + Pandoc |
| `npm run test:desktop` | Editing, images, saving, recovery, and export in Electron | macOS or Windows desktop |
| `npm run test:kernel-desktop` | Code/formula editing, keyboard interactions, and mode history | macOS desktop |
| `npm run test:features` | Outline, tables, preferences, navigation, and writing modes | macOS desktop |
| `npm run test:alignment` | File workflows, themes, images, and conversion | macOS desktop + Pandoc |
| `npm run test:encoding` | Encoding conversion, save protection, composition, and image paste | macOS desktop |

Automated desktop suites use isolated temporary application data. To keep screenshots and reports outside the checkout, set `OPEN_TYPORA_QA_DIR` to an absolute output directory. Synthetic composition tests do not replace manual input-method checks.

## Build and install

```sh
npm run package:mac
```

This creates `release/native/Open Typora.app` and a ZIP archive. Run `npm run package:release` to additionally create a drag-to-install DMG and `SHA256SUMS.txt`; the DMG wraps the same native application. To install it locally, quit the running application and run:

```sh
node scripts/install.mjs
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
| `electron/` | Windows release host, development, and desktop regression |
| `shared/` | Commands and starter documents shared by the hosts |
| `tests/` | Unit, native, and desktop integration tests |
| `design/` | Original icon and design sources |

Read [the architecture](docs/architecture.md) before changing the editor or native bridge. The [feature checklist](docs/feature-parity.md) records supported workflows and remaining differences.

Do not commit generated bundles, test output, credentials, personal documents, or third-party proprietary source/assets. Contributions are licensed under the project's [MIT license](LICENSE); preserve existing third-party notices.

## Publish a release

Set the package version, commit the change, and push a matching `v<version>` tag. The [release workflow](.github/workflows/release.yml) builds on Apple Silicon macOS and Windows x64 runners. Both builds and all required tests, including installation and installed-app regression on Windows, must pass before the publication job merges the checksums and publishes the DMG, Windows EXE, both ZIPs, and `SHA256SUMS.txt`. Update `docs/release-notes.md` for each version. Main-branch host changes also run the Windows acceptance job without publishing. An existing draft keeps its curated release notes. Published assets are never overwritten by a rerun.
