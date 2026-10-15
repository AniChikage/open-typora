import DOMPurify from "dompurify";
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
