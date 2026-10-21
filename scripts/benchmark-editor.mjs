import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true,url:'https://editor.test/'});
for(const key of ['window','document','Node','NodeFilter','Text','HTMLElement','HTMLInputElement','HTMLTableCellElement','HTMLTableRowElement','MutationObserver','DOMParser','getComputedStyle'])globalThis[key]=dom.window[key];
globalThis.requestAnimationFrame=dom.window.requestAnimationFrame.bind(dom.window);globalThis.cancelAnimationFrame=dom.window.cancelAnimationFrame.bind(dom.window);
const {MarkdownDocument}=await import('../src/editor/model.ts');
const {RichEditor}=await import('../src/editor/RichEditor.ts');
const text=Array.from({length:1800},(_,i)=>`Paragraph ${i}. 中文输入和 **Markdown** editing performance.`).join('\n\n');
const doc=new MarkdownDocument(text),modelTimes=[];
for(let i=0;i<25;i++){const at=Math.floor(doc.text.length/2),start=performance.now();doc.replace(at,at,'a','typing');modelTimes.push(performance.now()-start);}
const holder=document.createElement('div'),root=document.createElement('div');holder.append(root);document.body.append(holder);
const richDoc=new MarkdownDocument(text.split('\n\n').slice(0,350).join('\n\n'));
const editor=new RichEditor(root,richDoc,'perf',{change(){},cursor(){},image(){},link(){},compositionFinished(){}}),renderTimes=[];
for(let i=0;i<8;i++){const at=Math.floor(richDoc.text.length/2);richDoc.replace(at,at,'a','typing');const start=performance.now();editor.render(false);renderTimes.push(performance.now()-start);}
const stats=values=>{const a=[...values].sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))]};};
const result={paragraphs:1800,characters:text.length,modelMs:stats(modelTimes),renderParagraphs:350,renderMs:stats(renderTimes)};
console.log(JSON.stringify(result,null,2));editor.destroy();dom.window.close();
