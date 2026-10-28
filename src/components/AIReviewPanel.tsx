import { useEffect, useMemo, useRef, useState } from "react";
import { X, Settings2 } from "lucide-react";
import type { AISettings } from "../../shared/contracts";
import type { RewriteSelection } from "../editor/aiReview";
import { reviewedText, rewriteChanges } from "../editor/aiReview";
import { host } from "../host";
import { imeKey } from "../editor/composition";

export function AIReviewPanel({ selection, documentName, current, composing, apply, recapture, settings, settingsRevision, close, notify }: {
  selection: RewriteSelection; documentName: string; current: boolean; composing(): boolean;
  apply(text: string): boolean; recapture(): void; settings(): void; settingsRevision: number; close(): void; notify(message: string): void;
}) {
  const [instruction, setInstruction] = useState("改善表达，保持原意和 Markdown 格式。");
  const [config, setConfig] = useState<AISettings | null>(null), [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [rejected, setRejected] = useState<Set<number>>(() => new Set());
  const pending = useRef(""), alive = useRef(true), prompt = useRef<HTMLTextAreaElement>(null), promptComposing = useRef(false);
  useEffect(() => { let active = true; void host.aiSettings().then(value => { if (active) setConfig(value); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [settingsRevision]);
  useEffect(() => { alive.current = true; prompt.current?.focus({ preventScroll: true }); return () => { alive.current = false; const id = pending.current; pending.current = ""; if (id) void host.aiCancel(id).catch(() => {}); }; }, []);
  const changes = useMemo(() => result === null ? [] : rewriteChanges(selection.text, result), [selection.text, result]);
  const chosen = changes.length - rejected.size;
  const combined = useMemo(() => result === null ? "" : reviewedText(selection.text, changes, changes.map((_, index) => !rejected.has(index))), [selection.text, result, changes, rejected]);
  function blocked() { if (!composing() && !promptComposing.current) return false; notify("请先完成当前输入法组合输入。"); return true; }
  async function generate() {
    if (busy || blocked() || !instruction.trim() || !current) return;
    if (!config?.baseUrl || !config.model) { settings(); return; }
    const id = crypto.randomUUID(); pending.current = id; setBusy(true); setError(""); setResult(null); setRejected(new Set());
    try { const response = await host.aiRewrite({ id, instruction, text: selection.text }); if (alive.current && pending.current === id) setResult(response.text); }
    catch (error) { if (alive.current && pending.current === id) setError((error as Error).message); }
    finally { if (alive.current && pending.current === id) { pending.current = ""; setBusy(false); } }
  }
  function cancel() { const id = pending.current; pending.current = ""; setBusy(false); if (id) void host.aiCancel(id).catch(error => setError(error.message)); }
  return <aside className="ai-review-panel" aria-label="AI 改写选区">
    <div className="ai-panel-heading"><h2>改写选区</h2><button className="icon-button" aria-label="模型设置" title="模型设置" onClick={settings}><Settings2 size={16} /></button><button className="icon-button" aria-label="关闭 AI 改写" onClick={close}><X size={17}/></button></div>
    <div className="ai-panel-body">
      <p className="ai-target" title={documentName}>{documentName} · {selection.text.length.toLocaleString()} 字符</p>
      <p className="dialog-note">仅发送所选文字与改写要求。建议需经你审阅后才会写入文档。</p>
      {!current && <div className="ai-stale" role="status">原文或当前文档已变化，重新选择后再生成或应用。<button onPointerDown={event => event.preventDefault()} onClick={() => { if (!blocked()) recapture(); }}>读取当前选区</button></div>}
      <details className="ai-original"><summary>查看原始选区</summary><pre>{selection.text}</pre></details>
      <label className="ai-instruction">改写要求<textarea ref={prompt} aria-label="AI 改写要求" rows={3} maxLength={8000} value={instruction} onChange={event => setInstruction(event.target.value)} onCompositionStart={() => { promptComposing.current = true; }} onCompositionEnd={() => { promptComposing.current = false; }} onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !imeKey(event.nativeEvent)) { event.preventDefault(); void generate(); } }} /></label>
      <div className="ai-presets">{["更简洁，保留原意和数字", "润色，保持原有语气", "翻译成英文，保留 Markdown 格式"].map(value => <button key={value} disabled={busy} onClick={() => setInstruction(value)}>{value.startsWith("更") ? "更简洁" : value.startsWith("润") ? "润色" : "译为英文"}</button>)}</div>
      <div className="ai-generate"><span className="dialog-note">{config?.model || "尚未配置模型"}</span>{busy ? <button onClick={cancel}>取消生成</button> : <button className="primary-button" disabled={!current || !instruction.trim()} onPointerDown={event => { if (composing() || promptComposing.current) event.preventDefault(); }} onClick={() => void generate()}>{config?.model ? result === null ? "生成改写" : "重新生成" : "配置模型…"}</button>}</div>
      {busy && <p role="status" className="ai-status">正在生成，你可以继续编辑；原文变化后需重新选择。</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {result !== null && <section className="ai-diff" aria-label="改写差异">
        <div className="ai-diff-heading"><h3>{changes.length ? changes.length + " 处修改" : "与原文一致"}</h3>{changes.length > 0 && <><button onClick={() => setRejected(new Set())}>全部采用</button><button onClick={() => setRejected(new Set(changes.map((_, index) => index)))}>全部保留原文</button></>}</div>
        {changes.map((change, index) => <div className={"ai-change" + (rejected.has(index) ? " rejected" : "")} key={index}>
          <label className="checkbox-option"><input type="checkbox" aria-label={"采用第 " + (index + 1) + " 处修改"} checked={!rejected.has(index)} onChange={() => setRejected(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; })}/>第 {index + 1} 处{rejected.has(index) ? " · 保留原文" : " · 采用建议"}</label>
          <span className="ai-diff-label">原文</span><pre className="ai-removed">{change.before || "（无内容）"}</pre>
          <span className="ai-diff-label">建议</span><pre className="ai-added">{change.after || "（删除此处）"}</pre>
        </div>)}
      </section>}
    </div>
    {result !== null && <div className="ai-panel-footer"><button onClick={() => void host.writeClipboard(combined).then(() => notify("已复制审阅后的选区。")).catch(error => setError(error.message))}>复制结果</button><button className="primary-button" disabled={!current || !chosen} onPointerDown={event => { event.preventDefault(); }} onClick={() => { if (!blocked() && apply(combined)) close(); }}>应用 {chosen} 处修改</button></div>}
  </aside>;
}
