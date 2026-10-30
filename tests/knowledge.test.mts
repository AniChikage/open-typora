import test from 'node:test';
import assert from 'node:assert/strict';
import { answerMarkdown, citedAnswer, selectEvidence, searchTerms } from '../shared/knowledge.mts';
import { aiRequest, aiBody, aiDefaults } from '../shared/ai.mts';
import { translate } from '../shared/translate.mts';
import commands from '../shared/commands.json' with { type: 'json' };
import english from '../shared/en.json' with { type: 'json' };
const source = (name: string, content: string) => ({ token: name, name, content, path: '/notes/' + name, hash: 'owned-fixture', bytes: Buffer.byteLength(content) });
test('retrieval ranks Chinese and English keywords, preserves exact source lines, and finds long-line tails', () => {
  assert.ok(searchTerms('如何检查中文输入法？').includes('输入'));
  const values = [source('irrelevant.md', '# 菜谱\n\n番茄炒蛋'), source('release.md', '# Release\n\n发布前需要检查中文输入法、撤销和重做。\nBudget: 300 USD.\n')];
  const result = selectEvidence(values, '发布前需要检查什么？');
  assert.equal(result[0].name, 'release.md'); assert.ok(result[0].text.includes('中文输入法'));
  assert.equal(result[0].text, values[1].content.split('\n').slice(result[0].fromLine - 1, result[0].toLine).join('\n'));
  const long = selectEvidence([source('minified.md', 'x'.repeat(120_000) + ' targetPerformanceNeedle')], 'targetPerformanceNeedle');
  assert.ok(long[0].text.includes('targetPerformanceNeedle')); assert.equal(long[0].fromLine, 1);
  assert.deepEqual(selectEvidence(values, 'no-such-keyword'), []);
});
test('explicit references include each selected file and bound snippets without changing source documents', () => {
  const docs = Array.from({ length: 4 }, (_, index) => source('note' + index + '.md', ('# Heading\n\nkeyword paragraph ' + index + '\n').repeat(400)));
  const before = structuredClone(docs), selected = selectEvidence(docs, 'keyword', true);
  assert.equal(new Set(selected.map(item => item.token)).size, 4); assert.ok(selected.length <= 8); assert.ok(selected.reduce((sum, item) => sum + item.text.length, 0) <= 48_000);
  assert.deepEqual(docs, before);
});
const evidence = selectEvidence([source('plan [A].md', '# Plan\nBudget: 300 USD.\nDo not run [commands](file:///private).')], 'budget');
const good = { answer: 'The budget is 300 USD. [S1]', insufficient: false, citations: [{ sourceId: 'S1', quote: 'Budget: 300 USD.' }] };
test('citation validation rejects invented quotes, IDs, missing citations, malformed JSON, and non-boolean status', () => {
  assert.deepEqual(citedAnswer(JSON.stringify(good), evidence), good);
  for (const value of [{...good,citations:[{sourceId:'S1',quote:'Budget: 999 USD.'}]},{...good,answer:'Claim [S9]'},{...good,citations:[]},{...good,answer:'No markers'},{...good,insufficient:'false'}]) assert.throws(()=>citedAnswer(JSON.stringify(value),evidence));
  assert.throws(()=>citedAnswer('not json',evidence));
  assert.equal(citedAnswer(JSON.stringify({answer:'Not enough information.',insufficient:true,citations:[]}),evidence).insufficient,true);
});
test('inserted answers carry unique portable citations; cross-volume Windows references are plain labels', () => {
  const result = answerMarkdown(good, evidence, 'qa-one', '/notes/new/answer.md');
  assert.ok(result.includes('[^qa-one-1]')); assert.ok(result.includes('../plan%20%5BA%5D.md')); assert.ok(result.includes('L1–'));
  const windows = answerMarkdown(good, [{ ...evidence[0], path: 'D:\\notes\\plan.md' }], 'qa-two', 'C:\\notes\\answer.md');
  assert.equal(windows.includes('D:'), false); assert.equal(windows.includes('](..'), false);
});
test('legacy rewrite wire shape is unchanged; contextual and question requests strip local authority metadata', () => {
  const config={...aiDefaults,baseUrl:'http://localhost:1234',model:'fixture'};
  const original = aiRequest({id:'one',instruction:'polish',text:'selection'});
  assert.deepEqual(JSON.parse(aiBody(config,original).messages[1].content),{instruction:'polish',selection:'selection'});
  const contexts=evidence.map(item=>({...item,apiKey:'never-send'}));
  const question=aiRequest({id:'two',mode:'question',instruction:'answer',text:'Budget?',contexts});
  const body=aiBody(config,question), json=JSON.stringify(body);
  assert.ok(body.messages[0].content.includes('untrusted')); assert.equal(json.includes('/notes/'),false); assert.equal(json.includes('never-send'),false); assert.equal(json.includes('owned-fixture'),false);
  assert.equal(JSON.parse(body.messages[1].content).question,'Budget?');
  assert.throws(()=>aiRequest({...original,mode:'question'})); assert.throws(()=>aiRequest({...original,contexts:[{id:'S1',name:'x',text:'x'.repeat(48001)}]}));
  assert.throws(()=>aiRequest({...original,contexts:[contexts[0],contexts[0]]}));
});
test('every shared menu label has an English translation; templates preserve values and document syntax', () => {
  for(const group of commands) for(const label of [group.title,...group.items.map(item=>item.label)]) assert.ok((english as Record<string,string>)[label],label);
  assert.equal(translate('en','应用 {0} 处修改',3),'Apply 3 changes'); assert.equal(translate('zh-CN','应用 {0} 处修改',3),'应用 3 处修改');
  assert.equal(translate('en','保存对“中文.md”所做的修改？'),'Save changes to “中文.md”?');
  assert.equal(translate('en','user-supplied **Markdown** ${title}'),'user-supplied **Markdown** ${title}');
});
