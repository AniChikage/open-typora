import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { applicationDataDirectory, applyLegacyEnvironment, legacyApplicationId, encryptionApplicationName } from '../shared/branding.mts';
import { migrateStorage, storedItem } from '../src/migrateStorage.ts';

function storageFixture(entries: Record<string, string>, full = false): Storage {
  const values = new Map(Object.entries(entries));
  return { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null, removeItem: key => { values.delete(key); },
    clear: () => values.clear(), setItem: (key, value) => { if (full) throw new Error('QuotaExceededError'); values.set(key, value); } };
}

test('renaming copies drafts and all settings without overwriting new values or deleting old data', () => {
  const original = { 'open-typora-session-v1': '{"documents":[{"content":"未保存的草稿"}]}',
    'open-typora-plugins-v1': '{"dark":true}', 'open-typora-theme': 'dark',
    'open-typora-preferences': '{"language":"en"}', 'unrelated-project': 'untouched',
    'open-markdown-lane-theme': '' };
  const storage = storageFixture(original);
  migrateStorage(storage); migrateStorage(storage);
  for (const [key, value] of Object.entries(original)) assert.equal(storage.getItem(key), value);
  assert.equal(storage.getItem('open-markdown-lane-session-v1'), original['open-typora-session-v1']);
  assert.equal(storage.getItem('open-markdown-lane-plugins-v1'), original['open-typora-plugins-v1']);
  assert.equal(storage.getItem('open-markdown-lane-preferences'), original['open-typora-preferences']);
  assert.equal(storedItem(storage, 'open-markdown-lane-theme'), '');
});

test('quota-full browser storage still reads legacy drafts and settings', () => {
  const storage = storageFixture({'open-typora-session-v1': 'unsaved draft'}, true);
  assert.throws(() => migrateStorage(storage), /Quota/);
  assert.equal(storedItem(storage, 'open-markdown-lane-session-v1'), 'unsaved draft');
});

test('existing desktop data wins without moving it; isolated and fresh paths use the requested name', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'markdown-lane-branding-'));
  t.after(() => rm(root, {recursive:true,force:true}));
  assert.equal(applicationDataDirectory(root), path.join(root, 'Open Markdown Lane'));
  await mkdir(path.join(root, 'Open Typora'));
  assert.equal(applicationDataDirectory(root), path.join(root, 'Open Typora'));
  assert.equal(applicationDataDirectory(root, path.join(root, 'isolated')), path.join(root, 'isolated'));
  assert.equal(legacyApplicationId, 'org.opentypora.desktop');
});

test('old environment names remain accepted and explicit new names take precedence', () => {
  const env = {OPEN_TYPORA_DATA_DIR:'old', OPEN_TYPORA_AI_SETTINGS_DIR:'private', OPEN_MARKDOWN_LANE_DATA_DIR:'new'};
  applyLegacyEnvironment(env);
  assert.equal(env.OPEN_MARKDOWN_LANE_DATA_DIR,'new');
  assert.equal((env as NodeJS.ProcessEnv).OPEN_MARKDOWN_LANE_AI_SETTINGS_DIR,'private');
});

test('Linux retains the existing encrypted-credential namespace during bootstrap', () => {
  assert.equal(encryptionApplicationName('linux'), 'Open Typora');
  assert.equal(encryptionApplicationName('win32'), 'Open Markdown Lane');
  assert.equal(encryptionApplicationName('darwin'), 'Open Markdown Lane');
});

test('package and both platform builders use the new brand with stable upgrade identity', async () => {
  const pkg = JSON.parse(await readFile('package.json','utf8'));
  assert.equal(pkg.name,'open-markdown-lane');
  assert.equal(pkg.build.productName,'Open Markdown Lane');
  assert.equal(pkg.build.appId,legacyApplicationId);
  assert.equal(pkg.repository.url,'https://github.com/AniChikage/open-markdown-lane.git');
  for (const file of ['scripts/package-native.mts','scripts/package-windows.mts','scripts/package-linux.mts']) {
    const code = await readFile(file,'utf8');
    assert.ok(code.includes('Open-Markdown-Lane-'));
    assert.ok(!code.includes('Open-Typora-'));
  }
});
