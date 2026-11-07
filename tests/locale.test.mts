import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLocale, preferredLocale, systemLocale } from '../shared/locale.mts';
import englishSamples from '../shared/samples.en.json' with {type:'json'};

test('system locale uses the primary language and English fallback', () => {
  for (const value of ['zh', 'zh_CN.UTF-8', 'zh-TW', 'zh-Hant-HK', 'ZH_sg', 'zh_CN@modifier']) assert.equal(normalizeLocale(value),'zh-CN',value);
  for (const value of ['en-US','fr_FR.UTF-8','ja-JP','C','C.UTF-8','POSIX','','zhang',null]) assert.equal(normalizeLocale(value),'en',String(value));
  assert.equal(systemLocale('linux',{LANG:'zh_CN.UTF-8'}),'zh-CN');
  assert.equal(systemLocale('linux',{LANG:'zh_CN.UTF-8',LC_MESSAGES:'en_US.UTF-8'}),'en');
  assert.equal(systemLocale('linux',{LANG:'en_US.UTF-8',LC_MESSAGES:'en_US',LC_ALL:'zh_TW.UTF-8'}),'zh-CN');
  assert.equal(systemLocale('linux',{LANG:'zh_CN',LC_ALL:'C'}),'en');
  assert.equal(systemLocale('linux',{},'zh-CN'),'zh-CN');
  assert.equal(systemLocale('darwin',{LANG:'en_US'},'zh-Hans-CN'),'zh-CN');
  assert.equal(systemLocale('win32',{LANG:'zh_CN'},'de-DE'),'en');
});

test('both explicit language choices override the operating system', () => {
  assert.equal(preferredLocale('en','zh-CN'),'en');
  assert.equal(preferredLocale('zh-CN','en-US'),'zh-CN');
  assert.equal(preferredLocale(undefined,'zh-Hant'),'zh-CN');
  assert.equal(preferredLocale('unsupported','fr-FR'),'en');
});

test('English first-run notes include localized names, examples and language help', () => {
  assert.deepEqual(englishSamples.map(s=>s.name),['Welcome.md','Writing Example.md','Markdown Guide.md']);
  assert.ok(englishSamples.every(s=>s.content.startsWith('# ') && !/[\u3400-\u9fff]/u.test(s.content)));
  assert.match(englishSamples[0].content,/Preferences → Language/);
  assert.match(englishSamples[1].content,/```mermaid/);
  assert.match(englishSamples[2].content,/keeps your draft/);
});

test('renderer preference loading preserves legacy explicit Chinese and English', async () => {
  const values = new Map<string,string>();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});
  try {
    const {setSystemLocale}=await import('../src/initialLocale.ts');
    const {loadPreferences}=await import('../src/preferences.ts');
    setSystemLocale('en-US');
    assert.equal(loadPreferences().language,'en');
    values.set('open-typora-preferences',JSON.stringify({language:'zh-CN',fontSize:21,remoteImages:false}));
    assert.equal(loadPreferences().language,'zh-CN');assert.equal(loadPreferences().fontSize,21);assert.equal(loadPreferences().remoteImages,false);
    values.set('open-markdown-lane-preferences',JSON.stringify({language:'en',fontSize:19}));setSystemLocale('zh-CN');
    assert.equal(loadPreferences().language,'en');assert.equal(loadPreferences().fontSize,19);
    values.clear();assert.equal(loadPreferences().language,'zh-CN');
    values.set('open-markdown-lane-preferences',JSON.stringify({language:'zh-CN',languageMode:'system',fontSize:20}));setSystemLocale('en-US');
    assert.equal(loadPreferences().language,'en');assert.equal(loadPreferences().languageMode,'system');assert.equal(loadPreferences().fontSize,20);
    values.set('open-markdown-lane-preferences','broken');setSystemLocale('en-US');assert.equal(loadPreferences().language,'en');
  } finally { if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else Reflect.deleteProperty(globalThis,'localStorage'); }
});
