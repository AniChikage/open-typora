import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EditBatchStore } from '../build/runtime/electron/edit-batches.mjs';
import { DocumentStore } from '../build/runtime/electron/store.mjs';
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'open-markdown-lane-batch-')), store = new DocumentStore(directory), batches = new EditBatchStore(directory);
  store.registerDraft({ id: 'one', name: '正文.md', content: '你好，中国。', path: null });
  const input = { instruction: '润色', files: [{ documentId: 'one', before: '你好，中国。', after: '中国，你好。' }] };
  return { directory, store, batches, input };
}
test('batch recovery survives restart with exact Unicode/CRLF, enforced permissions and no document writes', async () => {
  const { directory, store, batches, input } = await fixture(); try {
    input.files[0].before += '\r\n'; const batch = await batches.prepare(input, store); assert.equal(batch.state, 'prepared');
    assert.equal(store.require('one').content, '你好，中国。');
    await batches.finish(batch.id, true); const restarted = new EditBatchStore(directory), summary = (await restarted.list())[0];
    assert.equal(summary.state, 'applied'); assert.deepEqual(summary.names, ['正文.md']); assert.equal('files' in summary, false);
    const value = await restarted.read(batch.id); assert.equal(value.files[0].before, input.files[0].before);
    if (process.platform !== 'win32') assert.equal((await stat(path.join(batches.root, batch.id + '.json'))).mode & 0o777, 0o600);
    await assert.rejects(restarted.finish(batch.id, false));
    const pending = await restarted.prepare(input, store); await restarted.finish(pending.id, false); assert.equal((await restarted.list()).length, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('batch storage rejects unknown IDs, forged input, corruption and traversal without losing old records', async () => {
  const { directory, store, batches, input } = await fixture(); try {
    await assert.rejects(batches.prepare({ ...input, files: [{ ...input.files[0], documentId: 'outside' }] }, store));
    await assert.rejects(batches.prepare({ ...input, files: [input.files[0], input.files[0]] }, store));
    await assert.rejects(batches.read('../../private'));
    const batch = await batches.prepare(input, store), file = path.join(batches.root, batch.id + '.json');
    const envelope = JSON.parse(await readFile(file, 'utf8')); envelope.payload += ' '; await writeFile(file, JSON.stringify(envelope));
    await assert.rejects(batches.read(batch.id), /校验/); await assert.rejects(batches.list(), /校验/); assert.equal(JSON.parse(await readFile(file, 'utf8')).payload, envelope.payload);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('batch retention keeps pending recovery points and latest complete batches with concurrent calls', async () => {
  const { directory, store, batches, input } = await fixture(); try {
    const pending = await batches.prepare(input, store);
    for (let i = 0; i < 23; i++) { const batch = await batches.prepare(input, store); await batches.finish(batch.id, true); }
    assert.equal((await batches.list()).length, 21); assert.equal((await batches.read(pending.id)).state, 'prepared');
    const records = await Promise.all(Array.from({ length: 3 }, () => batches.prepare(input, store))); assert.equal(new Set(records.map(batch => batch.id)).size, 3);
    assert.equal((await batches.list()).length, 24);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
