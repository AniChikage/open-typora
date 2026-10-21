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

Full Markdown parsing still runs after edits. Documents above 300,000 characters use the virtualized source editor. Complex diagrams, mathematical macros, huge tables, plugins and storage can dominate overall performance and need separate measurements. The workspace desktop suite validates correct editing and saving of a 700-paragraph document, but does not assert a hardware-dependent latency threshold.
