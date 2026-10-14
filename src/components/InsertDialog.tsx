import { useState } from "react";
import { Dialog } from "./Dialog";
export type InsertKind = "table" | "link" | "footnote";
export function InsertDialog({ kind, selected, close, submit }: { kind: InsertKind; selected: string; close(): void; submit(value: { rows?: number; columns?: number; value?: string; label?: string }): void }) {
  const [rows, setRows] = useState(3), [columns, setColumns] = useState(2), [label, setLabel] = useState(selected), [value, setValue] = useState(kind === "link" ? "https://" : ""), [error, setError] = useState("");
  const title = kind === "table" ? "插入表格" : kind === "link" ? "插入超链接" : "插入脚注";
  return <Dialog title={title} close={close}><form onSubmit={event => {
    event.preventDefault();
    if (kind === "link" && !/^(?:https?:\/\/[^\s]+|mailto:[^\s]+|#[^\s]+|(?:\.\.?\/)?[^\s:]+\.md(?:#[^\s]+)?)$/i.test(value.trim())) { setError("请输入网址、标题锚点或 Markdown 文件的相对路径。"); return; }
    submit(kind === "table" ? { rows, columns } : { value: value.trim(), label });
  }}>
    {kind === "table" ? <div className="form-grid"><label>行数（含表头）<input type="number" min={2} max={100} value={rows} onChange={e => setRows(Number(e.target.value))} required /></label><label>列数<input type="number" min={1} max={30} value={columns} onChange={e => setColumns(Number(e.target.value))} required /></label></div> : <>
      {kind === "link" && <label>显示文字<input value={label} onChange={e => setLabel(e.target.value)} placeholder="链接文字" /></label>}
      <label>{kind === "link" ? "链接地址" : "脚注内容"}{kind === "footnote" ? <textarea rows={4} value={value} onChange={e => setValue(e.target.value)} required /> : <input value={value} onChange={e => { setValue(e.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? "insert-error" : undefined} required />}</label>
    </>}
    {error && <p id="insert-error" className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button type="button" onClick={close}>取消</button><button className="primary-button" type="submit">插入</button></div>
  </form></Dialog>;
}
