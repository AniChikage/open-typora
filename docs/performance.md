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

Documents above 300,000 UTF-16 code units keep rendered editing enabled. The editor mounts visible blocks plus the caret/selection endpoints, keeps measured space for offscreen content and parses only the affected block range where its surrounding syntax remains stable. Headings, inline formatting, paragraphs, lists, tables and local code retain the existing editing interactions. Source mode remains available; its large-file configuration omits syntax highlighting and bracket matching. The fixed 20 MiB Markdown limit was removed in 0.16.2; see the large-block validation below.

- Rendered block identities survive incremental edits, including local code IME updates and final candidate commits. Cross-viewport Markdown selection uses document positions rather than copying only mounted text.
- Source edits apply the changed range instead of replacing the entire document on every input event.
- Undo stores removed/inserted spans, up to 100 commands with a 16 MiB changed-text target (one larger latest change is retained). Delta strings are detached from the source so a substring cannot keep an entire older document alive. Small edits no longer retain a whole document copy per undo step.
- Outline and whole-document statistics run in a bundled worker after 250 ms of quiet time. The outline shows at most 2,000 headings; word counts in large files are estimates from source text. Pending results are labelled in the interface.
- Recovery snapshots wait 1.2 seconds of quiet time for large sessions. Normal window close waits for the latest recovery record to be written.

`npm run test:next` opens UTF-8 fixtures larger than 5 MiB and 10 MiB in Electron, checks rendered viewport virtualization, start/middle/end navigation, paragraph/list/table/code Chromium composition and single undo, source round trips, exact saved bytes, background outline, theme persistence and actual PDF page contents. The macOS `test:webkit` suite separately exercises a multi-megabyte rendered document and the bundled worker in native WKWebView.

A local Apple Silicon macOS Electron run recorded 1,971 ms from launch to the visible 5 MiB rendered editor. Twelve text-input-to-two-animation-frame samples were 33–60 ms (p95 60 ms). These are a small local automation sample, not physical-IME latency or a speed guarantee. Initial whole-document parsing, very large individual blocks, diagrams, plugins, storage and hardware can still dominate cost. CI records separate installed Windows/Linux measurements.

Unit tests also retain 100 separate small undo steps in a roughly 7 MiB Unicode/CRLF document and compare randomized edits/undo/redo against an independent string reference.

A separate Node/V8 heap regression uses a 5 MiB ASCII document and 100 independent 100-character replacements. After explicit garbage collection, retained-heap growth fell from about 500 MiB with source-backed substrings to about 5 MiB after detaching history deltas. The same check passes with Node 26.7.0 and 26.12.1. This isolates the document model; it is not the complete application's memory usage. The test also undoes all 100 changes exactly and runs in a fresh process with a conservative 32 MiB growth limit.

## Large blocks and file sizes in 0.16.2

Markdown open, encoded save, draft registration and recovery no longer reject files at 20 MiB. They still load source in memory; available RAM, runtime string/IPC limits and storage determine practical sizes. This is not a disk-backed unlimited-size editor. Converted imports and media retain separate budgets.

- Code bodies use computed source-position maps instead of a number for every UTF-16 unit. Plain fences map edits as changed spans, use indexed cursor lines and avoid redundant whole-code scans.
- Code bodies above 100,000 characters use bounded read-only/editable CodeMirror viewports. They omit syntax highlighting and soft wrapping; their full text remains available, with horizontal/vertical scrolling, selection, IME and undo.
- Tables of 200 or more rows, or over 50,000 characters, use an inner row viewport and a sticky header. Measured row heights, logical cell navigation and local row operations retain the complete Markdown source. Unchanged visible rows keep their DOM and caret when scrolling. Obsolete spacers are removed before reconciling rows, and passive redraws preserve selection. This also protects empty cells created with Tab.
- Regular top-level pipe tables avoid parsing inline tokens for offscreen cells while indexing document blocks. Irregular rows, nested structures and footnote-bearing tables use the general parser and can have higher initial cost. Print/export still render the complete source.

`npm run test:huge` opens an actual 36,260,060-byte UTF-8 code file through the desktop file-open path, checks bounded DOM, typing, Chinese composition, undo and exact bytes. An 80,000-row / 7,417,850-byte table checks tail navigation, cell edits, composition, Tab-created rows, the empty-cell caret position, exact appended source and exact undo. It restarts with a dirty large file and saves after source/rendered round trips. The installed Windows executable, installed Linux DEB and extracted AppImage payload run this suite in CI. Native store tests separately verify 32 MiB open/save/recovery and encoded UTF-16 output over 64 MiB; native WebKit exercises giant code and table viewports.

After the caret fix, one local 80,000-row append/type/save sample completed in 277 ms.

One local Apple Silicon Electron sample opened the code viewport in 606 ms and the table in 89 ms. Six code-input samples were 38–537 ms (median 43 ms); the cell edit sample was 34 ms. These include a background-work spike, are small automation samples and are not physical-IME latency or hardware-independent guarantees. Large initial parses, complex individual cells, unusual nested syntax, plugins and simultaneous large tabs can still be expensive.


## Local block edits in 0.16.3

Code-block edits validate the affected lines and the original closing boundary. Ordinary newlines, indentation and punctuation keep the existing block index; edits that expose or remove a closing fence fall back to parsing. Following block and heading line numbers include the inserted/removed newline count. Table body changes use the same conservative approach for regular pipe rows; header syntax, irregular rows and footnote context retain the general parser.

The table viewport updates its line index from the edited span, shifts remaining numeric offsets and reuses unchanged visible row elements. It updates their compact source positions and recreates changed rows. Cached row/cell text is detached from the old source string. Repeated compact position shifts accumulate one offset instead of nesting mapper calls; the unit regression checks 25,000 shifts.

Unicode Backspace/Delete use the segment containing the caret instead of collecting every preceding grapheme. Table escape checks walk only the adjacent backslashes, and emoji completion inspects a bounded suffix. Family emoji, flags, skin-tone sequences and combining accents remain atomic.

A paired local Apple Silicon Electron run used the same 80,000-row / 7,417,850-byte UTF-8 fixture, isolated profiles and 1,300 × 900 viewport. Input measurements include the event and two animation frames; row operations include the save assertion:

| Operation | 0.16.2 | 0.16.3 |
| --- | ---: | ---: |
| Tail cell Backspace | 451 ms | 35 ms |
| Tail cell Chinese insertion | 51 ms | 27 ms |
| Append row, type and save | 268 ms | 169 ms |

The 0.16.3 run also measured 21 ms for middle-row family-emoji Backspace, 143 ms for middle-row insertion/type/save and 59 ms for Enter plus a backtick-containing line in the 36,260,060-byte code file. Saved content and undo were checked against the entire expected file, including all unaffected rows and fence bytes. The suite still checks composition, bounded DOM, dialog focus and dirty large-file restart recovery. Installed Windows/Linux CI reports separate measurements.

A separate Node component benchmark used a 37,400,034-byte code document and four edit/undo samples per operation. Model-only newline replacements changed from 331–395 ms to 5–20 ms; backtick replacements changed from 311–347 ms to 5–6 ms. These exclude layout, paint, platform IMEs, persistence and React. The desktop timings above are small local samples, not speed guarantees or physical-IME latency. Initial parsing, very wide tables, column-wide changes, complex cells, plugins and concurrent large tabs still need their own cost budgets.
