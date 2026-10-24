# Editor performance

Run the deterministic component benchmark from a development checkout:

```sh
npm ci
npm run bench:editor
```

It measures model replacements in 1,800 paragraphs (101,488 UTF-16 code units) and repeated rich rendering in a 350-paragraph document after a one-character edit near the middle. Parsing and rendering are timed separately. The render measurement uses JSDOM and excludes layout, painting, platform IMEs, file I/O and React. It is useful for detecting unnecessary work; it is not an end-to-end typing-latency benchmark or a speed guarantee for other machines.

An Apple Silicon macOS run with Node 26.7.0 and JSDOM 30.1.1 produced these medians for the same input and runner before and after the 0.13.0 changes:

| Operation | Before | After |
| --- | ---: | ---: |
| Model replacement, 1,800 paragraphs / 25 samples | 14.29 ms | 7.64 ms |
| Rich rendering, 350 paragraphs / 8 samples | 289.06 ms | 2.57 ms |

The model now indexes old blocks by kind and source while preserving distinct identities for repeated content. The rich view keeps unchanged DOM, updates source positions when blocks move, and refreshes blocks when document-wide references or rendering preferences change. Opening a session initializes the selected document first; other editors initialize on first use and remain mounted afterward so their in-memory histories survive tab and pane changes.

Small documents use full Markdown parsing. Large rendered documents reparse the affected block range; changes that alter parsing context can expand that range or require a complete parse. Complex diagrams, mathematical macros, huge tables, plugins and storage can dominate overall performance and need separate measurements. The workspace desktop suite validates correct editing and saving of a 700-paragraph document, but does not assert a hardware-dependent latency threshold.


## Large rendered documents in 0.15.0

Documents above 300,000 UTF-16 code units keep rendered editing enabled. The editor mounts visible blocks plus the caret/selection endpoints, keeps measured space for offscreen content and parses only the affected block range where its surrounding syntax remains stable. Headings, inline formatting, paragraphs, lists, tables and local code retain the existing editing interactions. Source mode remains available; its large-file configuration omits syntax highlighting and bracket matching. The editor file limit remains 20 MiB.

- Rendered block identities survive incremental edits, including local code IME updates and final candidate commits. Cross-viewport Markdown selection uses document positions rather than copying only mounted text.
- Source edits apply the changed range instead of replacing the entire document on every input event.
- Undo stores removed/inserted spans, up to 100 commands with a 16 MiB changed-text target (one larger latest change is retained). Delta strings are detached from the source so a substring cannot keep an entire older document alive. Small edits no longer retain a whole document copy per undo step.
- Outline and whole-document statistics run in a bundled worker after 250 ms of quiet time. The outline shows at most 2,000 headings; word counts in large files are estimates from source text. Pending results are labelled in the interface.
- Recovery snapshots wait 1.2 seconds of quiet time for large sessions. Normal window close waits for the latest recovery record to be written.

`npm run test:next` opens UTF-8 fixtures larger than 5 MiB and 10 MiB in Electron, checks rendered viewport virtualization, start/middle/end navigation, paragraph/list/table/code Chromium composition and single undo, source round trips, exact saved bytes, background outline, theme persistence and actual PDF page contents. The macOS `test:webkit` suite separately exercises a multi-megabyte rendered document and the bundled worker in native WKWebView.

A local Apple Silicon macOS Electron run recorded 1,971 ms from launch to the visible 5 MiB rendered editor. Twelve text-input-to-two-animation-frame samples were 33–60 ms (p95 60 ms). These are a small local automation sample, not physical-IME latency or a speed guarantee. Initial whole-document parsing, very large individual blocks, diagrams, plugins, storage and hardware can still dominate cost. CI records separate installed Windows/Linux measurements.

Unit tests also retain 100 separate small undo steps in a roughly 7 MiB Unicode/CRLF document and compare randomized edits/undo/redo against an independent string reference.

A separate Node/V8 heap regression uses a 5 MiB ASCII document and 100 independent 100-character replacements. After explicit garbage collection, retained-heap growth fell from about 500 MiB with source-backed substrings to about 5 MiB after detaching history deltas. The same check passes with Node 26.7.0 and 26.12.1. This isolates the document model; it is not the complete application's memory usage. The test also undoes all 100 changes exactly and runs in a fresh process with a conservative 32 MiB growth limit.
