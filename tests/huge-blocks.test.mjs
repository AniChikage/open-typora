import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import MarkdownIt from 'markdown-it';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DocumentStore,encodeText} from '../electron/store.mjs';
import {contiguousPositions,positionIndex,shiftPositions} from '../src/editor/sourcePositions.ts';
import {TableIndex,RowHeights} from '../src/editor/tableData.ts';
const dom=new JSDOM('<!doctype html><body></body>');
for(const name of ['window','document','DOMParser','Node'])globalThis[name]=dom.window[name];
const {MarkdownDocument}=await import('../src/editor/model.ts');
const {codeBody}=await import('../src/editor/richRender.ts');
const {parseBlocks}=await import('../src/editor/markdown.ts');

test('32 MiB Markdown opens, saves, recovers and encodes beyond the previous cap',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'open-typora-unbounded-')),file=path.join(directory,'large.md');
 const content='# Large\n'+'x'.repeat(32*1024*1024)+'\n';await writeFile(file,content);
 const store=new DocumentStore(path.join(directory,'profile')),record=await store.open(file);
 assert.equal(record.content,content);await store.save(record.id,content+'保存');
 assert.equal(await readFile(file,'utf8'),content+'保存');
 await store.persist({documents:[{id:record.id,content:content+'草稿'}],activeId:record.id});
 const restored=await new DocumentStore(store.dataDir).restore();assert.equal(restored.documents[0].content,content+'草稿');assert.equal(restored.documents[0].savedContent,content+'保存');
 const encoded=encodeText(content,'utf-16le',true);assert.ok(encoded.length>64*1024*1024);assert.equal(encoded[0],255);assert.equal(encoded.subarray(2).toString('utf16le'),content);
});
test('compact code maps preserve UTF-16 positions, nested prefixes and very distant selections',()=>{
 const positions=contiguousPositions(91,40*1024*1024);assert.equal(positions.length,41943041);assert.equal(Object.keys(positions).length,0);
 assert.equal(positions[35000000],35000091);assert.equal(positions.at(-1),41943131);assert.equal(positionIndex(positions,35000091),35000000);
 assert.equal(shiftPositions(positions,9)[35000000],35000100);
 for(const source of ['```js\n你好👋\n```','> ```js\n> 你好👋\n> line\n> ```']){
  const node={id:'code',from:20,to:20+source.length,source,kind:'fence',line:1};const body=codeBody(node,0);
  assert.equal(body.positions.length,body.raw.length+1);
  for(let i=0;i<body.raw.length;i++)assert.equal(source[body.positions[i]-node.from],body.raw[i]);
 }
});
test('compact table indexing agrees with full Markdown block boundaries and retains unusual syntax',()=>{
 const oracle=new MarkdownIt();
 for(const suffix of ['\n\n# After','\nno leading pipe\n\nAfter','\n\n[^n]: note']){
  const text='| A | B |\n|---|:---:|\n'+Array.from({length:500},(_,i)=>`| ${i} | value \\| ${i} |`).join('\n')+suffix;
  const actual=parseBlocks(text).filter(block=>block.kind==='table_open'),expected=oracle.parse(text,{}).filter(token=>token.type==='table_open');
  assert.deepEqual(actual.map(block=>[block.fromLine-1,block.toLine]),expected.map(token=>token.map));
 }
 const source='| A |\n|---|\n'+('| value |\n').repeat(500);assert.equal(parseBlocks(source)[0].kind,'table_open');
 const index=new TableIndex('| Key | Value |\n|---|---|\n| one | escaped \\| value |\n| last | 中国 |');
 assert.equal(index.rowAt(index.source.indexOf('中国')),3);assert.equal(index.cells(2)[1].raw,'escaped \\| value');
});
test('measured table rows retain monotonic indexed offsets at hundreds of thousands of rows',()=>{
 const heights=new RowHeights(400000);heights.measure(0,70);heights.measure(200000,80);heights.measure(399999,60);
 assert.equal(heights.offset(400000),16000090);assert.equal(heights.at(heights.offset(200000)+1),200000);assert.equal(heights.at(heights.offset(400000)),399999);
});
test('large code and table edits match full parsing, including fence and footnote context changes',()=>{
 const table='| Key | Value |\n|---|---|\n'+Array.from({length:16000},(_,i)=>`| row-${i} | normal value ${i} |`).join('\n');
 for(const source of ['```js\n'+('const a = 1;\n').repeat(40000)+'```\n\n# End\n',table+'\n\n# End\n\n[^n]: Note\n']){
  const model=new MarkdownDocument(source);model.enableRichParsing();
  const middle=source.indexOf('normal value 8000')>=0?source.indexOf('normal value 8000'):source.indexOf('const a',source.length/2);
  for(const text of ['中国','[^n]','\n\n','```']){
   model.closeGroup();model.replace(middle,middle,text);
   const full=new MarkdownDocument(model.text);full.enableRichParsing();
   const fields=nodes=>nodes.filter(node=>node.kind!=='empty').map(({kind,from,to,line,source})=>({kind,from,to,line,source}));
   assert.deepEqual(fields(model.nodes),fields(full.nodes));assert.equal(model.serialize(),model.text);assert.deepEqual(model.environment.footnoteNumbers,full.environment.footnoteNumbers);assert.ok(model.undo());assert.equal(model.text,source);
  }
 }
});

