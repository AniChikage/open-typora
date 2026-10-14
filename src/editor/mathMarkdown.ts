import type { MarkdownIt, RendererRule } from "markdown-it";
export function configureMath(md: MarkdownIt) {
  md.inline.ruler.before("emphasis", "math_inline", (state, silent) => {
    const start = state.pos;
    if (state.src[start] !== "$") return false;
    const marker = state.src[start + 1] === "$" ? "$$" : "$",
      body = start + marker.length;
    if (/\s/.test(state.src[body] || "") || body >= state.posMax) return false;
    let end = state.src.indexOf(marker, body);
    while (end >= 0) {
      let escapes = 0;
      for (let p = end - 1; p >= body && state.src[p] === "\\"; p--) escapes++;
      if (!(escapes % 2)) break;
      end = state.src.indexOf(marker, end + marker.length);
    }
    if (
      end < 0 ||
      end >= state.posMax ||
      /\s/.test(state.src[end - 1]) ||
      (marker === "$" && /\d/.test(state.src[end + 1] || "")) ||
      state.src.slice(body, end).includes("\n")
    )
      return false;
    if (!silent) {
      const token = state.push("math_inline", "span", 0);
      token.content = state.src.slice(body, end);
      token.markup = marker;
      token.meta = { display: marker === "$$" };
    }
    state.pos = end + marker.length;
    return true;
  });
  md.block.ruler.before(
    "fence",
    "math_block",
    (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine],
        opening = state.src.slice(start, state.eMarks[startLine]);
      if (!opening.startsWith("$$")) return false;
      let line = startLine,
        end = opening.indexOf("$$", 2),
        bodyStart = start + 2;
      if (end >= 0) {
        if (opening.slice(end + 2).trim()) return false;
        end += start;
      } else {
        for (line = startLine + 1; line < endLine; line++) {
          const content = state.src.slice(
            state.bMarks[line] + state.tShift[line],
            state.eMarks[line],
          );
          if (/^\$\$\s*$/.test(content)) {
            end = state.bMarks[line] + state.tShift[line];
            break;
          }
        }
        if (end < 0) return false;
      }
      if (silent) return true;
      const token = state.push("math_block", "div", 0);
      token.block = true;
      token.content = state.src.slice(bodyStart, end).trim();
      token.markup = "$$";
      token.map = [startLine, line + 1];
      token.meta = { display: true };
      state.line = line + 1;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );
  const render: RendererRule = (tokens, index) => {
    const token = tokens[index];
    return `<span class="mathjax-node" data-tex="${md.utils.escapeHtml(token.content)}" data-display="${!!token.meta?.display}">${md.utils.escapeHtml(token.content)}</span>`;
  };
  md.renderer.rules.math_inline = render;
  md.renderer.rules.math_block = (
    tokens,
    index,
    options,
    environment,
    renderer,
  ) =>
    `<div class="math-display">${render(tokens, index, options, environment, renderer)}</div>\n`;
}
