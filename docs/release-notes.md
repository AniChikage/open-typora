Open Typora 0.15.0 adds large-document rendered editing and complete Windows Markdown previews.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

| Platform | Recommended | Alternative |
| --- | --- | --- |
| macOS 14+, Apple Silicon | `Open-Typora-0.15.0-arm64.dmg` | macOS ZIP |
| Windows 10/11, x64 | `Open-Typora-0.15.0-windows-x64-Setup.exe` | Windows ZIP |
| Linux x64 | `Open-Typora-0.15.0-linux-x64.deb` | AppImage |

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned.

## Changes

- **Large rendered documents:** files above 300,000 characters keep live editing enabled. Only visible blocks and selection endpoints mount, and ordinary edits reparse their affected block range. Tests edit and save 5/10 MiB files exactly, navigate to offscreen headings and round-trip source mode. Code blocks retain their identity through Chinese marked text, candidate commit and undo. Distant reference definitions remain available when updating headings and footnotes.
- **Complete Windows previews:** removes the old 1 MiB truncation. The read-only preview loads the complete source and renders visible blocks. Jumping to the end remains anchored when text wraps in narrow panes or images finish loading. Standard file/Shell Item initialization preserves the document directory in Everything; anonymous stream initialization is no longer advertised.
- **Relative preview images:** resolves folder and parent-relative images with Chinese/space filenames and URL encoding. The native handler serves image bytes from the selected document's path. Remote resources, plugins and document scripts remain blocked; WebView2's normal isolation remains enabled.
- Existing themes, print controls, local files, tabs, split panes and recovery remain available.

## Validation and limits

Unit regressions compare incremental block structure and heading IDs against full parsing, verify composition/source-session undo and retain exact UTF-16/CRLF history. Native WebKit and installed Electron suites exercise existing editor, plugin, conversion and PDF paths. The large rich fixture includes Chinese composition in its middle paragraph, list, table and local code. Chromium event tests do not substitute for all physical input methods.

Windows acceptance hosts the registered handler through real file and Shell Item COM interfaces and uses actual Everything 1.4.1.1032. A 5+ MiB fixture checks its final heading and actual image pixels for Chinese/space parent-relative image paths; source hashes and prior-handler restoration are checked. The bundled preview also has a separate full-document message/rendering test.

The editor still limits files to 20 MiB. Preview has no fixed byte cap, but memory and platform decoding limits apply. Very large individual blocks, arbitrary themes/plugins and complex layouts are not universally covered. Initial parsing can still be expensive. Linux acceptance uses Ubuntu 22.04 and the extracted AppImage payload; real FUSE mounting and this version on a complete Kubuntu 26.04 desktop remain unverified. See the [feature checklist](https://github.com/AniChikage/open-typora/blob/main/docs/feature-parity.md).
