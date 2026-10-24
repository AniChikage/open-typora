import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeSource } from '../src/editor/sourceAnalysis.ts';
import { normalizeCustomization, customizationCss, exportedThemeCss } from '../src/themeCustomization.ts';
const dom=new JSDOM('<!doctype html><body></body>');for(const key of ['window','document','DOMParser','Node'])globalThis[key]=dom.window[key];
const {MarkdownDocument}=await import('../src/editor/model.ts');
test('5 MB document keeps 100 small undo steps and exact UTF-8/CRLF content',()=>{
 const original=('# 大文件 👋\r\n\r\n正文与代码 **内容** 0123456789\r\n').repeat(120000);
 assert.ok(Buffer.byteLength(original)>5*1024*1024);
 const model=new MarkdownDocument(original,'\r\n'), initial=model.text;
 for(let i=0;i<100;i++){model.closeGroup();model.replace(50+i,50+i,'中','command');}
 for(let i=0;i<100;i++)assert.equal(model.undo(),true);
 assert.equal(model.text,initial);assert.equal(model.toMarkdown(),original);
 for(let i=0;i<100;i++)assert.equal(model.redo(),true);
 assert.equal(model.text.length,initial.length+100);assert.equal(model.serialize(),model.text);
});
test('delta history matches independent randomized replacements, undo and redo',()=>{
 const model=new MarkdownDocument('x'.repeat(310000));let expected=model.text,seed=17;const history=[];
 const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let i=0;i<80;i++){
  const before=expected,from=rand()%expected.length,to=Math.min(expected.length,from+rand()%8),text=['','你好','abc','👋'][rand()%4];
  if(expected.slice(from,to)===text)continue;
  history.push(before);expected=expected.slice(0,from)+text+expected.slice(to);model.closeGroup();model.replace(from,to,text);
  assert.equal(model.text,expected);
 }
 const redo=[];while(history.length){redo.push(model.text);assert.ok(model.undo());assert.equal(model.text,history.pop());}
 while(redo.length){assert.ok(model.redo());assert.equal(model.text,redo.pop());}
});
test('source full replacements retain caret semantics and compact composition history',()=>{
 const model=new MarkdownDocument('a'.repeat(400000));model.replace(0,model.text.length,'a'.repeat(200000)+'你好'+'a'.repeat(200000));
 assert.equal(model.selection.head,400002);assert.ok(model.undo());
 model.beginComposition();model.replace(2,2,'zhong','composition');model.replace(2,7,'中国','composition');model.endComposition();
 assert.equal(model.text.slice(0,6),'aa中国aa');assert.ok(model.undo());assert.equal(model.text,'a'.repeat(400000));assert.ok(model.redo());assert.equal(model.text.slice(0,6),'aa中国aa');
});
test('background analysis excludes fences/frontmatter/comments from outline and caps huge outlines',()=>{
 const value=analyzeSource('---\ntitle: X\n---\n# 中文 **标题**\n\n```md\n# Not a heading\n```\n<!--\n# Also hidden\n-->\n\nSecond title\n---\n');
 assert.deepEqual(value.headings.map(h=>[h.line,h.level,h.text]),[[4,1,'中文 标题'],[13,2,'Second title']]);
 assert.equal(analyzeSource('👋 中 a\n').characters,6);assert.equal(analyzeSource('👋 中 a\n').compactCharacters,3);
 const huge=analyzeSource('# A\n'.repeat(2010));assert.equal(huge.headings.length,2000);assert.equal(huge.truncated,true);
});
test('theme customization validates generated values and exports print CSS with user overrides',()=>{
 const value=normalizeCustomization({fontFamily:'x;}body{display:none}',lineHeight:900,contentWidth:-1,ink:'red;display:none',accent:'#123456',css:'.rich-document h2{color:green}',printCss:'.print-document h2{break-before:page}'});
 assert.equal(value.fontFamily,'');assert.equal(value.ink,'');assert.equal(value.lineHeight,2.5);assert.equal(value.contentWidth,480);
 assert.match(customizationCss(value),/--accent:#123456/);assert.match(exportedThemeCss('/* original */',value),/@media print/);assert.match(exportedThemeCss('',value),/break-before:page/);
});

test('delta history releases large parent strings after small replacements',()=>{
 const report=JSON.parse(execFileSync(process.execPath,['--expose-gc',fileURLToPath(new URL('./history-memory.mjs',import.meta.url))],{encoding:'utf8',timeout:30000}));
 assert.ok(report.growthBytes<32*1024*1024,`100 small history entries retained ${report.growthBytes} bytes`);
 assert.equal(report.undoSteps,100);
});
test('detached undo deltas retain exact UTF-16 units including lone surrogates',()=>{
 const original='x'.repeat(310000),model=new MarkdownDocument(original),insert='A'.repeat(8191)+'👋\ud800'+'中'.repeat(16000)+'\udc00';
 model.replace(20,24,insert);assert.equal(model.text,original.slice(0,20)+insert+original.slice(24));
 assert.ok(model.undo());assert.equal(model.text,original);assert.ok(model.redo());assert.equal(model.text.slice(20,20+insert.length),insert);
});

test('large rich documents reparse affected blocks and retain exact structure through undo and IME',()=>{
 const original=('# Heading\n\nParagraph **bold** 中文 text.\n\n- one\n- two\n\n').repeat(6500);
 const model=new MarkdownDocument(original);model.enableRichParsing();
 assert.ok(model.nodes.length>15000);assert.equal(model.serialize(),model.text);
 const same=()=>{const expected=new MarkdownDocument(model.text);expected.selection={...model.selection};expected.enableRichParsing();assert.deepEqual(model.nodes.map(({from,to,kind,source,line})=>({from,to,kind,source,line})),expected.nodes.map(({from,to,kind,source,line})=>({from,to,kind,source,line})));assert.equal(model.serialize(),model.text);};
 for(const insert of ['你好','\n\n## New heading\n\n','```js\n','\n```\n','\n[reference]: https://example.com\n']) {
  const at=Math.floor(model.text.length/2);model.closeGroup();model.replace(at,at+3,insert);same();assert.ok(model.undo());same();assert.ok(model.redo());same();
 }
 model.beginComposition();model.replace(25,25,'zhong','composition');model.replace(25,30,'中国','composition');model.endComposition();same();assert.ok(model.undo());same();
 model.beginSourceSession();model.replace(0,2,'##');model.endSourceSession();same();
});
