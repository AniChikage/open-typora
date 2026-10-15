import DOMPurify from "dompurify";
import { parseBlocks } from "./markdown.ts";
import { imageReferences } from "./images.ts";
export function exportHtml(content: HTMLElement) {
  const styles = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ]
    .map(
      (link) =>
        `<link rel="stylesheet" href="${link.href.replaceAll('"', "&quot;")}" />`,
    )
    .join("");
  const custom = [...document.querySelectorAll<HTMLStyleElement>("style[data-custom-theme]")].map(style => `<style>${style.textContent?.replace(/<\/style/gi, "<\\/style") || ""}</style>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>${styles}${custom}<style>
  html,body{margin:0!important;padding:0!important;height:auto!important;min-height:0!important;overflow:visible!important;background:white!important;color:#333!important}
  .print-document{display:flow-root!important;position:static!important;width:auto!important;max-width:none!important;padding:0 1px 0 0!important;font:13px/1.6 "Open Sans","PingFang SC",sans-serif;color:#333}
  .print-document h1{font-size:29px;line-height:1.2;margin:0 0 18px}.print-document h2{font-size:23px;margin:22px 0 12px}.print-document p{margin:12px 0}
  .print-document table{border-collapse:collapse;width:100%;margin:14px 0}.print-document th,.print-document td{border:1px solid #ddd;padding:6px 10px;text-align:left}
  .print-document .task-list-item{list-style:none}.print-document .task-list-item>input{margin-left:-20px;margin-right:6px}
  .print-document pre{background:#f8f8f8;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 Menlo,monospace}.print-document blockquote{border-left:3px solid #ddd;margin:12px 0;padding-left:14px;color:#666}
  .print-document img{max-width:100%;height:auto}.print-document .mathjax-node[data-display="true"]{display:block;text-align:center;margin:14px 0}.print-document svg{max-width:100%}
  </style></head><body>${content.outerHTML}</body></html>`;
}
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("无法读取导出资源。")); reader.readAsDataURL(blob);
  });
}
async function resource(url: string) {
  if (window.desktop?.readResource) {
    const response = await window.desktop.readResource(url);
    if (!response.ok) throw new Error(response.error);
    const { base64, mime } = response.value as { base64: string; mime: string };
    return { text: () => new TextDecoder().decode(Uint8Array.from(atob(base64), character => character.charCodeAt(0))), data: `data:${mime};base64,${base64}` };
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("无法读取导出资源。");
  const blob = await response.blob(); return { text: () => blob.text(), data: await dataUrl(blob) };
}
export async function portableHtml(content: HTMLElement, title: string) {
  const clone = content.cloneNode(true) as HTMLElement;
  const styles = await Promise.all([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(async link => {
    const response = await resource(link.href);
    let css = await response.text();
    const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map(match => match[1].trim().replace(/^["']|["']$/g, "")))];
    const embedded = await Promise.all(urls.filter(url => !/^(?:data:|#)/.test(url)).map(async url => [url, (await resource(new URL(url, link.href).href)).data] as const));
    for (const [url, data] of embedded) css = css.split(url).join(data);
    return css;
  }));
  await Promise.all([...clone.querySelectorAll<HTMLImageElement>("img")].map(async image => {
    if (image.src.startsWith("data:")) return;
    image.src = (await resource(image.src)).data; image.removeAttribute("loading");
  }));
  clone.innerHTML = DOMPurify.sanitize(clone.innerHTML, { ADD_URI_SAFE_ATTR: ["src"] });
  const safeTitle = title.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return exportHtml(clone).replace(/<link rel="stylesheet"[^>]+\/>/g, "").replace("<head>", `<head><title>${safeTitle}</title><style>${styles.join("\n")}</style>`);
}

async function diagramPNG(svg: SVGSVGElement) {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.viewBox.baseVal;
  const width = Math.ceil(box.width || svg.getBoundingClientRect().width || 640), height = Math.ceil(box.height || svg.getBoundingClientRect().height || 240);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg"); copy.setAttribute("width", String(width)); copy.setAttribute("height", String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(2, 4096 / Math.max(width, height)), canvas = document.createElement("canvas"); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d"); if (!context) throw new Error("无法生成图表图片。");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}
// Convert only on export. The editor's Markdown and undo history remain untouched.
export async function conversionMarkdown(source: string, rendered: HTMLElement) {
  const changes: { from: number; to: number; text: string }[] = [], resources = new Map<string, Promise<string>>();
  async function embed(url: string) {
    let pending = resources.get(url);
    if (!pending) {
      const address = [...rendered.querySelectorAll<HTMLImageElement>("img")].find(image => {
        try { return image.src.startsWith("open-typora-asset:") ? decodeURIComponent(new URL(image.src).pathname.split("/").slice(2).join("/")) === url : image.getAttribute("src") === url; } catch { return false; }
      })?.src;
      if (!address) throw new Error(`无法读取导出图片：${url}`);
      pending = address.startsWith("data:") ? Promise.resolve(address) : resource(address).then(value => value.data); resources.set(url, pending);
    }
    return pending;
  }
  for (const image of imageReferences(source)) {
    const data = await embed(image.url), alt = image.alt.replace(/[\\[\]]/g, c => "\\" + c);
    const dimensions = image.width || image.height ? `{${image.width ? `width=${image.width}` : ""} ${image.height ? `height=${image.height}` : ""}}` : "";
    let replacement = `![${alt}](${data})${dimensions}`;
    if (image.source.startsWith("<")) {
      const node = new DOMParser().parseFromString(DOMPurify.sanitize(image.source), "text/html").querySelector("img");
      if (!node) throw new Error("HTML 图片无法转换。"); node.setAttribute("src", data); replacement = node.outerHTML;
    }
    changes.push({ from: image.from, to: image.to, text: replacement });
  }
  const offsets = [0]; for (const line of source.split("\n")) offsets.push(offsets.at(-1)! + line.length + 1);
  const blocked = parseBlocks(source).filter(block => ["fence", "code_block", "frontmatter", "math_block"].includes(block.kind));
  for (const match of source.matchAll(/^ {0,3}\[([^\]^]+)\]:[ \t]*(<[^>\n]+>|[^ \t\n]+)(.*)$/gm)) {
    const label = match[1].toLowerCase();
    if (![...source.matchAll(/!\[([^\]]*)\](?:\[([^\]]*)\])?/g)].some(use => (use[2] || use[1]).toLowerCase() === label && source[use.index + use[0].length] !== "(")) continue;
    if (blocked.some(block => match.index >= offsets[block.fromLine - 1] && match.index < offsets[block.toLine])) continue;
    const url = match[2].replace(/^<|>$/g, "");
    changes.push({ from: match.index, to: match.index + match[0].length, text: `[${match[1]}]: ${await embed(url)}${match[3]}` });
  }
  const diagrams = [...rendered.querySelectorAll<HTMLElement>(".mermaid-block")]; let index = 0;
  for (const block of parseBlocks(source).filter(block => block.kind === "fence" && /^ {0,3}(?:`{3,}|~{3,})mermaid\s*(?:\r?\n|$)/.test(block.source))) {
    const diagram = diagrams[index++], svg = diagram?.querySelector<SVGSVGElement>("svg");
    if (!svg || diagram.classList.contains("diagram-error")) throw new Error("图表有语法错误，无法导出。");
    changes.push({ from: offsets[block.fromLine - 1], to: Math.min(source.length, offsets[block.toLine]), text: `![流程图](${await diagramPNG(svg)})\n\n` });
  }
  for (const change of changes.sort((a, b) => b.from - a.from)) source = source.slice(0, change.from) + change.text + source.slice(change.to);
  return source;
}
