# Diagram compatibility

Open Typora renders `mermaid` fences offline. Version 0.8 also accepts a common subset of the legacy `sequence` and `flow` syntax described in [Typora's public documentation](https://support.typora.io/Draw-Diagrams-With-Markdown/).

Legacy syntax is translated only for rendering. Your Markdown file, source view, undo history and code fence language retain the original text. The layout uses Mermaid and will differ from js-sequence / flowchart.js.

## Sequence diagrams

```sequence
Alice->Bob: Hello Bob
Note right of Bob: Bob thinks
Bob-->Alice: I am good thanks
```

Supported: inferred participants, `participant Name`, `Title: ...`, solid/dashed messages (`->`, `-->`), open arrows (`->>`, `-->>`), self messages, and notes to the left, right or over one/two participants. Names may include spaces and Unicode.

Hand-drawn themes, custom CSS and other js-sequence extensions are not implemented.

## Flowcharts

```flow
st=>start: Start
op=>operation: Work
cond=>condition: Ready?
e=>end: End
st->op->cond
cond(yes)->e
cond(no)->op
```

Supported node types: `start`, `end`, `operation`, `inputoutput`, `subroutine`, `condition`. Paths may chain nodes, loop back, and label branches with `yes`, `no`, `true`, or `false`.

Flow states (`|approved`), hyperlinks (`:>`), directional hints, parallel nodes and custom flowchart.js styling are not implemented. Unsupported lines or missing nodes cause the complete diagram to show its original source with an error tooltip. They are never silently omitted.

## Export

HTML and PDF include rendered SVGs. Pandoc exports replace rendered diagrams with PNG images in the exported copy, while the Markdown document remains unchanged. A diagram with an error blocks converted export so it cannot be mistaken for a complete figure.

Mermaid itself supports more diagram types than this legacy subset. Use a `mermaid` fence for new documents when possible.
