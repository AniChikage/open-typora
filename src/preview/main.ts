import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/700.css';
import './preview.css';
import { renderMarkdown, setMarkdownOptions } from '../editor/markdown';
import { MarkdownDocument } from '../editor/model';
import { BlockViewport, blockSpacer } from '../editor/blockViewport';
import { renderMath } from '../editor/math';
import { renderDiagrams } from '../editor/diagrams';
setMarkdownOptions({highlight:true,subscript:true,superscript:true,emoji:true,inlineMath:true,...{remoteImages:false}});
const root=document.getElementById('markdown-preview')!,status=document.getElementById('preview-status')!;
let revision=0, frame=0, model:MarkdownDocument|null=null, base='', virtual=false;
let blocks=new Map<string,HTMLElement>();
const viewport=new BlockViewport();
function images(element:HTMLElement) {
  for(const image of element.querySelectorAll<HTMLImageElement>('img')) {
    const address=image.getAttribute('src')||'';
    if(!address.startsWith('open-typora-asset:'))continue;
    let relative='';try{relative=decodeURIComponent(new URL(address).pathname.split('/').slice(2).join('/'));}catch{/* invalid path */}
    if(base==='https://document.opentypora.local/'&&relative&&!/^[\\/]|^[a-z][a-z\d+.-]*:/i.test(relative)) image.src=base+'?path='+encodeURIComponent(relative);
    else image.replaceWith(document.createTextNode((image.alt||'本地图片')+'（缺少文档路径）'));
  }
  element.querySelectorAll('iframe,video,audio,source').forEach(item=>item.remove());
  element.querySelectorAll('[contenteditable]').forEach(item=>item.removeAttribute('contenteditable'));
  element.querySelectorAll('input').forEach(item=>(item as HTMLInputElement).disabled=true);
}
function schedule() { if(frame)return;frame=requestAnimationFrame(()=>{frame=0;void renderWindow();}); }
async function renderWindow() {
  if(!model)return;
  const current=revision;
  if(virtual) {
    viewport.setNodes(model.nodes);
    const indices=viewport.visible(window.scrollY-root.offsetTop,window.innerHeight),desired:HTMLElement[]=[],next=new Map<string,HTMLElement>();let cursor=0;
    for(const index of indices) {
      if(index>cursor)desired.push(blockSpacer(viewport.offset(index)-viewport.offset(cursor)));
      const node=model.nodes[index];let element=blocks.get(node.id);
      if(!element){element=document.createElement('section');element.dataset.cid=node.id;element.innerHTML=renderMarkdown(node.source,'preview',{...model.environment,fragment:true,lineOffset:node.line-1});images(element);}
      desired.push(element);next.set(node.id,element);cursor=index+1;
    }
    if(cursor<model.nodes.length)desired.push(blockSpacer(viewport.offset(model.nodes.length)-viewport.offset(cursor)));
    root.replaceChildren(...desired);blocks=next;
  }
  await Promise.all([renderMath(root),renderDiagrams(root),document.fonts.ready]);
  if(current!==revision)return;
  let changed=false;
  for(const [id,element] of blocks) changed=viewport.measure(id,element.getBoundingClientRect().height)||changed;
  if(changed&&virtual)schedule();
  root.dataset.ready='true';
}
export async function showPreview(value:{source:string;name?:string;base?:string}) {
  revision++;root.dataset.ready='false';blocks.clear();viewport.reset();base=value.base||'';
  model=new MarkdownDocument(value.source);virtual=value.source.length>300_000;root.dataset.virtualized=String(virtual);
  if(virtual)model.enableRichParsing();
  else {root.innerHTML=renderMarkdown(value.source,'preview');images(root);}
  status.hidden=true;status.textContent='';
  document.title=value.name?value.name+' — Markdown preview':'Open Typora Markdown preview';
  window.scrollTo(0,0);await renderWindow();
}
window.addEventListener('scroll',()=>{if(virtual)schedule();},{passive:true});
window.addEventListener('resize',()=>{viewport.reset();if(virtual)schedule();});
root.addEventListener('load',()=>{if(virtual)schedule();},true);
document.addEventListener('click',event=>{if((event.target as Element).closest('a'))event.preventDefault();});
type PreviewWebView={addEventListener(name:'message',listener:(event:MessageEvent)=>void):void;postMessage(value:string):void};
const webview=(window as unknown as {chrome?:{webview?:PreviewWebView}}).chrome?.webview;
webview?.addEventListener('message',event=>{if(event.data&&typeof event.data.source==='string')void showPreview(event.data).catch(()=>{status.hidden=false;status.textContent='Markdown preview failed.';});});
webview?.postMessage('ready');
