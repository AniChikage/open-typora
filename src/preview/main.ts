import '@fontsource/open-sans/400.css';
import '@fontsource/open-sans/700.css';
import './preview.css';
import { renderMarkdown, setMarkdownOptions } from '../editor/markdown';
import { renderMath } from '../editor/math';
import { renderDiagrams } from '../editor/diagrams';
setMarkdownOptions({ highlight:true,subscript:true,superscript:true,emoji:true,inlineMath:true, ...{remoteImages:false} });
const root=document.getElementById('markdown-preview')!,status=document.getElementById('preview-status')!;
let revision=0;
export async function showPreview(value: {source:string;truncated?:boolean;name?:string;base?:string}) {
  const current=++revision;
  root.dataset.ready='false';
  root.innerHTML=renderMarkdown(value.source.slice(0,1024*1024), 'preview');
  for(const image of root.querySelectorAll<HTMLImageElement>('img')) {
    const address=image.getAttribute('src')||'';
    if(!address.startsWith('open-typora-asset:'))continue;
    let relative='';try{relative=decodeURIComponent(new URL(address).pathname.split('/').slice(2).join('/'));}catch{/* invalid image path remains blocked */}
    if(value.base==='https://document.opentypora.local/'&&relative&&!/^[\\/]|^[a-z][a-z\d+.-]*:/i.test(relative)&&!relative.replaceAll('\\','/').split('/').includes('..'))image.src=new URL(relative.replaceAll('\\','/'),value.base).href;
    else image.replaceWith(document.createTextNode((image.alt||'本地图片')+'（图片路径不可用于系统预览）'));
  }
  root.querySelectorAll('iframe,video,audio,source').forEach(element=>element.remove());
  root.querySelectorAll('[contenteditable]').forEach(element=>element.removeAttribute('contenteditable'));
  root.querySelectorAll('input').forEach(element=>(element as HTMLInputElement).disabled=true);
  status.textContent=value.truncated||value.source.length>1024*1024?'大文件仅预览前 1 MB，完整内容请在编辑器中打开。':'';
  status.hidden=!status.textContent;document.title=value.name?value.name+' — Markdown preview':'Open Typora Markdown preview';
  await Promise.all([renderMath(root),renderDiagrams(root),document.fonts.ready]);
  if(current===revision)root.dataset.ready='true';
}
document.addEventListener('click',event=>{if((event.target as Element).closest('a'))event.preventDefault();});
type PreviewWebView={addEventListener(name:'message',listener:(event:MessageEvent)=>void):void;postMessage(value:string):void};
const webview=(window as unknown as {chrome?:{webview?:PreviewWebView}}).chrome?.webview;
webview?.addEventListener('message',event=>{if(event.data&&typeof event.data.source==='string')void showPreview(event.data).catch(()=>{status.hidden=false;status.textContent='Markdown preview failed.';});});
webview?.postMessage('ready');
