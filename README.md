<p align="center">
  <img src="design/icon.svg" alt="Open Typora" width="88" height="88">
</p>

<h1 align="center">Open Typora</h1>

<p align="center">Write in Markdown. Work directly on the page. Keep your files.</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a><br>
  <a href="https://github.com/AniChikage/open-typora/releases/latest">Download for macOS</a> · <a href="#features">Features</a> · <a href="#getting-started">Getting started</a> · <a href="CONTRIBUTING.md">Contributing</a> · <a href="LICENSE">MIT License</a>
</p>

![Open Typora — live Markdown editing in the native macOS app](docs/images/hero.png)

Open Typora is an open-source Markdown editor inspired by Typora's inline editing experience. Write directly in the rendered document, switch to source when you need it, and save ordinary `.md` files in your own folders.

**Status:** early development, version **0.5.1**. The supported build target is **macOS 14+ on Apple Silicon**. The interface is currently in Simplified Chinese. This is an independent project, unaffiliated with Typora; full feature and behavior parity is still in progress.

## Features

- **Live Markdown editing** — headings, inline formatting, lists, tasks, tables, links, footnotes, and YAML front matter. Edit code and formulas in place, or switch to the full source view.
- **A focused writing space** — outline navigation, focus and typewriter modes, word counts, find and replace, and local CSS themes.
- **Files you control** — folder tree, full-text search, quick open, recent files, autosave, session recovery, and external-change conflict detection.
- **Images, math, and diagrams** — local and pasted images, path and size controls, offline MathJax, and Mermaid rendering. Optional image uploads use a configured PicGo Server.
- **More than UTF-8** — UTF-16 LE/BE, GB18030, GBK, Big5, Shift JIS, and Windows-1252. Preserve BOM and line endings; reject saves that would lose characters.
- **Import and export** — built-in HTML and PDF export; additional formats such as DOCX, ODT, RTF, and EPUB through [Pandoc](https://pandoc.org/).

See the [feature checklist](docs/feature-parity.md) for coverage and known differences.

## Getting started

### Install on macOS

1. Download **[Open-Typora-0.5.1-arm64.dmg](https://github.com/AniChikage/open-typora/releases/download/v0.5.1/Open-Typora-0.5.1-arm64.dmg)** from [Releases](https://github.com/AniChikage/open-typora/releases/latest).
2. Open the DMG and drag **Open Typora** into **Applications**.
3. Launch Open Typora from Applications.

Requires **macOS 14 or later on Apple Silicon**. A ZIP alternative and SHA-256 checksums are included in the release. No Node.js, Xcode, or Typora installation is needed to use the app.

The application is locally signed and **not Apple-notarized**. macOS may ask you to approve opening it in **System Settings → Privacy & Security**. See [Apple's instructions](https://support.apple.com/en-us/102445). Never disable Gatekeeper to install it.

### Build from source

Build the macOS application from source. You need **Node.js 26**, npm, and the **Xcode Command Line Tools** (`xcode-select --install`). A Typora installation is not required.

```sh
git clone https://github.com/AniChikage/open-typora.git
cd open-typora
npm ci
npm run package:mac
```

Open `release/native/Open Typora.app`, or install it in `~/Applications`:

```sh
node scripts/install.mjs
```

Quit a running Open Typora before replacing it. The installer preserves application data and removes the previous application after verifying the replacement. The build also produces a ZIP in `release/native/`; `npm run package:release` builds the DMG and checksum file too.

Builds use a local ad hoc signature and are **not Apple-notarized**. Intel Macs, Windows, and Linux do not yet have verified release builds.

For additional document formats, install [Pandoc](https://pandoc.org/installing.html), then select its executable in Preferences if it is not detected. Pandoc is optional for writing Markdown and exporting HTML/PDF.

### First steps

Open a Markdown file or a folder, or try [the example document](examples/welcome.md). Click the text to edit it. Enter continues a list or creates a paragraph; Tab moves through table cells.

| Action | macOS shortcut |
| --- | --- |
| New document | `⌘N` |
| Open a file | `⌘O` |
| Save | `⌘S` |
| Toggle source view | `⌘/` |
| Find in the document | `⌘F` |
| Search the folder | `⌘⇧F` |
| Quick open | `⌘⇧O` |

## Development

```sh
npm ci
npm run dev:app
```

The development host uses Electron. The packaged macOS app uses **Swift/AppKit + WKWebView** with a TypeScript/React interface and an independently implemented editing model.

```sh
npm test                  # Editor and file-layer unit tests
npm run build             # Type checking and production frontend build
npm run test:native       # macOS filesystem tests
npm run test:webkit       # Native WebKit integration tests; requires Pandoc
```

More editor and desktop suites, test isolation, and build details are in [CONTRIBUTING.md](CONTRIBUTING.md). See [the architecture](docs/architecture.md) for the document model, editing history, and native bridge.

## Current limitations

- Documents are limited to 20 MB. Files over 300,000 characters open in source mode.
- Legacy encodings without a BOM require an explicit encoding choice.
- Rich editing and source editing have separate undo histories; changes made in source mode join the rich history as one transaction when returning.
- Format conversion can change layout or unsupported document structures. Some RTF image formats are rejected explicitly. Keep the original file when importing.
- Third-party themes, embedded media, input methods, and image-host integrations vary in compatibility. Consult the [checklist](docs/feature-parity.md) before depending on a specific workflow.

## Contributing

Bug reports, focused fixes, documentation, and reproducible compatibility examples are welcome. Start with [the contribution guide](CONTRIBUTING.md), then open an [issue](https://github.com/AniChikage/open-typora/issues) or a pull request.

## License

[MIT](LICENSE). Third-party dependencies retain their own licenses; the packaged application includes their notices. Open Sans is licensed under OFL, and MathJax and its bundled fonts use Apache-2.0.
