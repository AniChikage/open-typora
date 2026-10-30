import type { ContextDocument, DocumentRecord, FileEntry } from '../shared/contracts';
import { contextFileBytes, contextTotalBytes } from '../shared/knowledge.mts';
import type { Evidence } from '../shared/knowledge.mts';
import { host } from './host';
export interface ReferenceFile { token: string; name: string; path: string | null }
export function referenceFiles(documents: DocumentRecord[], files: FileEntry[]): ReferenceFile[] {
  const names = new Map(files.map(file => [file.path, file.relative || file.name]));
  const opened = new Set(documents.map(document => document.path).filter(Boolean));
  return [...documents.map(document => ({ token: 'document:' + document.id, name: document.path && names.get(document.path) || document.name, path: document.path })), ...files.filter(file => file.isDirectory !== "true" && !opened.has(file.path)).map(file => ({ token: file.token, name: file.relative || file.name, path: file.path }))];
}
async function fingerprint(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function readReference(file: ReferenceFile, documents: DocumentRecord[]): Promise<ContextDocument> {
  const record = documents.find(document => file.token === 'document:' + document.id || document.path && document.path === file.path);
  if (!record) { const value = await host.readContext(file.token); return { ...value, hash: await fingerprint(value.content) }; }
  const bytes = new TextEncoder().encode(record.content).length;
  if (bytes > contextFileBytes) throw new Error('单份参考资料超过 2 MiB，已跳过；不影响编辑或保存。');
  return { token: 'document:' + record.id, name: file.name, path: record.path, content: record.content, bytes, hash: await fingerprint(record.content) };
}
export async function retrieve(files: ReferenceFile[], documents: DocumentRecord[], query: string, signal: AbortSignal, explicit = false, progress?: (read: number, total: number) => void) {
  const values: ContextDocument[] = []; let total = 0, skipped = 0, limited = false;
  // Bounded reads keep directory retrieval separate from document/session state.
  for (let start = 0; start < files.length; start += 4) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    const batch = await Promise.allSettled(files.slice(start, start + 4).map(file => readReference(file, documents)));
    for (const item of batch) {
      if (item.status === 'rejected') { skipped++; continue; }
      if (total + item.value.bytes > contextTotalBytes) { limited = true; continue; }
      total += item.value.bytes; values.push(item.value);
    }
    progress?.(Math.min(start + 4, files.length), files.length);
    if (limited || total >= contextTotalBytes) { limited = limited || start + 4 < files.length; break; }
  }
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const evidence = await new Promise<Evidence[]>((resolve, reject) => {
    const worker = new Worker(new URL('./knowledge.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { signal.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException('Cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => { cleanup(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.evidence); };
    worker.onerror = () => { cleanup(); reject(new Error('资料检索失败，请重试。')); };
    worker.postMessage({ documents: values, query, explicit });
  });
  return { evidence, skipped, limited, read: values.length };
}
export function modelContexts(sources: Evidence[]) { return sources.map(({ id, name, text, fromLine, toLine }) => ({ id, name, text, fromLine, toLine })); }
