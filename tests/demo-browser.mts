import { chromium, expect } from 'playwright/test';
import type { Browser, Page } from 'playwright';
import os from 'node:os';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const repo = process.cwd(), root = process.env.OPEN_TYPORA_QA_DIR || await mkdtemp(path.join(os.tmpdir(), 'open-typora-demo-qa-'));
await mkdir(root, { recursive: true });
const dist = path.join(repo, 'dist-demo');
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png'
};
const server = createServer(async (req, res) => {
  try {
    const address = new URL(req.url!, 'http://local');
    const file = path.resolve(dist, '.' + (address.pathname === '/' ? '/index.html' : decodeURIComponent(address.pathname)));
    assert.ok(file.startsWith(dist + path.sep));
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

const base = 'http://127.0.0.1:' + (server.address() as import('node:net').AddressInfo).port;
let browser!: Browser, page!: Page, downloadCount = 0;
const checks: string[] = [], errors: string[] = [], consoleErrors: string[] = [], external: string[] = [];
let acceptDialog = false;

try {
  browser = await chromium.launch({
    ...(process.env.OPEN_TYPORA_BROWSER_EXECUTABLE ? { executablePath: process.env.OPEN_TYPORA_BROWSER_EXECUTABLE } : {}),
    headless: true
  });
  const context = await browser.newContext({ acceptDownloads: true });
  page = await context.newPage();
  page.on('download', () => downloadCount++);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('request', r => {
    if (/^https?:/.test(r.url()) && !r.url().startsWith(base + '/')) external.push(r.url());
  });
  page.on('dialog', d => {
    void (acceptDialog ? d.accept() : d.dismiss()).catch(e => errors.push(String(e)));
  });
  await page.goto(base + '/');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('main', { name: 'Markdown writing workspace' })).toBeVisible();
  assert.match(await page.title(), /Open Typora/);
  assert.equal(await page.evaluate(() => window.desktop), undefined);
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  checks.push('Standalone demo loads without a desktop bridge, blank page, overlay or model-key controls.');

  const input = page.locator('input[type="file"]'), original = '# Imported\r\n\r\n你好，世界。\r\n';
  await input.setInputFiles({ name: '中文 文档.markdown', mimeType: 'text/markdown', buffer: Buffer.from(original) });
  await expect(page.getByRole('status')).toContainText('Opened in this tab');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const source = page.locator('.source-surface .cm-content');
  await expect(source).toBeVisible();
  const sourceText = () => source.locator('.cm-line').allTextContents().then(x => x.join('\n'));
  assert.equal(await sourceText(), original.replaceAll('\r\n', '\n'));
  checks.push('UTF-8 import normalizes CRLF and leaves the source file outside the browser unchanged.');

  const edited = '# Edited\n\n新正文😀。\n';
  await source.click();
  await source.press('ControlOrMeta+a');
  await page.keyboard.insertText(edited);
  await expect.poll(sourceText).toBe(edited);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(sourceText).toBe(original.replaceAll('\r\n', '\n'));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(sourceText).toBe(edited);
  checks.push('Source editing and visible Undo/Redo preserve exact Unicode text.');

  for (const sample of [
    { name: 'bad.md', buffer: Buffer.from([0xff]), message: "isn't UTF-8" },
    { name: 'binary.md', buffer: Buffer.from([97, 0, 98]), message: 'binary or UTF-16' },
    { name: 'too-large.md', buffer: Buffer.alloc(1024 * 1024 + 1, 97), message: 'up to 1 MB' },
    { name: 'bad.pdf', buffer: Buffer.from('text'), message: 'Markdown or .txt' }
  ]) {
    await input.setInputFiles({ name: sample.name, mimeType: 'application/octet-stream', buffer: sample.buffer });
    await expect(page.getByRole('alert')).toContainText(sample.message);
    assert.equal(await sourceText(), edited);
    await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  }
  checks.push('Invalid UTF-8, binary, oversized and unsupported files are rejected without replacing current edits.');

  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .md', exact: true }).click();
  const download = await downloadPending;
  await download.saveAs(path.join(root, 'download.md'));
  assert.equal(await download.failure(), null);
  assert.equal(await readFile(path.join(root, 'download.md'), 'utf8'), edited);
  assert.equal(download.suggestedFilename(), '中文 文档.md');
  checks.push('Actual browser download completes with exact edited bytes and a normalized Unicode .md filename.');

  await page.getByRole('combobox', { name: 'Example document', exact: true }).selectOption('welcome');
  assert.equal(await sourceText(), edited);
  acceptDialog = true;
  await page.getByRole('combobox', { name: 'Example document', exact: true }).selectOption('welcome');
  await expect.poll(sourceText).not.toBe(edited);
  checks.push('Cancelling replacement retains edits; confirming switches to the chosen example.');

  await source.click();
  await source.press('ControlOrMeta+Home');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'nihao', selectionStart: 5, selectionEnd: 5 });
  await page.getByRole('button', { name: 'Download .md', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.getByRole('alert')).toContainText('Finish your current input');
  assert.equal(downloadCount, 1);
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();
  checks.push('A marked composition cannot be downloaded before commit; this is Chromium composition, not an OS IME check.');

  await page.setViewportSize({ width: 400, height: 850 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  await expect(page.getByRole('button', { name: 'Download .md', exact: true })).toBeInViewport();
  await page.screenshot({ path: path.join(root, 'compact.png') });
  checks.push('The 400 px compact layout keeps controls reachable without horizontal page overflow.');

  await source.click();
  await source.press('ControlOrMeta+a');
  await page.keyboard.insertText('# Refresh marker\n');
  await expect.poll(sourceText).toBe('# Refresh marker\n');
  await page.reload();
  await expect(page.getByRole('main', { name: 'Markdown writing workspace' })).toBeVisible();
  await expect(page.locator('.demo-editor')).not.toContainText('Refresh marker');
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  checks.push('Refresh restores the sample; no external requests or renderer errors occurred.');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(root, 'desktop.png') });
  await writeFile(path.join(root, 'results.json'), JSON.stringify({
    passed: true, host: 'isolated headless Chromium; no user profile or desktop bridge', browserVersion: browser.version(),
    browserPlugin: 'not available; regular Playwright against the local app', checks, errors, consoleErrors, externalRequests: external.length
  }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length }));
} catch (error) {
  await page?.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {});
  await writeFile(path.join(root, 'results.json'), JSON.stringify({
    passed: false, checks, errors, consoleErrors, error: error instanceof Error ? error.message : 'Failed'
  }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
