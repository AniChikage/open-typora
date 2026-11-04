import { _electron as electron, expect } from 'playwright/test';
import type { ElectronApplication, Page } from 'playwright';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import iconv from 'iconv-lite';
import { createHash } from 'node:crypto';
const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'open-markdown-lane-batch-ui-'))), profile = path.join(directory, 'profile'), notes = path.join(directory, 'notes');
const qa = process.env.OPEN_MARKDOWN_LANE_QA_DIR || path.join(directory, 'evidence');
await Promise.all([mkdir(profile), mkdir(notes), mkdir(qa, { recursive: true })]);
const folderLabel = path.join('manual', 'README.md');
const originals = ['# Proposal\r\n\r\nOld Product helps writing.\r\n\r\n预算 30万元。\r\n', '# FAQ\n\nOld Product works offline.\n\n预算 30万元。\n', '# Guide\n\nOld Product has local files.\n\n预算 30万元。\n'];
const records = originals.map((content, index) => { const encoding = index === 1 ? 'gb18030' : 'utf-8', bytes = iconv.encode(content, encoding); return { id: 'batch-ui-' + index, path: path.join(notes, ['proposal.md', 'faq.md', 'guide.md'][index]), name: ['proposal.md', 'faq.md', 'guide.md'][index], content, savedContent: content, diskHash: createHash('sha256').update(bytes).digest('hex'), lineEnding: index ? '\n' : '\r\n', encoding, bom: false }; });
for (const record of records) await writeFile(record.path, iconv.encode(record.content, record.encoding));
await mkdir(path.join(notes, 'manual')); await writeFile(path.join(notes, 'manual/README.md'), '# Manual\n\nOld Product has local editing.\n');
await writeFile(path.join(notes, 'untouched.md'), '# Private unrelated file\nNot selected.\n');
await writeFile(path.join(profile, 'session.json'), JSON.stringify({ version: 1, documents: records, activeId: records[0].id, folder: notes }));
const requests: { instruction: string; documents: { id: string; name: string; text: string }[] }[] = [];
const server = createServer(async (request, response) => {
  try {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw), user = JSON.parse(body.messages[1].content), sources = JSON.parse(user.selection).documents;
    assert.equal(raw.includes(notes), false); assert.equal(raw.includes('batch-ui-'), false); assert.equal(raw.includes('Not selected.'), false);
    requests.push({ instruction: user.instruction, documents: sources });
    if (user.instruction.includes('slow')) await new Promise(resolve => setTimeout(resolve, 600));
    const result = { summary: 'Unify the product name across the selected documents.', files: sources.map((source: { id: string; text: string }) => ({ id: user.instruction.includes('malformed') ? 'outside' : source.id, summary: 'Use the current product name and retain the budget.', edits: user.instruction.includes('numbers') ? [{ before: '30万元', after: '35万元' }] : [{ before: source.text.includes('Old Product') ? 'Old Product' : 'New Product', after: source.text.includes('Old Product') ? 'New Product' : 'Next Product' }] })) };
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'stop' }] }));
  } catch (error) { response.writeHead(400); response.end(JSON.stringify({ error: String(error) })); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const endpoint = 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port + '/v1';
const env: Record<string, string> = { ...process.env, OPEN_MARKDOWN_LANE_DATA_DIR: profile, OPEN_MARKDOWN_LANE_AI_SETTINGS_DIR: profile, OPEN_MARKDOWN_LANE_TEST_HIDDEN: process.env.OPEN_MARKDOWN_LANE_TEST_HIDDEN || '0' }; delete env.ELECTRON_RUN_AS_NODE; delete env.OPEN_MARKDOWN_LANE_DEV_URL;
let app!: ElectronApplication, page!: Page;
const checks: string[] = [], errors: string[] = [], consoleErrors: string[] = [];
const pass = (text: string) => { checks.push(text); console.log('PASS: ' + text); };
async function launch() { app = await electron.launch({ ...(process.env.OPEN_MARKDOWN_LANE_EXECUTABLE ? { executablePath: process.env.OPEN_MARKDOWN_LANE_EXECUTABLE, args: [] } : { args: [process.cwd()] }), env, timeout: 30000 }); page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); }); await expect(page.getByRole('tab', { name: 'proposal.md', exact: true })).toBeVisible(); }
async function command(action: string) { await app.evaluate(({ BrowserWindow }, action) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', { action }), action); }
const dialog = () => page.getByRole('dialog', { name: 'Edit multiple documents', exact: true });
async function state() { return JSON.parse(await readFile(path.join(profile, 'session.json'), 'utf8')).documents as typeof records; }
async function buffer(index: number, content: string) { await expect.poll(async () => (await state()).find(record => record.id === records[index].id)?.content).toBe(content); }
async function disk(index: number, content: string) { await expect.poll(async () => (await readFile(records[index].path)).equals(iconv.encode(content, records[index].encoding))).toBe(true); }
async function saveAll() { for (const record of records) { await page.getByRole('tab', { name: record.name, exact: true }).click(); await command('save'); } }
async function choose(instruction: string, indexes = [0, 1, 2]) { await command('batch-edit'); for (const index of indexes) await dialog().getByLabel('Edit document ' + records[index].name, { exact: true }).check(); await dialog().getByRole('textbox', { name: 'Multi-document instructions', exact: true }).fill(instruction); }
async function plan() { await dialog().getByRole('button', { name: 'Generate edit plan', exact: true }).click(); await expect(dialog().getByRole('button', { name: 'Review file changes', exact: true })).toBeVisible(); }
async function review() { await dialog().getByRole('button', { name: 'Review file changes', exact: true }).click(); }
async function closeDialog() { await dialog().getByRole('button', { name: 'Close Edit multiple documents', exact: true }).click(); await expect(dialog()).toHaveCount(0); }
async function historyFirst() { await command('batch-edit'); await dialog().getByRole('button', { name: 'Batch recovery', exact: true }).click(); await expect(dialog().locator('.batch-history-list button').first()).toBeVisible(); await dialog().locator('.batch-history-list button').first().click(); await expect(dialog().getByRole('heading', { name: 'Documents to restore', exact: true })).toBeVisible(); await dialog().getByLabel('I reviewed these documents and want to restore the entire batch.', { exact: true }).check(); }
try {
  await launch();
  await page.evaluate(() => { localStorage.setItem('open-markdown-lane-autosave', 'false'); const preferences = JSON.parse(localStorage.getItem('open-markdown-lane-preferences') || '{}'); preferences.language = 'en'; localStorage.setItem('open-markdown-lane-preferences', JSON.stringify(preferences)); }); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en'); await expect(page.getByRole('tab', { name: 'proposal.md', exact: true })).toBeVisible();
  await page.evaluate(async endpoint => { const response = await window.desktop!.aiSettings({ protocol: 'openai', baseUrl: endpoint, model: 'owned-batch-fixture', rememberKey: false }); if (!response.ok) throw Error(response.error); }, endpoint);
  assert.match(page.url(), /index\.html/); assert.match(await page.title(), /Open Markdown Lane/); assert.ok((await page.locator('body').innerText()).includes('Old Product')); await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await choose('Update the product name consistently.'); const before = requests.length; assert.equal(before, 0); await plan(); assert.equal(requests.length, 1); assert.equal(requests[0].documents.length, 3);
  for (let index = 0; index < 3; index++) { await buffer(index, originals[index]); await disk(index, originals[index]); }
  await review(); await dialog().getByLabel('Accept document guide.md', { exact: true }).uncheck(); await expect(dialog().getByRole('button', { name: 'Apply to 2 documents', exact: true })).toBeEnabled();
  await dialog().evaluate(element => { element.scrollTop = 0; }); await page.screenshot({ path: path.join(qa, 'batch-review-en.png') });
  await dialog().getByRole('button', { name: 'Apply to 2 documents', exact: true }).click(); await expect(dialog().getByRole('status')).toContainText('Updated 2 documents');
  const updated = originals.map((text, index) => index === 2 ? text : text.replace('Old Product', 'New Product'));
  for (let index = 0; index < 3; index++) { await buffer(index, updated[index]); await disk(index, originals[index]); }
  await closeDialog(); await saveAll(); for (let index = 0; index < 3; index++) await disk(index, updated[index]);
  pass('Only three selected documents reach the model; plans are read-only, selective file acceptance changes two buffers, and manual save preserves exact CRLF/GB18030 bytes.');
  await page.getByRole('tab', { name: 'proposal.md', exact: true }).click(); await command('undo'); await buffer(0, originals[0]); await command('save'); await disk(0, originals[0]); await command('redo'); await buffer(0, updated[0]); await command('save'); await disk(0, updated[0]);
  pass('Every approved file has one isolated undo/redo transaction, including a formerly unvisited background tab.');
  await app.evaluate(({ app }) => app.exit(0)); await app.close(); await launch(); await historyFirst(); await dialog().getByRole('button', { name: 'Restore all documents', exact: true }).click(); await expect(dialog().getByRole('status')).toContainText('Batch restored');
  for (let index = 0; index < 3; index++) await buffer(index, originals[index]); await page.screenshot({ path: path.join(qa, 'batch-restored-en.png') }); await closeDialog(); await saveAll(); for (let index = 0; index < 3; index++) await disk(index, originals[index]);
  pass('Recovery points survive a real application restart and restore the entire accepted batch, while retaining the pre-restore content as another recovery point.');
  const pending = await page.evaluate(async id => { const result = await window.desktop!.prepareEditBatch({ instruction: 'Interrupted owned fixture', files: [{ documentId: id, before: '# Original', after: '# Pending' }] }); if (!result.ok) throw Error(result.error); return result.value; }, records[2].id);
  await command('batch-edit'); await dialog().getByRole('button', { name: 'Batch recovery', exact: true }).click(); await dialog().locator('.batch-history-list button').filter({ hasText: 'Interrupted owned fixture' }).click();
  await dialog().getByText('Remove a pending record', { exact: true }).click(); await expect(dialog().getByRole('button', { name: 'Remove this pending record', exact: true })).toBeDisabled();
  await dialog().getByLabel('I no longer need this pending recovery record.', { exact: true }).check(); await dialog().getByRole('button', { name: 'Remove this pending record', exact: true }).click(); await expect(dialog().getByRole('status')).toContainText('Documents were not changed');
  const retained = await page.evaluate(async () => { const result = await window.desktop!.editBatches(); return result.ok ? result.value.map(batch => batch.id) : []; }); assert.equal(retained.includes(pending.id), false); assert.ok(retained.length >= 2); await closeDialog();
  pass('Explicit cleanup of an interrupted recovery point requires its own confirmation and preserves completed batches and document content.');
  await command('batch-edit'); await dialog().getByLabel('Edit document ' + folderLabel, { exact: true }).check(); await dialog().getByRole('textbox', { name: 'Multi-document instructions', exact: true }).fill('Update the product name.'); await plan();
  assert.equal(requests.at(-1)!.documents[0].name, folderLabel); await expect(page.getByRole('tab', { name: 'README.md', exact: true })).toBeVisible();
  await dialog().getByRole('button', { name: 'Choose again', exact: true }).click(); await expect(dialog().getByLabel('Edit document ' + folderLabel, { exact: true })).toBeChecked(); await plan(); await closeDialog();
  assert.equal(await readFile(path.join(notes, 'manual/README.md'), 'utf8'), '# Manual\n\nOld Product has local editing.\n');
  pass('Folder targets open through granted tokens, retain relative display names, and remain selected for regeneration without sending absolute paths.');
  await choose('numbers: update the budget.', [1]); await plan(); await review(); await expect(dialog().getByRole('alert')).toContainText('Protected content changed'); await expect(dialog().getByRole('button', { name: 'Apply to 1 documents', exact: true })).toBeDisabled();
  await dialog().locator('.rewrite-constraints summary').click(); await dialog().getByLabel('Numbers, dates and units', { exact: true }).uncheck(); await expect(dialog().getByRole('button', { name: 'Apply to 1 documents', exact: true })).toBeEnabled(); await closeDialog(); await disk(1, originals[1]);
  pass('Unexpected number/unit changes are blocked by default, and an explicit constraint change permits intentional edits without silently accepting them.');
  await choose('malformed plan', [0]); await dialog().getByRole('button', { name: 'Generate edit plan', exact: true }).click(); await expect(dialog().getByRole('alert')).toContainText('unknown file'); await expect(dialog().getByRole('button', { name: 'Review file changes', exact: true })).toHaveCount(0); await closeDialog();
  await choose('slow plan', [0]); await dialog().getByRole('button', { name: 'Generate edit plan', exact: true }).click(); await dialog().getByRole('button', { name: 'Cancel generation', exact: true }).click(); await expect(dialog().getByRole('button', { name: 'Generate edit plan', exact: true })).toBeVisible(); await page.waitForTimeout(700); await expect(dialog().getByRole('button', { name: 'Review file changes', exact: true })).toHaveCount(0); await closeDialog();
  pass('Malformed plans and cancelled late results never modify buffers or files.');
  await choose('composition test', [0]); const prompt = dialog().getByRole('textbox', { name: 'Multi-document instructions', exact: true }), count = requests.length;
  await prompt.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'zhong' }))); await prompt.press('ControlOrMeta+Enter'); await expect(dialog().getByRole('alert')).toContainText('composition'); assert.equal(requests.length, count); await prompt.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))); await closeDialog();
  pass('Chinese composition in the instructions cannot trigger submission or a model call.');
  await choose('Normal apply for conflict check.', [0, 1]); await plan(); await review(); await dialog().getByRole('button', { name: 'Apply to 2 documents', exact: true }).click(); await expect(dialog().getByRole('status')).toContainText('Updated 2 documents'); await closeDialog(); await saveAll();
  await page.getByRole('tab', { name: 'proposal.md', exact: true }).click(); await command('source'); const code = page.locator('.document-editor:not([hidden]) .cm-content'); await code.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.type('Later manual edit.'); await expect.poll(async () => (await state()).find(record => record.id === records[0].id)?.content).toContain('Later manual edit.'); const later = (await state()).find(record => record.id === records[0].id)!.content;
  await historyFirst(); await dialog().getByRole('button', { name: 'Restore all documents', exact: true }).click(); await expect(dialog().getByRole('alert')).toContainText('changed'); await buffer(0, later); await buffer(1, originals[1].replace('Old Product', 'New Product')); await closeDialog();
  pass('A later manual edit in one file blocks the entire restore; no other document is partially restored.');
  await choose('Normal disk conflict plan.', [1]); await plan(); await review(); await writeFile(records[1].path, iconv.encode('External change.\n', records[1].encoding)); await dialog().getByRole('button', { name: 'Apply to 1 documents', exact: true }).click(); await expect(dialog().getByRole('alert')).toContainText('disk file changed'); await expect.poll(async () => iconv.decode(await readFile(records[1].path), records[1].encoding)).toBe('External change.\n'); await closeDialog();
  pass('An external disk edit blocks application before buffer changes and is never overwritten.');
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  await writeFile(path.join(qa, 'batch-desktop-results.json'), JSON.stringify({ platform: process.platform, fixtureOnly: true, actualModelInference: false, browserPlugin: 'not available; existing Playwright Electron suite', page: page.url(), checks, errors, consoleErrors }, null, 2));
} catch (error) { await page?.screenshot({ path: path.join(qa, 'batch-failure.png') }).catch(() => {}); console.error(await page?.locator('[role="alert"],.toast').allTextContents().catch(() => [])); throw error; }
finally { if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); } server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
