import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import MarkdownIt from 'markdown-it';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DocumentStore,encodeText} from '../build/runtime/electron/store.mjs';
import {contiguousPositions,positionIndex,shiftPositions} from '../src/editor/sourcePositions.ts';
import {TableIndex,RowHeights} from '../src/editor/tableData.ts';
const dom=new JSDOM('<!doctype html><body></body>');
for(const name of ['window','document','DOMParser','Node'])Reflect.set(globalThis,name,Reflect.get(dom.window,name));
const {MarkdownDocument}=await import('../src/editor/model.ts');
const {codeBody}=await import('../src/editor/richRender.ts');
const {parseBlocks}=await import('../src/editor/markdown.ts');

test('32 MiB Markdown opens, saves, recovers and encodes beyond the previous cap',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'open-typora-unbounded-')),file=path.join(directory,'large.md');
 const content='# Large\n'+'x'.repeat(32*1024*1024)+'\n';await writeFile(file,content);
 const store=new DocumentStore(path.join(directory,'profile')),record=await store.open(file);
 assert.equal(record.content,content);await store.save(record.id,content+'保存');
 assert.equal(await readFile(file,'utf8'),content+'保存');
 await store.persist({documents:[{...record,content:content+'草稿'}],activeId:record.id});
 const restored=await new DocumentStore(store.dataDir).restore();assert.equal(restored!.documents[0].content,content+'草稿');assert.equal(restored!.documents[0].savedContent,content+'保存');
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
   const fields=(nodes: import("../src/editor/model.ts").DocumentNode[])=>nodes.filter(node=>node.kind!=='empty').map(({kind,from,to,line,source})=>({kind,from,to,line,source}));
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
  assert.ok(view.element.textContent.includes('TAIL'));assert.ok(view.element.querySelectorAll<HTMLElement>('td').length<150);
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
  const text=(view.element.querySelector<HTMLElement>('tr[data-source-row="500"] td span')!.firstChild as Text);
  window.getSelection()!.setBaseAndExtent(text,2,text,2);
  view.element.scrollTop-=240;view.element.dispatchEvent(new dom.window.Event('scroll'));
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(window.getSelection()!.anchorNode,text);assert.equal(window.getSelection()!.anchorOffset,2);assert.ok(text.isConnected);
 }finally{window.getSelection()!.removeAllRanges();view.destroy();view.element.remove();globalThis.requestAnimationFrame=previousFrame;globalThis.cancelAnimationFrame=previousCancel;}
});


test('incremental table offsets agree with a fresh index after arbitrary Unicode and line edits',()=>{
 let source='| Key | Value |\n|---|---|\n'+Array.from({length:500},(_,i)=>`| row-${i} | 中文 👩🏽‍💻 ${i} |`).join('\n')+'\n';
 let index=new TableIndex(source),seed=711;
 const random=(limit: number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%limit;};
 const values=['中国','\n','| A | B |\n','', '👨‍👩‍👧‍👦', '\n\n'];
 for(let step=0;step<300;step++){
  const from=random(source.length+1),to=Math.min(source.length,from+random(35)),insert=values[random(values.length)];
  source=source.slice(0,from)+insert+source.slice(to);
  index=new TableIndex(source,index,{from,to,insert});
  const full=new TableIndex(source);
  assert.deepEqual(index.offsets,full.offsets,`line offsets after edit ${step}`);
  assert.equal(index.width,full.width);assert.deepEqual(index.align,full.align);
  const row=random(index.length);assert.equal(index.line(row),full.line(row));assert.deepEqual(index.cells(row),full.cells(row));
 }
});

test('large fence newline and punctuation edits preserve block boundaries and heading lines',()=>{
 const source='# Before\n\n```js\n'+('const a = 1;\n').repeat(30000)+'```x\nremaining code\n```\n\n# After\n';
 const fields=(nodes: import("../src/editor/model.ts").DocumentNode[])=>nodes.filter(n=>n.kind!=='empty').map(({kind,from,to,line,source})=>({kind,from,to,line,source}));
 const cases=[
  [source.indexOf('const a',source.length/2)+5,0,'\nconst extra = `value`;\n'],
  [source.indexOf('```x')+3,1,''],
  [source.indexOf('remaining code'),0,'```\n'],
  [source.lastIndexOf('\n```'),1,''],
 ] as const;
 for(const [at,remove,insert] of cases){
  const doc=new MarkdownDocument(source);doc.enableRichParsing();doc.replace(at,at+remove,insert);
  const full=new MarkdownDocument(doc.text);full.enableRichParsing();
  assert.deepEqual(fields(doc.nodes),fields(full.nodes));assert.deepEqual(doc.environment.headings,full.environment.headings);assert.equal(doc.serialize(),doc.text);
  assert.ok(doc.undo());assert.equal(doc.text,source);assert.ok(doc.redo());assert.deepEqual(fields(doc.nodes),fields(full.nodes));
 }
 const doc=new MarkdownDocument(source);doc.enableRichParsing();const at=source.indexOf('const a',source.length/2)+5;
 doc.replace(at,at,'\n');assert.equal(doc.nodes.find(n=>n.kind==='fence')!.edit?.insert,'\n');
});

