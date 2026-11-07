Open Markdown Lane 0.24.3 adds system-language detection and English first-run notes.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Changes

- On first launch, Chinese system locales use Simplified Chinese; all other locales fall back to English. Linux respects `LC_ALL`, `LC_MESSAGES`, then `LANG`. Native macOS follows the preferred system language.
- New profiles continue following system-language changes until a language is chosen manually. Preferences also offers “Follow system language”.
- Remembered English and Chinese choices take precedence over the system language, including preferences saved under the previous product name.
- New English profiles start with **Welcome.md**, **Writing Example.md**, and **Markdown Guide.md** in **Sample Notes**. Existing notes, drafts, tabs and sample documents are restored without translation or replacement. Changing the interface language does not rewrite documents.
- First-run language and welcome-document checks run against native WebKit and installed Windows/Linux packages. Existing interaction suites now declare their Chinese fixture locale explicitly.

## Downloads

- macOS 14+, Apple Silicon: DMG or ZIP.
- Windows 10/11 x64: Setup.exe or ZIP.
- Linux x64: DEB or AppImage.

Verify all six packages with `SHA256SUMS.txt`. macOS is locally signed, not notarized; Windows is unsigned. macOS may request Documents-folder access again after an update.

The repeated-Enter and missing-file recovery fixes from 0.24.2 are retained.
