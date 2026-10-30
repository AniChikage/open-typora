import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DocumentRecord, DocumentVersion, VersionResult } from '../shared/contracts.js';
import { atomicWrite, digest } from './store.mjs';

const countLimit = 50, documentBudget = 128 * 1024 * 1024, totalBudget = 512 * 1024 * 1024;
const queues = new Map<string, Promise<unknown>>();
const hashPattern = /^[a-f0-9]{64}$/;
interface Index { version: 1; entries: DocumentVersion[]; file?: string }
export class VersionStore {
  readonly root: string;
  constructor(directory: string) { this.root = path.join(directory, 'versions-v1'); }
  private key(record: Pick<DocumentRecord, 'path' | 'id'>) { return digest(record.path ? 'file:' + record.path : 'draft:' + record.id); }
  private async serial<T>(work: () => Promise<T>): Promise<T> {
    const before = queues.get(this.root) || Promise.resolve(), operation = before.catch(() => {}).then(work); queues.set(this.root, operation);
    try { return await operation; } finally { if (queues.get(this.root) === operation) queues.delete(this.root); }
  }
  private async index(key: string): Promise<Index> {
    try {
      const bytes = await readFile(path.join(this.root, key, 'index.json'));
      if (bytes.length > 1024 * 1024) throw new Error('history index size');
      const value = JSON.parse(bytes.toString('utf8')) as Index;
      if (value.version !== 1 || value.file !== undefined && typeof value.file !== 'string' || !Array.isArray(value.entries) || value.entries.length > 1000 || value.entries.some(item => !item || !/^[a-zA-Z0-9-]{1,100}$/.test(item.id) || !hashPattern.test(item.hash) || !Number.isFinite(item.createdAt) || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || typeof item.name !== 'string' || typeof item.reason !== 'string')) throw new Error('history index format');
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: [] };
      throw new Error('版本索引无法读取，原始历史记录已保留。');
    }
  }
  private bytes(entries: DocumentVersion[]) { return [...new Map(entries.map(item => [item.hash, item.bytes])).values()].reduce((sum, bytes) => sum + bytes, 0); }
  private async commit(key: string, entries: DocumentVersion[], file?: string | null) {
    const directory = path.join(this.root, key); await mkdir(directory, { recursive: true });
    await atomicWrite(path.join(directory, 'index.json'), JSON.stringify({ version: 1, entries, file: file === undefined ? (await this.index(key)).file : file || undefined }), undefined, 0o600);
    const retained = new Set(entries.map(item => item.hash + '.txt'));
    for (const name of await readdir(directory)) if (/^[a-f0-9]{64}\.txt$/.test(name) && !retained.has(name)) await rm(path.join(directory, name));
  }
  private async trimGlobal() {
    const collections: { key: string; entries: DocumentVersion[]; changed: boolean }[] = [];
    for (const item of await readdir(this.root, { withFileTypes: true })) if (item.isDirectory() && hashPattern.test(item.name)) { try { collections.push({ key: item.name, entries: (await this.index(item.name)).entries, changed: false }); } catch { /* Preserve corrupt unrelated histories instead of blocking all documents. */ } }
    let total = collections.reduce((sum, collection) => sum + this.bytes(collection.entries), 0);
    const candidates = collections.flatMap(collection => collection.entries.map(item => ({ collection, item }))).sort((a, b) => a.item.createdAt - b.item.createdAt);
    for (const { collection, item } of candidates) {
      if (total <= totalBudget) break;
      const before = this.bytes(collection.entries); collection.entries = collection.entries.filter(entry => entry.id !== item.id); collection.changed = true;
      total -= before - this.bytes(collection.entries);
    }
    for (const collection of collections) if (collection.changed) await this.commit(collection.key, collection.entries);
  }
  list(record: DocumentRecord): Promise<VersionResult> { return this.serial(async () => ({ versions: (await this.index(this.key(record))).entries })); }
  capture(record: DocumentRecord, content: string, reason: string): Promise<VersionResult> {
    if (typeof content !== 'string' || !['opened', 'saved', 'automatic', 'manual', 'before-ai', 'ai', 'before-restore', 'restore'].includes(reason)) return Promise.reject(new Error('版本请求无效。'));
    return this.serial(async () => {
      const key = this.key(record), current = await this.index(key), bytes = Buffer.byteLength(content), hash = digest(content);
      if (bytes > documentBudget) return { versions: current.entries, warning: '文档超过单份版本历史的 128 MiB 预算，编辑和保存不受影响。' };
      if (current.entries[0]?.hash === hash) return { versions: current.entries };
      const now = Date.now(), item: DocumentVersion = { id: randomUUID(), createdAt: now, name: record.name, reason, hash, bytes };
      let entries = current.entries;
      if (['saved', 'automatic'].includes(reason) && entries.length > 1 && ['saved', 'automatic'].includes(entries[0].reason) && now - entries[0].createdAt < 30_000) entries = entries.slice(1);
      entries = [item, ...entries].slice(0, countLimit);
      while (entries.length > 1 && this.bytes(entries) > documentBudget) entries.pop();
      await atomicWrite(path.join(this.root, key, hash + '.txt'), content, undefined, 0o600);
      await this.commit(key, entries, record.path); await this.trimGlobal();
      return { versions: entries };
    });
  }
  read(record: DocumentRecord, versionId: string) {
    return this.serial(async () => {
      const key = this.key(record), item = (await this.index(key)).entries.find(item => item.id === versionId);
      if (!item) throw new Error('此版本已过期或不可用，请刷新版本列表。');
      const bytes = await readFile(path.join(this.root, key, item.hash + '.txt'));
      if (bytes.length !== item.bytes || digest(bytes) !== item.hash) throw new Error('版本内容校验失败，当前文档未修改。');
      return { version: item, content: bytes.toString('utf8') };
    });
  }
  private async transfer(oldKey: string, newKey: string, file: string | null, remove: boolean) {
    if (oldKey === newKey) return;
    const previous = await this.index(oldKey), next = await this.index(newKey);
    if (!previous.entries.length) return;
    for (const entry of previous.entries) {
      const bytes = await readFile(path.join(this.root, oldKey, entry.hash + '.txt'));
      if (bytes.length !== entry.bytes || digest(bytes) !== entry.hash) throw new Error('旧版本内容校验失败。');
      await atomicWrite(path.join(this.root, newKey, entry.hash + '.txt'), bytes, undefined, 0o600);
    }
    const entries = [...new Map([...next.entries, ...previous.entries].map(item => [item.id, item])).values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, countLimit);
    while (entries.length > 1 && this.bytes(entries) > documentBudget) entries.pop();
    await this.commit(newKey, entries, file);
    if (remove) await rm(path.join(this.root, oldKey), { recursive: true });
  }
  adopt(previous: DocumentRecord, next: DocumentRecord) {
    return this.serial(() => this.transfer(this.key(previous), this.key(next), next.path, !previous.path));
  }
  remap(fromPath: string, toPath: string) {
    return this.serial(async () => {
      let folders;
      try { folders = await readdir(this.root, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
      for (const folder of folders) {
        if (!folder.isDirectory() || !hashPattern.test(folder.name)) continue;
        const old = await this.index(folder.name), file = old.file;
        if (!file || file !== fromPath && !file.startsWith(fromPath + path.sep)) continue;
        const target = toPath + file.slice(fromPath.length);
        await this.transfer(folder.name, this.key({ path: target, id: '' }), target, true);
      }
    });
  }
}