test('local table row insertion, movement and deletion agree with full parsing and undo',()=>{
 const source='| Key | Value |\n|---|---|\n'+Array.from({length:16000},(_,i)=>`| row-${i} | stable value ${i} |`).join('\n')+'\n\n# After\n';
 const doc=new MarkdownDocument(source);doc.enableRichParsing();const index=new TableIndex(doc.nodes[0].source),row=8000;
 for(const [from,to,insert] of [
  [index.offsets[row],index.offsets[row],'| 新行 | 中文 |\n'],
  [index.offsets[row],index.offsets[row+1],''],
  [index.offsets[row],index.end(row+1),index.line(row+1)+'\n'+index.line(row)],
  [index.source.length,index.source.length,'\n| 新尾行 | 最后 |'],
 ] as const){
  doc.closeGroup();doc.replace(from,to,insert);assert.ok(doc.nodes[0].edit);
  const full=new MarkdownDocument(doc.text);full.enableRichParsing();
  const fields=(nodes: import("../src/editor/model.ts").DocumentNode[])=>nodes.filter(n=>n.kind!=='empty').map(({kind,from,to,line,source})=>({kind,from,to,line,source}));
  assert.deepEqual(fields(doc.nodes),fields(full.nodes));assert.deepEqual(doc.environment.headings,full.environment.headings);
  assert.ok(doc.undo());assert.equal(doc.text,source);
 }
});

test('retained table rows survive cell edits with shifted source maps and no stale cells',async()=>{
 const {LargeTableView}=await import('../src/editor/LargeTableView.ts');
 const previousFrame=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=()=>71;globalThis.cancelAnimationFrame=()=>{};
 const source='| Key | Value |\n|---|---|\n'+Array.from({length:16000},(_,i)=>`| row-${i} | stable value ${i} |`).join('\n');
 const model=new MarkdownDocument(source);model.enableRichParsing();
 const view=new LargeTableView(model.nodes[0],'fixture',model.environment,()=>{},()=>false);
 try{
  Object.defineProperties(view.element,{clientHeight:{value:480},scrollHeight:{value:640000}});document.body.append(view.element);
  const at=source.indexOf('stable value 8000')+7;model.selection={anchor:at,head:at};view.update(model.nodes[0],model.environment,model.selection,false);
  const before=view.element.querySelector<HTMLElement>('tr[data-source-row="8001"]')!,after=view.element.querySelector<HTMLElement>('tr[data-source-row="8003"]')!;
  model.replace(at,at,'中国');view.update(model.nodes[0],model.environment,model.selection,false);
  assert.equal(view.element.querySelector<HTMLElement>('tr[data-source-row="8001"]')!,before);assert.equal(view.element.querySelector<HTMLElement>('tr[data-source-row="8003"]')!,after);
  assert.ok(view.element.querySelector<HTMLElement>('tr[data-source-row="8002"]')!.textContent.includes('中国'));
  const leaf=[...view.leaves.values()].find(leaf=>leaf.raw==='stable value 8001')!;
  assert.equal(leaf.positions[0],model.text.indexOf('stable value 8001'));
  model.undo();view.update(model.nodes[0],model.environment,model.selection,false);
  assert.ok(!view.element.textContent.includes('中国'));assert.equal([...view.leaves.values()].find(leaf=>leaf.raw==='stable value 8001')!.positions[0],source.indexOf('stable value 8001'));
 }finally{view.destroy();view.element.remove();globalThis.requestAnimationFrame=previousFrame;globalThis.cancelAnimationFrame=previousCancel;}
});

test('repeated compact position shifts remain flat and retain UTF-16 endpoints',()=>{
 let positions=contiguousPositions(25,40*1024*1024);
 for(let i=0;i<25000;i++)positions=shiftPositions(positions,i%2?2:-1);
 assert.equal(positions[0],12525);assert.equal(positions[positions.length-1],12525+40*1024*1024);assert.equal(Object.keys(positions).length,0);
});
