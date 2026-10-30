import { useEffect, useRef, useState } from 'react';
import type { DocumentRecord, DocumentVersion } from '../../shared/contracts';
import { host } from '../host';
import { locale, t } from '../i18n';
import { Dialog } from './Dialog';
const reasons: Record<string, string> = { opened: t('初始版本'), saved: t('保存'), automatic: t('自动快照'), manual: t('手动快照'), 'before-ai': t('AI 修改前'), ai: t('AI 修改后'), 'before-restore': t('恢复前'), restore: t('恢复版本') };
export function VersionHistoryDialog({ record, composing, restore, close }: { record: DocumentRecord; composing(): boolean; restore(content: string): Promise<boolean>; close(): void }) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]), [selected, setSelected] = useState(''), [content, setContent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const alive = useRef(true), request = useRef(0), source = useRef(record); source.current = record;
  async function refresh() { const result = await host.versions(record.id); if (alive.current) { setVersions(result.versions); if (result.warning) setError(result.warning); } }
  useEffect(() => { alive.current = true; setBusy(true); void refresh().catch(error => { if (alive.current) setError(error.message); }).finally(() => { if (alive.current) setBusy(false); }); return () => { alive.current = false; request.current++; }; }, [record.id]);
  async function view(item: DocumentVersion) {
    const revision = ++request.current; setSelected(item.id); setContent(null); setError('');
    try { const value = await host.readVersion(record.id, item.id); if (alive.current && revision === request.current) setContent(value.content); }
    catch (error) { if (alive.current && revision === request.current) setError((error as Error).message); }
  }
  async function snapshot() {
    if (busy || composing()) { if (composing()) setError(t('请先完成当前输入法组合输入。')); return; }
    setBusy(true); setError('');
    try { const result = await host.captureVersion(record.id, source.current.content, 'manual'); if (alive.current) { setVersions(result.versions); setMessage(t('快照已保存在本机，重启后仍可查看。')); if (result.warning) setError(result.warning); } }
    catch (error) { if (alive.current) setError((error as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  async function apply() {
    if (content === null || busy || composing()) return; setBusy(true); setError('');
    try { if (await restore(content)) { await refresh(); if (alive.current) setMessage(t('已恢复为此版本。当前修改已另存快照，可用一次撤销恢复。')); } }
    catch (error) { if (alive.current) setError((error as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }
  const previewLimit = 24_000;
  return <Dialog title={t('版本历史')} close={close} className="history-dialog">
    <p className="dialog-note">{t('历史记录保存在本机，跨重启保留。每份文档最多 50 个版本、128 MiB，总计 512 MiB；超出后清理最旧版本。')}</p>
    <div className="history-tools"><strong title={record.name}>{record.name}</strong><button disabled={busy} onClick={() => void snapshot()}>{t('保存当前快照')}</button></div>
    <div className="history-layout"><div className="history-list" aria-label={t('历史版本列表')}>{versions.map(item => <button key={item.id} className={selected === item.id ? 'selected' : ''} disabled={busy} onClick={() => void view(item)}><strong>{new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'medium' }).format(item.createdAt)}</strong><span>{t(reasons[item.reason] || item.reason)} · {(item.bytes / 1024).toFixed(1)} KiB</span></button>)}{!versions.length && !busy && <p className="dialog-note">{t('暂无历史版本。保存文档或创建快照后会显示在这里。')}</p>}</div><div className="history-preview">{content === null ? <p className="dialog-note">{t('选择一个版本查看内容。当前文档不会改变。')}</p> : <><h3>{t('所选版本')}</h3><pre aria-label={t('版本内容预览')}>{content.slice(0, previewLimit)}</pre><details><summary>{t('对照当前文档')}</summary><pre>{record.content.slice(0, previewLimit)}</pre></details>{(content.length > previewLimit || record.content.length > previewLimit) && <p className="dialog-note">{t('预览只显示前 24,000 字符；恢复会使用完整版本。')}</p>}</>}</div></div>
    {error && <p className="form-error" role="alert">{t(error)}</p>}{message && <p role="status" className="dialog-note">{message}</p>}
    <div className="dialog-actions"><button onClick={close}>{t('完成')}</button><button className="primary-button" disabled={busy || content === null || content === record.content} onClick={() => void apply()}>{t('恢复所选版本')}</button></div>
  </Dialog>;
}
