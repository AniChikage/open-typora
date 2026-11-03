import { useEffect, useMemo, useRef, useState } from 'react';
import { Files, History, ArrowLeft, Check } from 'lucide-react';
import type { DocumentRecord, EditBatch, EditBatchSummary } from '../../shared/contracts';
import { batchInput, batchProposal, batchText } from '../../shared/batch-edit.mts';
import type { BatchProposal, BatchSource } from '../../shared/batch-edit.mts';
import { constraintInstruction, constraintViolations, defaultConstraints } from '../../shared/rewrite-constraints.mts';
import { host } from '../host';
import { t } from '../i18n';
import { imeKey } from '../editor/composition';
import type { ReferenceFile } from '../knowledge';
import { Dialog } from './Dialog';
import { RewriteConstraints, ConstraintWarnings } from './RewriteConstraints';
export interface BatchTarget { documentId: string; path: string | null; name: string; before: string; after: string }
export function BatchEditDialog({ documents, files, composing, prepare, apply, restore, settings, close }: {
  documents: DocumentRecord[]; files: ReferenceFile[]; composing(): boolean;
  prepare(files: ReferenceFile[]): Promise<DocumentRecord[]>;
  apply(targets: BatchTarget[], instruction: string): Promise<string | null>;
  restore(batch: EditBatch): Promise<boolean>; settings(): void; close(): void;
}) {
  const [step, setStep] = useState<'choose' | 'plan' | 'review' | 'history'>('choose');
  const [instruction, setInstruction] = useState('');
  const [chosen, setChosen] = useState<string[]>([]), [filter, setFilter] = useState('');
  const [constraints, setConstraints] = useState(() => ({ ...defaultConstraints, terms: [] as string[] }));
  const [sources, setSources] = useState<(BatchSource & { documentId: string; path: string | null; original: string; lineEnding: string })[]>([]);
  const [proposal, setProposal] = useState<BatchProposal | null>(null), [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<'model' | 'apply' | 'restore' | null>(null), [error, setError] = useState(''), [report, setReport] = useState('');
  const [batches, setBatches] = useState<EditBatchSummary[]>([]), [selectedBatch, setSelectedBatch] = useState<EditBatch | null>(null), [confirmRestore, setConfirmRestore] = useState(false);
  const [discardPrepared, setDiscardPrepared] = useState(false);
  const alive = useRef(true), pending = useRef(''), promptComposing = useRef(false), revision = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (pending.current) void host.aiCancel(pending.current).catch(() => {}); }; }, []);
  function blocked() { if (!composing() && !promptComposing.current) return false; setError(t('请先完成当前输入法组合输入。')); return true; }
  const targets = useMemo(() => proposal ? sources.flatMap(source => {
    const file = proposal.files.find(file => file.id === source.id)!;
    const normalized = batchText(source.text, file.edits, file.edits.map((_, index) => !excluded.has(file.id + ':' + index)));
    const after = source.lineEnding === '\r\n' ? normalized.replace(/\n/g, '\r\n') : normalized;
    return after === source.original ? [] : [{ documentId: source.documentId, name: source.name, path: source.path, before: source.original, after }];
  }) : [], [sources, proposal, excluded]);
  const violations = useMemo(() => targets.flatMap(target => constraintViolations(target.before, target.after, constraints)), [targets, constraints]);
  const stale = sources.some(source => !documents.some(document => document.id === source.documentId && document.path === source.path && document.content === source.original && !document.conflict));
  async function generate() {
    if (busy || blocked() || !chosen.length || !instruction.trim()) return;
    const id = crypto.randomUUID(); pending.current = id; setBusy('model'); setError(''); setReport(''); setProposal(null);
    try {
      const config = await host.aiSettings(); if (!alive.current || pending.current !== id) return;
      if (!config.model || !config.baseUrl) { settings(); return; }
      const selection = chosen.map(token => files.find(file => file.token === token));
      if (selection.some(file => !file)) throw new Error(t('原文件已关闭或离开授权范围，请先重新打开文件。'));
      const records = await prepare(selection as ReferenceFile[]);
      if (!alive.current || pending.current !== id) return;
      const input = records.map((record, index) => ({ id: 'D' + (index + 1), name: selection[index]!.name, text: record.content.replace(/\r\n/g, '\n'), original: record.content, lineEnding: record.lineEnding, documentId: record.id, path: record.path }));
      const text = batchInput(input.map(({ id, name, text }) => ({ id, name, text })), constraints);
      setSources(input); setChosen(records.map(record => 'document:' + record.id));
      const response = await host.aiRewrite({ id, mode: 'batch', instruction: instruction.trim() + constraintInstruction(constraints), text });
      if (!alive.current || pending.current !== id) return;
      setProposal(batchProposal(response.text, input)); setExcluded(new Set()); setStep('plan');
    } catch (error) { if (alive.current && pending.current === id) setError((error as Error).message); }
    finally { if (alive.current && pending.current === id) { pending.current = ''; setBusy(null); } }
  }
  function cancel() { const id = pending.current; pending.current = ''; setBusy(null); if (id) void host.aiCancel(id).catch(() => {}); }
  async function accept() {
    if (busy || blocked() || stale || violations.length || !targets.length) return;
    setBusy('apply'); setError('');
    try {
      const batch = await apply(targets, instruction);
      if (alive.current && batch) { setReport(t('已修改 {0} 篇文档，批次恢复点已保存。', targets.length)); setStep('choose'); setSources([]); setProposal(null); }
    } catch (error) { if (alive.current) setError((error as Error).message); }
    finally { if (alive.current) setBusy(null); }
  }
  async function history() {
    if (busy || blocked()) return; setStep('history'); setError(''); setSelectedBatch(null); setConfirmRestore(false); setDiscardPrepared(false);
    const current = ++revision.current;
    try { const result = await host.editBatches(); if (alive.current && revision.current === current) setBatches(result); } catch (error) { if (alive.current) setError((error as Error).message); }
  }
  async function selectBatch(id: string) {
    const current = ++revision.current; setSelectedBatch(null); setConfirmRestore(false); setDiscardPrepared(false); setError('');
    try { const value = await host.readEditBatch(id); if (alive.current && revision.current === current) setSelectedBatch(value); } catch (error) { if (alive.current && revision.current === current) setError((error as Error).message); }
  }
  async function undoBatch() {
    if (!selectedBatch || !confirmRestore || busy || blocked()) return;
    setBusy('restore'); setError('');
    try { if (await restore(selectedBatch) && alive.current) { setReport(t('整批恢复完成，恢复前的内容也已保留。')); setSelectedBatch(null); setBatches(await host.editBatches()); } }
    catch (error) { if (alive.current) setError((error as Error).message); }
    finally { if (alive.current) setBusy(null); }
  }
  async function discardPending() {
    if (busy || blocked() || !selectedBatch || selectedBatch.state !== 'prepared' || !discardPrepared) return;
    setBusy('restore'); setError('');
    try { await host.finishEditBatch(selectedBatch.id, false); if (alive.current) { setSelectedBatch(null); setBatches(await host.editBatches()); setReport(t('已移除未完成恢复点，文档未改变。')); } }
    catch (error) { if (alive.current) setError((error as Error).message); }
    finally { if (alive.current) setBusy(null); }
  }
  const options = files.filter(file => !filter || file.name.toLowerCase().includes(filter.toLowerCase()));
  return <Dialog title={t('跨文档修改')} close={() => { if (!busy && !promptComposing.current) close(); }} className="batch-edit-dialog">
    <div className="batch-navigation"><span><Files size={16}/>{t('选择文档 → 修改计划 → 差异审阅')}</span><button disabled={!!busy} onClick={() => { if (step === 'history') { revision.current++; setStep('choose'); setError(''); } else void history(); }}><History size={15}/>{step === 'history' ? t('返回修改') : t('批次恢复')}</button></div>
    {step === 'choose' && <>
      <p className="dialog-note">{t('只发送明确选择的文档。文件夹中的文档会先打开，使用当前未保存内容；最多 4 篇。生成计划不会修改文件。')}</p>
      <label>{t('筛选文档')}<input aria-label={t('筛选文档')} value={filter} disabled={!!busy} onChange={event => setFilter(event.target.value)}/></label>
      <div className="batch-file-picker" aria-label={t('待修改的文档')}>{options.map(file => <label key={file.token} title={file.path || file.name} className="checkbox-option"><input type="checkbox" aria-label={t('修改文档 {0}', file.name)} checked={chosen.includes(file.token)} disabled={!!busy || chosen.length >= 4 && !chosen.includes(file.token)} onChange={event => setChosen(previous => event.target.checked ? [...previous, file.token] : previous.filter(token => token !== file.token))}/><span>{file.name}</span><small>{file.token.startsWith('document:') ? t('已打开') : t('文件夹')}</small></label>)}{!options.length && <p className="dialog-note">{t('请先打开需要修改的 Markdown 文档或文件夹。')}</p>}</div>
      <label>{t('跨文档修改要求')}<textarea aria-label={t('跨文档修改要求')} rows={3} maxLength={6000} value={instruction} disabled={!!busy} placeholder={t('例如：统一这几篇文档的产品名称，并同步更新使用说明。')} onChange={event => setInstruction(event.target.value)} onCompositionStart={() => { promptComposing.current = true; }} onCompositionEnd={() => { promptComposing.current = false; }} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !imeKey(event.nativeEvent)) { event.preventDefault(); void generate(); } }}/></label>
      <RewriteConstraints composition={active => { promptComposing.current = active; }} value={constraints} change={setConstraints} disabled={!!busy}/>
      <div className="dialog-actions"><span className="dialog-note">{t('已选 {0} / 4 篇', chosen.length)}</span><button onClick={settings} disabled={!!busy}>{t('模型设置')}</button>{busy === 'model' ? <button onClick={cancel}>{t('取消生成')}</button> : <button className="primary-button" disabled={!!busy || !chosen.length || !instruction.trim()} onClick={() => void generate()}>{t('生成修改计划')}</button>}</div>
      {busy === 'model' && <p role="status">{t('正在生成计划，尚未修改文档。')}</p>}
    </>}
    {(step === 'plan' || step === 'review') && proposal && <>
      <div className="batch-plan"><h3>{t('修改计划')}</h3><p>{proposal.summary}</p>{proposal.files.map(file => <p key={file.id}><strong>{sources.find(source => source.id === file.id)?.name}</strong><span>{file.summary} · {t('{0} 处修改', file.edits.length)}</span></p>)}</div>
      {stale && <p className="ai-stale" role="status">{t('文档已修改、关闭或出现磁盘冲突，请重新生成计划。')}</p>}
      {step === 'review' && <><RewriteConstraints composition={active => { promptComposing.current = active; }} value={constraints} change={setConstraints} disabled={!!busy}/>{proposal.files.map(file => <section className="batch-file-diff" key={file.id} aria-label={t('文档差异 {0}', sources.find(source => source.id === file.id)!.name)}><div className="ai-diff-heading"><h3>{sources.find(source => source.id === file.id)!.name}</h3>{!!file.edits.length && <label className="checkbox-option"><input type="checkbox" aria-label={t('采用文档 {0}', sources.find(source => source.id === file.id)!.name)} disabled={!!busy} checked={file.edits.some((_, index) => !excluded.has(file.id + ':' + index))} onChange={event => { const checked = event.target.checked; setExcluded(previous => { const next = new Set(previous); file.edits.forEach((_, index) => { if (checked) next.delete(file.id + ':' + index); else next.add(file.id + ':' + index); }); return next; }); }}/>{t('采用此文档')}</label>}</div>{file.edits.map((patch, index) => { const key = file.id + ':' + index; return <div className={'ai-change' + (excluded.has(key) ? ' rejected' : '')} key={key}><label className="checkbox-option"><input type="checkbox" aria-label={t('采用 {0} 的第 {1} 处修改', sources.find(source => source.id === file.id)!.name, index + 1)} disabled={!!busy} checked={!excluded.has(key)} onChange={() => setExcluded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; })}/>{t('第 {0} 处', index + 1)}</label><span className="ai-diff-label">{t('原文')}</span><pre className="ai-removed">{patch.before}</pre><span className="ai-diff-label">{t('建议')}</span><pre className="ai-added">{patch.after || t('（删除此处）')}</pre></div>; })}{!file.edits.length && <p className="dialog-note">{t('保留原文')}</p>}</section>)}<ConstraintWarnings violations={violations}/></>}
      <p className="dialog-note">{t('采纳后写入编辑器，沿用自动保存设置。每篇可单独撤销，也可用批次恢复；恢复会先检查后续改动。')}</p>
      <div className="dialog-actions batch-footer"><button disabled={!!busy} onClick={() => { setStep('choose'); setError(''); }}><ArrowLeft size={14}/>{t('重新选择')}</button>{step === 'plan' ? <button className="primary-button" onClick={() => setStep('review')}>{t('审阅逐文件差异')}</button> : <button className="primary-button" disabled={!!busy || stale || !!violations.length || !targets.length} onClick={() => void accept()}><Check size={14}/>{busy === 'apply' ? t('正在应用…') : t('应用到 {0} 篇文档', targets.length)}</button>}</div>
    </>}
    {step === 'history' && <><p className="dialog-note">{t('保留最近 20 个已完成批次和未完成记录，包含明文原文和结果。请先打开原文档；所有内容仍与该批结果一致时，才允许整批恢复。')}</p><div className="batch-history-list">{batches.map(batch => <button key={batch.id} disabled={!!busy} aria-pressed={selectedBatch?.id === batch.id} onClick={() => void selectBatch(batch.id)}><time>{new Date(batch.createdAt).toLocaleString()}</time><strong>{batch.names.join(' · ')}</strong><span>{batch.instruction || t('整批恢复')}{batch.state === 'prepared' ? ' · ' + t('可能未完成') : ''}</span></button>)}{!batches.length && <p>{t('还没有批次恢复点。')}</p>}</div>{selectedBatch && <section className="batch-restore"><h3>{t('将恢复以下文档')}</h3>{selectedBatch.files.map(file => <details key={file.documentId}><summary>{file.name}</summary><pre>{file.before.slice(0, 12000)}</pre></details>)}<label className="checkbox-option"><input type="checkbox" checked={confirmRestore} disabled={!!busy} onChange={event => setConfirmRestore(event.target.checked)}/>{t('我已核对，将整批恢复到修改前。')}</label><button className="primary-button" disabled={!!busy || !confirmRestore} onClick={() => void undoBatch()}>{busy === 'restore' ? t('正在恢复…') : t('恢复整批文档')}</button>{selectedBatch.state === 'prepared' && <details className="batch-pending-discard"><summary>{t('清理未完成记录')}</summary><p className="dialog-note">{t('未完成不代表文档没有改过。移除记录会删除这一批的恢复备份，不会修改文档。')}</p><label className="checkbox-option"><input type="checkbox" checked={discardPrepared} disabled={!!busy} onChange={event => setDiscardPrepared(event.target.checked)}/>{t('确认不再需要这条未完成恢复记录。')}</label><button disabled={!!busy || !discardPrepared} onClick={() => void discardPending()}>{t('移除此未完成记录')}</button></details>}</section>}</>}
    {report && <p className="ai-applied" role="status">{report}</p>}{error && <p className="form-error" role="alert">{t(error)}</p>}
  </Dialog>;
}
