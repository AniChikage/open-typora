import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import type { ReferenceFile } from '../knowledge';
import { imeKey } from '../editor/composition';
import { t } from '../i18n';
export interface ContextPickerHandle { keyDown(event: KeyboardEvent): boolean }
interface Props { files: ReferenceFile[]; selected: ReferenceFile[]; change(value: ReferenceFile[]): void; disabled: boolean; mention: string | null; consumed(): void; dismissed(): void }
export const ContextPicker = forwardRef<ContextPickerHandle, Props>(function ContextPicker({ files, selected, change, disabled, mention, consumed, dismissed }, ref) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mention !== null) { setQuery(mention); setOpen(true); setIndex(0); } }, [mention]);
  const matches = useMemo(() => files.filter(file => !selected.some(item => item.token === file.token || !!file.path && item.path === file.path) && file.name.toLocaleLowerCase().includes(query.replace(/^@/, '').toLocaleLowerCase())).slice(0, 30), [files, selected, query]);
  function select(file: ReferenceFile) { if (disabled || selected.length >= 4) return; change([...selected, file]); consumed(); setQuery(''); setOpen(false); }
  function keyboard(event: KeyboardEvent, manual = false) {
    if (!open || !manual && mention === null || imeKey(event.nativeEvent) || event.metaKey || event.ctrlKey || event.altKey) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIndex(value => Math.max(0, Math.min(matches.length - 1, value + (event.key === 'ArrowDown' ? 1 : -1)))); return true; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); dismissed(); return true; }
    if (event.key === 'Enter' && matches[index]) { event.preventDefault(); event.stopPropagation(); select(matches[index]); return true; }
    return false;
  }
  useImperativeHandle(ref, () => ({ keyDown: event => keyboard(event) }));
  return <div className="context-picker">
    <div className="context-chips">{selected.map(file => <span key={file.token} title={file.name}>@{file.name}<button disabled={disabled} aria-label={t('移除参考文件 {0}', file.name)} onClick={() => change(selected.filter(item => item.token !== file.token))}><X size={12}/></button></span>)}</div>
    <button disabled={disabled || selected.length >= 4} className="context-add" onClick={() => { setOpen(value => !value); requestAnimationFrame(() => input.current?.focus()); }}><Plus size={13}/>{t('添加参考文件')} <kbd>@</kbd></button>
    {open && <div className="reference-menu"><input ref={input} aria-label={t('搜索参考文件')} placeholder={t('输入文件名…')} value={query} onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={event => keyboard(event, true)}/><div className="context-options">{matches.map((file, position) => <button className={index === position ? 'selected' : ''} key={file.token} title={file.path || file.name} onClick={() => select(file)}>{file.name}</button>)}{!matches.length && <p className="dialog-note">{t('没有匹配文件。可先打开文件夹或文档。')}</p>}</div><p className="dialog-note">{t('最多 4 份资料，每份 2 MiB；只发送相关片段。')}</p></div>}
  </div>;
});
