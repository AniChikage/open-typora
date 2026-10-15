import { useState } from "react";
import { Dialog } from "./Dialog";
import { host } from "../host";
import { imageMarkdown } from "../editor/images";
import type { ImageReference } from "../editor/images";
export function ImageDialog({ image, documentId, options, submit, close }: { image: ImageReference; documentId: string; options: Record<string, unknown>; submit(source: string): void; close(): void }) {
  const [url, setUrl] = useState(image.url), [alt, setAlt] = useState(image.alt), [width, setWidth] = useState(image.width), [height, setHeight] = useState(image.height), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function action(kind: string) { setBusy(true); setError(""); try { const mapping = await host.imageAction(documentId, [url], kind, options); if (mapping && Object.hasOwn(mapping, url)) { if (kind === "delete") { submit(""); close(); } else { submit(imageMarkdown(mapping[url], alt, width, height)); close(); } } } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const valid = (value: string) => !value || /^\d+(?:\.\d+)?%?$/.test(value);
  return <Dialog title="编辑图片" close={() => { if (!busy) close(); }}><form onSubmit={event => { event.preventDefault(); if (valid(width) && valid(height)) { submit(imageMarkdown(url, alt, width, height)); close(); } }}>
    <label className="workspace-field">图片地址<input aria-label="图片地址" value={url} required onChange={e => setUrl(e.target.value)} /></label><label className="workspace-field">替代文字<input aria-label="图片替代文字" value={alt} onChange={e => setAlt(e.target.value)} /></label>
    <div className="form-grid"><label>宽度<input aria-label="图片宽度" placeholder="自动，例如 400 或 50%" value={width} onChange={e => setWidth(e.target.value)} /></label><label>高度<input aria-label="图片高度" placeholder="自动" value={height} onChange={e => setHeight(e.target.value)} /></label></div>
    <div className="image-actions"><button type="button" disabled={busy} onClick={() => void action("copy")}>复制到…</button><button type="button" disabled={busy} onClick={() => void action("move")}>移动 / 重命名…</button><button type="button" disabled={busy} onClick={() => void action("upload")}>上传图片</button><button type="button" disabled={busy} onClick={() => void action("delete")}>删除图片文件…</button></div>
    {error && <p role="alert" className="form-error">{error}</p>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button className="primary-button" disabled={busy || !url || !valid(width) || !valid(height)}>{busy ? "正在处理…" : "应用"}</button></div>
  </form></Dialog>;
}
