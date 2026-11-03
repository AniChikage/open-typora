import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EditBatch, EditBatchInput, EditBatchSummary } from '../shared/contracts.js';
import { atomicWrite, digest } from './store.mjs';
import type { DocumentStore } from './store.mjs';
const validID = (id: string) => /^[a-f0-9-]{36}$/i.test(id);
const queues = new Map<string, Promise<unknown>>();
export class EditBatchStore {
  readonly root: string;
  constructor(directory: string) { this.root = path.join(directory, 'edit-batches-v1'); }
  private async serial<T>(work: () => Promise<T>) {
    const prior = queues.get(this.root) || Promise.resolve(), operation = prior.catch(() => {}).then(work); queues.set(this.root, operation);
    try { return await operation; } finally { if (queues.get(this.root) === operation) queues.delete(this.root); }
  }
  private async load(id: string): Promise<EditBatch> {
    if (!validID(id)) throw new Error('批次标识无效。');
    try {
      const bytes = await readFile(path.join(this.root, id + '.json')); if (bytes.length > 4 * 1024 * 1024) throw Error('size');
      const envelope = JSON.parse(bytes.toString('utf8'));
      if (envelope.version !== 1 || typeof envelope.payload !== 'string' || digest(envelope.payload) !== envelope.hash) throw Error('integrity');
      const batch: EditBatch = JSON.parse(envelope.payload);
      if (batch.id !== id || !Number.isFinite(batch.createdAt) || !['prepared', 'applied'].includes(batch.state) || typeof batch.instruction !== 'string' || !Array.isArray(batch.files) || batch.files.length < 1 || batch.files.length > 4 || batch.files.some(file => typeof file.documentId !== 'string' || typeof file.name !== 'string' || file.path !== null && typeof file.path !== 'string' || typeof file.before !== 'string' || typeof file.after !== 'string')) throw Error('format');
      return { ...batch, names: batch.files.map(file => file.name) };
    } catch { throw new Error('批次记录无法读取或校验失败，原始记录已保留。'); }
  }
  private async write(batch: EditBatch) { const payload = JSON.stringify(batch); await atomicWrite(path.join(this.root, batch.id + '.json'), JSON.stringify({ version: 1, payload, hash: digest(payload) }), undefined, 0o600); }
  private async all() {
    let names: string[]; try { names = await readdir(this.root); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    return (await Promise.all(names.filter(name => name.endsWith('.json') && validID(name.slice(0, -5))).map(name => this.load(name.slice(0, -5))))).sort((a, b) => b.createdAt - a.createdAt);
  }
  list(): Promise<EditBatchSummary[]> { return this.serial(async () => (await this.all()).map(({ files: _, ...summary }) => summary)); }
  read(id: string) { return this.serial(() => this.load(id)); }
  prepare(input: EditBatchInput, store: DocumentStore) {
    return this.serial(async () => {
      if (!input || typeof input.instruction !== 'string' || input.instruction.length > 8000 || !Array.isArray(input.files) || !input.files.length || input.files.length > 4) throw new Error('批次内容无效。');
      let total = 0; const ids = new Set<string>();
      const files = input.files.map(file => {
        if (!file || typeof file.documentId !== 'string' || ids.has(file.documentId) || typeof file.before !== 'string' || typeof file.after !== 'string' || (total += file.before.length + file.after.length) > 400000 || file.before === file.after) throw new Error('批次内容无效。');
        ids.add(file.documentId); const record = store.require(file.documentId);
        return { documentId: record.id, name: record.name, path: record.path, before: file.before, after: file.after };
      });
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const previous = await this.all();
      // Keep pending recovery points even if their application was interrupted.
      if (previous.filter(batch => batch.state === 'prepared').length >= 20) throw new Error('未完成的批次过多，请先检查批次恢复记录。');
      const batch: EditBatch = { id: randomUUID(), createdAt: Date.now(), instruction: input.instruction, state: 'prepared', files, names: files.map(file => file.name) };
      await this.write(batch);
      return batch;
    });
  }
  finish(id: string, applied: boolean) {
    return this.serial(async () => { const batch = await this.load(id); if (applied) { await this.write({ ...batch, state: 'applied' }); for (const old of (await this.all()).filter(batch => batch.state === 'applied').slice(20)) await rm(path.join(this.root, old.id + '.json')); } else { if (batch.state !== 'prepared') throw new Error('已应用批次不能删除恢复点。'); await rm(path.join(this.root, id + '.json')); } });
  }
}
