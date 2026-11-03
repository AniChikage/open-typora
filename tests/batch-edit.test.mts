import test from 'node:test';
import assert from 'node:assert/strict';
import { batchInput, batchProposal, batchText, batchPrompt } from '../build/runtime/shared/batch-edit.mjs';
import { constraintViolations, defaultConstraints } from '../build/runtime/shared/rewrite-constraints.mjs';
import { aiBody, aiRequest } from '../shared/ai.mts';
const sources = [{ id: 'D1', name: '方案.md', text: '# Title\n\n旧名称的正文。\n预算 30万元。' }, { id: 'D2', name: 'FAQ.md', text: '旧名称可以离线用。' }];
const response = () => ({ summary: '统一名称', files: sources.map(source => ({ id: source.id, summary: '更新名称', edits: [{ before: '旧名称', after: '新名称' }] })) });
test('multi-document plans use exact unique non-overlapping patches and independent acceptance', () => {
  const plan = batchProposal(JSON.stringify(response()), sources);
  assert.equal(batchText(sources[0].text, plan.files[0].edits, [true]), sources[0].text.replace('旧名称', '新名称'));
  assert.equal(batchText(sources[1].text, plan.files[1].edits, [false]), sources[1].text);
  assert.throws(() => batchText('changed', plan.files[0].edits, [true]));
});
test('plans reject invented files, duplicated IDs, missing files, ambiguous or overlapping original text and malformed output', () => {
  for (const change of [
    (value: ReturnType<typeof response>) => { value.files[0].id = '../../outside'; },
    (value: ReturnType<typeof response>) => { value.files[1].id = 'D1'; },
    (value: ReturnType<typeof response>) => { value.files.pop(); },
    (value: ReturnType<typeof response>) => { value.files[0].edits[0].before = 'invented'; },
    (value: ReturnType<typeof response>) => { value.files[0].edits.push({ before: '旧名称的正文', after: 'overlap' }); },
  ]) { const value = response(); change(value); assert.throws(() => batchProposal(JSON.stringify(value), sources)); }
  assert.throws(() => batchProposal(JSON.stringify(response()), [{ ...sources[0], text: '旧名称 旧名称' }, sources[1]]));
  assert.throws(() => batchProposal('```json\n{}\n```', sources));
});
test('batch model protocol is explicit and source payloads contain no host tokens or paths', () => {
  const request = aiRequest({ id: 'owned-batch', mode: 'batch', instruction: '统一名称', text: batchInput(sources, defaultConstraints) });
  const body = aiBody({ protocol: 'openai', baseUrl: 'http://127.0.0.1:1234', model: 'owned' }, request);
  assert.equal(body.messages[0].content, batchPrompt); assert.equal(JSON.stringify(body).includes('document:'), false);
  assert.throws(() => batchInput([{ ...sources[0], text: 'x'.repeat(50001) }], defaultConstraints));
  assert.throws(() => batchInput(Array.from({ length: 4 }, (_, i) => ({ id: 'D' + (i + 1), name: 'note', text: 'x'.repeat(40000) })), defaultConstraints));
});
test('constraints detect number, date, unit and occurrence changes including Chinese, preserving safe rewrites', () => {
  const text = '预算 30万元，日期 2026-11-03，比例 25%，耗时 10 ms。';
  assert.equal(constraintViolations(text, text.replace('预算', '总预算'), defaultConstraints).length, 0);
  for (const after of [text.replace('30万元', '35万元'), text.replace('30万元', '30元'), text.replace('11-03', '11-04'), text + '另需 30万元。']) assert.ok(constraintViolations(text, after, defaultConstraints).some(item => item.kind === 'numbers'));
  assert.equal(constraintViolations('30万元', '35万元', { ...defaultConstraints, numbers: false }).length, 0);
});
test('constraints preserve relative images, reference destinations, raw HTML and code, with explicit term locks', () => {
  const text = '[说明](docs/a.md) ![图](./图.png)\n\n[ref]: other.md\n\n<img src="./raw.png">\n\n```ts\nconst 名称 = "value";\n```\n\nUse `x + y` with Open Typora.';
  for (const [before, after, kind] of [['docs/a.md','https://other.test','links'], ['./图.png','./new.png','links'], ['other.md','../private.md','links'], ['./raw.png','./other.png','links'], ['value','changed','code'], ['x + y','x - y','code']] as const) assert.ok(constraintViolations(text, text.replace(before, after), defaultConstraints).some(item => item.kind === kind));
  assert.ok(constraintViolations(text, text.replace('Open Typora','new name'), { ...defaultConstraints, terms: ['Open Typora'] }).some(item => item.kind === 'terms'));
  assert.equal(constraintViolations(text, text.replace('说明','文档'), defaultConstraints).length, 0);
});


test('date/time order and weekday changes are protected, including bare web URLs', () => {
  for (const [before, after] of [['2026-11-03', '2026-03-11'], ['12:30', '30:12'], ['周五', '周六'], ['Friday', 'Saturday']]) assert.ok(constraintViolations(before, after, defaultConstraints).some(item => item.kind === 'numbers'));
  assert.ok(constraintViolations('Read https://example.com/docs', 'Read https://other.test/docs', defaultConstraints).some(item => item.kind === 'links'));
});


test('partial URL and code selections use bounded local context without expanding the model payload', async () => {
  const { rewriteGuard, guardedRewrite } = await import('../src/editor/aiReview.ts');
  for (const source of ['Read [docs](https://example.com/old) now.', 'Use `old` here.', '```js\nconst name = "old";\n```']) {
    const from = source.indexOf('old'), to = from + 3, selection = { documentId: 'local-only', source, from, to, text: 'old', ...rewriteGuard(source, from, to, [{ from: 0, to: source.length, kind: source.startsWith('```') ? 'fence' : 'paragraph' }]) };
    assert.ok(constraintViolations(guardedRewrite(selection, 'old'), guardedRewrite(selection, 'new'), defaultConstraints).length);
  }
  const huge = '```text\n' + 'x'.repeat(2_000_000) + 'old\n```', from = huge.indexOf('old');
  const guard = rewriteGuard(huge, from, from + 3, [{ from: 0, to: huge.length, kind: 'fence' }]); assert.ok(guard.guardPrefix!.length + guard.guardSuffix!.length < 100);
});