test('occluded table windows still mount scrolled rows when animation frames are suspended',async()=>{
 const {LargeTableView}=await import('../src/editor/LargeTableView.ts');
 const previousFrame=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=()=>71;globalThis.cancelAnimationFrame=()=>{};
 const source='| Key | Value |\n|---|---|\n'+Array.from({length:1000},(_,i)=>`| row-${i} | ${i===999?'TAIL':'value'} |`).join('\n');
 const node={id:'background-table',from:0,to:source.length,source,kind:'table_open',line:1};
 const view=new LargeTableView(node,'fixture',{},()=>{},()=>false);
 try{
  Object.defineProperties(view.element,{clientHeight:{value:480},scrollHeight:{value:40000}});document.body.append(view.element);
  view.update(node,{}, {anchor:-1,head:-1},false);view.element.scrollTop=39520;view.element.dispatchEvent(new dom.window.Event('scroll'));
  const deadline=Date.now()+1500;while(Date.now()<deadline&&!view.element.textContent.includes('TAIL'))await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(view.element.textContent.includes('TAIL'));assert.ok(view.element.querySelectorAll('td').length<150);
 }finally{view.destroy();view.element.remove();globalThis.requestAnimationFrame=previousFrame;globalThis.cancelAnimationFrame=previousCancel;}
});

test('table viewport changes retain the caret in an unchanged row',async()=>{
 const {LargeTableView}=await import('../src/editor/LargeTableView.ts');
 const previousFrame=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=()=>71;globalThis.cancelAnimationFrame=()=>{};
 const source='| Key | Value |\n|---|---|\n'+Array.from({length:1000},(_,i)=>`| row-${i} | value |`).join('\n');
 const node={id:'retained-table',from:0,to:source.length,source,kind:'table_open',line:1},environment={};
 const view=new LargeTableView(node,'fixture',environment,()=>{},()=>false);
 try{
  Object.defineProperties(view.element,{clientHeight:{value:480},scrollHeight:{value:40000}});document.body.append(view.element);
  const point=view.index.offsets[500]+view.index.cells(500)[0].start;
  view.update(node,environment,{anchor:point,head:point},false);
  const text=view.element.querySelector('tr[data-source-row="500"] td span').firstChild;
  window.getSelection().setBaseAndExtent(text,2,text,2);
  view.element.scrollTop-=240;view.element.dispatchEvent(new dom.window.Event('scroll'));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(window.getSelection().anchorNode,text);assert.equal(window.getSelection().anchorOffset,2);assert.ok(text.isConnected);
 }finally{window.getSelection().removeAllRanges();view.destroy();view.element.remove();globalThis.requestAnimationFrame=previousFrame;globalThis.cancelAnimationFrame=previousCancel;}
});
