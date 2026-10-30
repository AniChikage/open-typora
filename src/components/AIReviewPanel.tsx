import { useEffect, useMemo, useRef, useState } from "react";
import { X, Settings2 } from "lucide-react";
import type { ContextPickerHandle } from "./ContextPicker";
import { ContextPicker } from "./ContextPicker";
import { modelContexts, retrieve } from "../knowledge";
import type { ReferenceFile } from "../knowledge";
import { t } from "../i18n";
import type { DocumentRecord, AISettings } from "../../shared/contracts";
import type { RewriteSelection } from "../editor/aiReview";
import { reviewedText, rewriteChanges } from "../editor/aiReview";
import { host } from "../host";
import { imeKey } from "../editor/composition";

export function AIReviewPanel({ selection, documentName, current, composing, files, documents, apply, recapture, settings, settingsRevision, close, notify }: {
  selection: RewriteSelection; documentName: string; current: boolean; composing(): boolean;
  files: ReferenceFile[]; documents: DocumentRecord[];
  apply(text: string): Promise<boolean>; recapture(): void; settings(): void; settingsRevision: number; close(): void; notify(message: string): void;
}) {
  const [instruction, setInstruction] = useState(() => t("改善表达，保持原意和 Markdown 格式。"));
  const [references, setReferences] = useState<ReferenceFile[]>([]), [mention, setMention] = useState<string | null>(null), [applying, setApplying] = useState(false);
  const retrieval = useRef<AbortController | null>(null), picker = useRef<ContextPickerHandle>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [config, setConfig] = useState<AISettings | null>(null), [result, setResult] = useState<string | null>(null);
  const [applied, setApplied] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [rejected, setRejected] = useState<Set<number>>(() => new Set());
  const pending = useRef(""), alive = useRef(true), prompt = useRef<HTMLTextAreaElement>(null), promptComposing = useRef(false);
  useEffect(() => { let active = true; setConfigLoading(true); void host.aiSettings().then(value => { if (active) setConfig(value); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setConfigLoading(false); }); return () => { active = false; }; }, [settingsRevision]);
  useEffect(() => { alive.current = true; prompt.current?.focus({ preventScroll: true }); return () => { alive.current = false; retrieval.current?.abort(); const id = pending.current; pending.current = ""; if (id) void host.aiCancel(id).catch(() => {}); }; }, []);
  const changes = useMemo(() => result === null ? [] : rewriteChanges(selection.text, result), [selection.text, result]);
  const chosen = changes.length - rejected.size;
  const combined = useMemo(() => result === null ? "" : reviewedText(selection.text, changes, changes.map((_, index) => !rejected.has(index))), [selection.text, result, changes, rejected]);
  function blocked() { if (!composing() && !promptComposing.current) return false; notify(t("请先完成当前输入法组合输入。")); return true; }
  async function generate() {
    if (busy || configLoading || blocked() || !instruction.trim() || !selection.text.trim() || !current) return;
    if (!config?.baseUrl || !config.model) { settings(); return; }
    const id = crypto.randomUUID(); pending.current = id; setBusy(true); setError(""); setApplied(0); setResult(null); setRejected(new Set());
    try {
      const abort = new AbortController(); retrieval.current = abort;
      const context = references.length ? await retrieve(references, documents, instruction, abort.signal, true) : null;
      if (!alive.current || pending.current !== id) return;
      if (context && (context.skipped || context.limited || !context.evidence.length)) throw new Error(t("部分参考资料无法读取，请移除后重试。未发送任何资料。"));
      const response = await host.aiRewrite({ id, instruction, text: selection.text, ...(context ? { contexts: modelContexts(context.evidence) } : {}) }); if (alive.current && pending.current === id) setResult(response.text); }
    catch (error) { if (alive.current && pending.current === id) setError((error as Error).message); }
    finally { if (alive.current && pending.current === id) { pending.current = ""; setBusy(false); } }
  }
  async function accept() {
    if (blocked() || applying || !current || !chosen || result === null) return;
    setApplying(true);
    try { if (!await apply(combined) || !alive.current) return; setApplied(chosen); setResult(null); setRejected(new Set()); setError(""); }
    catch (error) { if (alive.current) setError((error as Error).message); }
    finally { if (alive.current) setApplying(false); }
  }
  function cancel() { retrieval.current?.abort(); const id = pending.current; pending.current = ""; setBusy(false); if (id) void host.aiCancel(id).catch(error => setError(error.message)); }
  return <aside className="ai-review-panel" aria-label={t("AI 改写选区")}>
    <div className="ai-panel-heading"><h2>{t("改写选区")}</h2><button className="icon-button" aria-label={t("模型设置")} title={t("模型设置")} onClick={settings}><Settings2 size={16} /></button><button className="icon-button" aria-label={t("关闭 AI 改写")} onClick={close}><X size={17}/></button></div>
    <div className="ai-panel-body">
      <p className="ai-target" title={documentName}>{documentName} · {selection.text.length.toLocaleString()} {t("字符")}</p>
      <p className="dialog-note">{references.length ? t("将发送所选文字、改写要求和所选文件的相关片段。") : t("仅发送所选文字与改写要求。建议需经你审阅后才会写入文档。")}</p>
      {!current && <div className="ai-stale" role="status">{t("原文或当前文档已变化，重新选择后再生成或应用。")}<button onPointerDown={event => event.preventDefault()} onClick={() => { if (!blocked()) recapture(); }}>{t("读取当前选区")}</button></div>}
      {applied > 0 && current && <div className="ai-applied" role="status"><strong>{t("已应用 {0} 处修改", applied)}</strong><p>{selection.text.trim() ? t("可调整要求继续改写，也可读取其他选区。") : t("选区已清空，请选择其他文字后读取当前选区。")}</p><button onPointerDown={event => event.preventDefault()} onClick={() => { if (!blocked()) recapture(); }}>{t("读取当前选区")}</button></div>}
      <details className="ai-original"><summary>{applied ? t("查看当前选区") : t("查看原始选区")}</summary><pre>{selection.text}</pre></details>
      <label className="ai-instruction">{t("改写要求")}<textarea ref={prompt} aria-label={t("AI 改写要求")} rows={3} maxLength={8000} value={instruction} onChange={event => { setInstruction(event.target.value); const match = event.target.value.match(/@([^@\s\n]*)$/u); setMention(!promptComposing.current && match ? match[1] : null); }} onCompositionStart={() => { promptComposing.current = true; }} onCompositionEnd={() => { promptComposing.current = false; }} onKeyDown={event => { if (picker.current?.keyDown(event)) return; if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !imeKey(event.nativeEvent)) { event.preventDefault(); void generate(); } }} /></label>
      <ContextPicker ref={picker} files={files} selected={references} disabled={busy || applying} mention={mention} dismissed={() => setMention(null)} consumed={() => { if (mention !== null) setInstruction(value => value.replace(/@[^@\s\n]*$/u, "")); setMention(null); prompt.current?.focus(); }} change={value => { setReferences(value); setResult(null); setApplied(0); }} />
      <div className="ai-presets">{[["更简洁", "更简洁，保留原意和数字"], ["润色", "润色，保持原有语气"], ["译为英文", "翻译成英文，保留 Markdown 格式"]].map(([label, value]) => <button key={label} disabled={busy} onClick={() => setInstruction(t(value))}>{t(label)}</button>)}</div>
      <div className="ai-generate"><span className="dialog-note">{configLoading ? t("正在读取模型配置…") : config?.model || t("尚未配置模型")}</span>{busy ? <button onClick={cancel}>{t("取消生成")}</button> : <button className="primary-button" disabled={configLoading || !current || !selection.text.trim() || !instruction.trim()} onPointerDown={event => { if (composing() || promptComposing.current) event.preventDefault(); }} onClick={() => void generate()}>{configLoading ? t("正在读取配置…") : config?.model ? result === null ? applied ? t("继续改写") : t("生成改写") : t("重新生成") : t("配置模型…")}</button>}</div>
      {busy && <p role="status" className="ai-status">{t("正在生成，你可以继续编辑；原文变化后需重新选择。")}</p>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      {result !== null && <section className="ai-diff" aria-label={t("改写差异")}>
        <div className="ai-diff-heading"><h3>{changes.length ? t("{0} 处修改", changes.length) : t("与原文一致")}</h3>{changes.length > 0 && <><button onClick={() => setRejected(new Set())}>{t("全部采用")}</button><button onClick={() => setRejected(new Set(changes.map((_, index) => index)))}>{t("全部保留原文")}</button></>}</div>
        {changes.map((change, index) => <div className={"ai-change" + (rejected.has(index) ? " rejected" : "")} key={index}>
          <label className="checkbox-option"><input type="checkbox" aria-label={t("采用第 {0} 处修改", index + 1)} checked={!rejected.has(index)} onChange={() => setRejected(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; })}/>{t("第 {0} 处", index + 1)}{rejected.has(index) ? t(" · 保留原文") : t(" · 采用建议")}</label>
          <span className="ai-diff-label">{t("原文")}</span><pre className="ai-removed">{change.before || t("（无内容）")}</pre>
          <span className="ai-diff-label">{t("建议")}</span><pre className="ai-added">{change.after || t("（删除此处）")}</pre>
        </div>)}
      </section>}
    </div>
    {result !== null && <div className="ai-panel-footer"><button onClick={() => void host.writeClipboard(combined).then(() => notify(t("已复制审阅后的选区。"))).catch(error => setError(error.message))}>{t("复制结果")}</button><button className="primary-button" disabled={applying || !current || !chosen} onPointerDown={event => { event.preventDefault(); }} onClick={() => void accept()}>{t("应用 {0} 处修改", chosen)}</button></div>}
  </aside>;
}
