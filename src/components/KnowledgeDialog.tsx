import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentRecord, FileEntry } from '../../shared/contracts';
import { answerMarkdown, citedAnswer } from '../../shared/knowledge.mts';
import type { CitedAnswer, Evidence } from '../../shared/knowledge.mts';
import { modelContexts, referenceFiles, retrieve } from '../knowledge';
import { host } from '../host';
import { imeKey } from '../editor/composition';
import { t } from '../i18n';
import { Dialog } from './Dialog';
export function KnowledgeDialog({ documents, files, folder, targetPath, composing, navigate, insert, settings, close }: {
  documents: DocumentRecord[]; files: FileEntry[]; folder: string | null; targetPath: string | null; composing(): boolean;
  navigate(source: Evidence): Promise<void>; insert(text: string, draft: boolean): Promise<boolean>; settings(): void; close(): void;
}) {
  const [viewing, setViewing] = useState(false);
  const [question, setQuestion] = useState(''), [scope, setScope] = useState(folder ? 'folder' : 'open');
  const [evidence, setEvidence] = useState<Evidence[]>([]), [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [answer, setAnswer] = useState<CitedAnswer | null>(null), [sent, setSent] = useState<Evidence[]>([]);
  const [busy, setBusy] = useState<'search' | 'model' | 'insert' | null>(null), [error, setError] = useState(''), [report, setReport] = useState(''), [progress, setProgress] = useState('');
  const controller = useRef<AbortController | null>(null), pending = useRef(''), alive = useRef(true), promptComposing = useRef(false), revision = useRef(0);
  const options = useMemo(() => referenceFiles(documents, scope === 'folder' ? files : []).filter(file => scope !== 'folder' || !folder || !!file.path && (file.path === folder || file.path.startsWith(folder + '/') || file.path.startsWith(folder + '\\'))), [documents, files, scope, folder]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); if (pending.current) void host.aiCancel(pending.current).catch(() => {}); }; }, []);
  function cancel() { revision.current++; controller.current?.abort(); const id = pending.current; pending.current = ''; if (id) void host.aiCancel(id).catch(() => {}); setBusy(null); }
  function changed() { cancel(); setEvidence([]); setAnswer(null); setSent([]); setReport(''); setError(''); }
  function blocked() { if (!composing() && !promptComposing.current) return false; setError(t('请先完成当前输入法组合输入。')); return true; }
  async function search() {
    if (busy || !question.trim() || blocked()) return;
    const current = ++revision.current, abort = new AbortController(); controller.current = abort; setBusy('search'); setError(''); setAnswer(null); setEvidence([]); setReport('');
    try {
      const result = await retrieve(options, documents, question, abort.signal, false, (read, total) => { if (alive.current && current === revision.current) setProgress(t('正在读取 {0} / {1} 份资料…', read, total)); });
      if (!alive.current || current !== revision.current) return;
      setEvidence(result.evidence); setExcluded(new Set());
      setReport(t('已检索 {0} 份资料，跳过 {1} 份。', result.read, result.skipped) + (result.limited ? ' ' + t('已达到 30 MiB 检索预算，请缩小文件夹后重试。') : ''));
      if (!result.evidence.length) setError(t('没有找到相关原文。试试文档中的关键词，或切换资料范围。'));
    } catch (error) { if (alive.current && current === revision.current && (error as Error).name !== 'AbortError') setError((error as Error).message); }
    finally { if (alive.current && current === revision.current) setBusy(null); }
  }
  async function ask() {
    const sources = evidence.filter(source => !excluded.has(source.id));
    if (busy || !sources.length || blocked()) return;
    const id = crypto.randomUUID(); pending.current = id; setBusy('model'); setError(''); setAnswer(null);
    try {
      const config = await host.aiSettings(); if (!alive.current || pending.current !== id) return;
      if (!config.model || !config.baseUrl) { pending.current = ''; setBusy(null); settings(); return; }
      const result = await host.aiRewrite({ id, mode: 'question', instruction: 'Answer the question using only the supplied sources.', text: question, contexts: modelContexts(sources) });
      if (alive.current && pending.current === id) { setAnswer(citedAnswer(result.text, sources)); setSent(sources); }
    } catch (error) { if (alive.current && pending.current === id) setError((error as Error).message); }
    finally { if (alive.current && pending.current === id) { pending.current = ''; setBusy(null); } }
  }
  async function openSource(source: Evidence) { if (blocked()) return; await navigate(source); if (alive.current) setViewing(true); }
  async function apply(draft: boolean) {
    if (!answer || answer.insufficient || busy || blocked()) return; setBusy('insert'); setError('');
    try { const target = draft ? null : targetPath; const text = answerMarkdown(answer, sent, 'qa-' + crypto.randomUUID().slice(0, 8), target); if (await insert(text, draft)) setReport(t('回答已写入文档，可用一次撤销恢复。')); }
    catch (error) { if (alive.current) setError((error as Error).message); }
    finally { if (alive.current) setBusy(null); }
  }
  if (viewing) return <button className="return-to-knowledge" onClick={() => { if (!blocked()) setViewing(false); }}>{t('返回目录问答')}</button>;
  return <Dialog title={t('目录问答')} close={() => { if (!promptComposing.current) close(); }} className="knowledge-dialog">
    <p className="dialog-note">{t('先在本机检索关键词，再选择资料发送给当前模型。不会上传整个文件夹。')}</p>
    <label>{t('资料范围')}<select aria-label={t('资料范围')} value={scope} disabled={!!busy} onChange={event => { changed(); setScope(event.target.value); }}><option value="open">{t('已打开的文档')}</option><option value="folder" disabled={!folder}>{t('当前文件夹')}</option></select></label>
    <label>{t('你的问题')}<textarea aria-label={t('目录问答问题')} rows={3} maxLength={8000} value={question} disabled={busy === 'model' || busy === 'insert'} placeholder={t('例如：发布前需要完成哪些检查？')} onChange={event => { changed(); setQuestion(event.target.value); }} onCompositionStart={() => { promptComposing.current = true; }} onCompositionEnd={() => { promptComposing.current = false; }} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !imeKey(event.nativeEvent)) { event.preventDefault(); void search(); } }}/></label>
    <div className="knowledge-actions"><button disabled={!!busy || !question.trim() || !options.length} onClick={() => void search()}>{t('检索资料')}</button>{busy && busy !== 'insert' && <button onClick={cancel}>{t('取消')}</button>}<span className="dialog-note" role="status">{busy === 'search' ? progress : report}</span></div>
    {evidence.length > 0 && <section className="evidence-list" aria-label={t('将发送的资料片段')}><h3>{t('选择发送的原文片段')}</h3>{evidence.map(source => <details key={source.id} className="evidence"><summary><input aria-label={t('发送资料 {0}', source.id)} type="checkbox" checked={!excluded.has(source.id)} disabled={!!busy || !!answer} onClick={event => event.stopPropagation()} onChange={() => setExcluded(previous => { const next = new Set(previous); if (next.has(source.id)) next.delete(source.id); else next.add(source.id); return next; })}/><span>[{source.id}] {source.name}</span><small>L{source.fromLine}–{source.toLine}</small></summary><pre>{source.text}</pre><button onClick={() => void openSource(source).catch(error => setError(error.message))}>{t('打开原文')}</button></details>)}<button className="primary-button" disabled={!!busy || excluded.size === evidence.length} onClick={() => void ask()}>{busy === 'model' ? t('正在生成…') : answer ? t('重新生成回答') : t('发送所选片段并提问')}</button></section>}
    {answer && <section className="knowledge-answer" aria-label={t('问答结果')}><h3>{t('回答')}</h3><pre>{answer.answer}</pre>{answer.insufficient && <p role="status" className="ai-stale">{t('资料不足，无法据此得出完整答案。')}</p>}<div className="answer-citations">{answer.citations.map((citation, index) => <blockquote key={index}><button onClick={() => void openSource(sent.find(source => source.id === citation.sourceId)!).catch(error => setError(error.message))}>[{citation.sourceId}] {sent.find(source => source.id === citation.sourceId)?.name}</button><p>{citation.quote}</p></blockquote>)}</div><p className="dialog-note">{t('引用已与发送的原文核对，仍需你判断结论是否准确。')}</p><div className="dialog-actions"><button disabled={!!busy} onClick={() => void host.writeClipboard(answerMarkdown(answer, sent, 'qa-' + crypto.randomUUID().slice(0, 8))).then(() => setReport(t('已复制回答与引用。'))).catch(error => setError(error.message))}>{t('复制回答与引用')}</button><button disabled={!!busy || answer.insufficient} onClick={() => void apply(true)}>{t('另存为新草稿')}</button><button className="primary-button" disabled={!!busy || answer.insufficient} onClick={() => void apply(false)}>{t('插入当前文档')}</button></div></section>}
    {error && <p role="alert" className="form-error">{t(error)}</p>}
  </Dialog>;
}
