export const samples = [
  {
    id: "welcome", label: "A clear page", name: "a-clear-page.md",
    content: `# A clear page

A little room to think. A place for your next idea.

This is **Open Typora**, an open-source Markdown editor. Click anywhere in this document and start writing. You're editing the page itself.

## Make it yours

- [x] Open a document without installing anything
- [ ] Rewrite this sentence in your own words
- [ ] Add one thing you want to make today

> Good tools leave room for the work.

## From a thought to a plan

| Step | A small next action |
| --- | --- |
| Think | Write the rough idea |
| Shape | Give it a heading and a list |
| Keep | Download the Markdown file |

Press **Tab** to move between table cells. Switch to **Source** to see the Markdown; your edits stay with you.

### A few familiar shortcuts

Use **⌘ / Ctrl + B** for bold, **⌘ / Ctrl + I** for italics, and **⌘ / Ctrl + Z** to undo. Select text first, or use the toolbar above.

---

Your writing stays in this tab. Download a copy before you leave; refreshing clears the document. The desktop app adds local folders, recovery, and PDF / HTML export.
`,
  },
  {
    id: "chinese", label: "中文写作", name: "一页笔记.md",
    content: `# 给想法留一页纸

先写下来，再慢慢整理。

这是 Open Typora 的网页试玩。点击正文就能编辑，也可以切到 **Source** 查看 Markdown。它与桌面版使用同一套编辑内核。

## 今天要做的事

- [x] 留出一段不被打断的时间
- [ ] 写清楚最想解决的一个问题
- [ ] 下载这份笔记，留给明天的自己

> 不必一开始就写得漂亮，先把事情说清楚。

| 想法 | 下一步 |
| --- | --- |
| 一篇文章 | 写一个能解释问题的开头 |
| 一个工具 | 先做好最常用的一次操作 |

选中文字试试 **加粗**、*斜体*，或者在表格里按 Tab。中文输入完成后，也可以试试撤销和重做。

---

内容只保留在当前标签页，刷新会清空。下载 Markdown 可以保留修改。试玩仅导入 UTF-8 文本，不加载文档里的外部图片或媒体。
`,
  },
  {
    id: "technical", label: "Code, math & diagrams", name: "working-notes.md",
    content: `# Working notes

An idea is easier to share when the explanation and the details live together.

## A small function

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}.\`;
}
\`\`\`

## Write the relationship

For a circle with radius $r$, the area is:

$$
A = \\pi r^2
$$

## Show the next step

\`\`\`mermaid
flowchart LR
  Idea --> Draft
  Draft --> Review
  Review --> Share
\`\`\`

Switch to **Source** to change the formula or diagram, then come back to **Live** to see it rendered.
`,
  },
  { id: "blank", label: "Blank document", name: "untitled.md", content: "" },
] as const;
