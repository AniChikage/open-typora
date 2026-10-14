export function exportHtml(content: HTMLElement) {
  const styles = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
  ]
    .map(
      (link) =>
        `<link rel="stylesheet" href="${link.href.replaceAll('"', "&quot;")}" />`,
    )
    .join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>${styles}<style>
  html,body{margin:0!important;padding:0!important;height:auto!important;min-height:0!important;overflow:visible!important;background:white!important;color:#333!important}
  .print-document{display:flow-root!important;position:static!important;width:auto!important;max-width:none!important;padding:0 1px 0 0!important;font:13px/1.6 "Open Sans","PingFang SC",sans-serif;color:#333}
  .print-document h1{font-size:29px;line-height:1.2;margin:0 0 18px}.print-document h2{font-size:23px;margin:22px 0 12px}.print-document p{margin:12px 0}
  .print-document table{border-collapse:collapse;width:100%;margin:14px 0}.print-document th,.print-document td{border:1px solid #ddd;padding:6px 10px;text-align:left}
  .print-document .task-list-item{list-style:none}.print-document .task-list-item>input{margin-left:-20px;margin-right:6px}
  .print-document pre{background:#f8f8f8;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 Menlo,monospace}.print-document blockquote{border-left:3px solid #ddd;margin:12px 0;padding-left:14px;color:#666}
  .print-document img{max-width:100%;height:auto}.print-document .mathjax-node[data-display="true"]{display:block;text-align:center;margin:14px 0}.print-document svg{max-width:100%}
  </style></head><body>${content.outerHTML}</body></html>`;
}
