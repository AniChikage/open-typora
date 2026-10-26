import { BrowserWindow } from 'electron';
function escape(value: unknown) { return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string, string>)[character]); }
function template(value: string, title: string) {
  return '<div style="width:100%;font-size:9px;color:#666;padding:0 36px">' + escape(value).replaceAll('${title}',escape(title)).replaceAll('${pageNo}','<span class="pageNumber"></span>').replaceAll('${totalPages}','<span class="totalPages"></span>').replaceAll('${date}',escape(new Date().toLocaleDateString())) + '</div>';
}
export async function renderPdf(html: string, options: { margin?: number; paper?: string; header?: string; footer?: string; title?: string } = {}) {
  if(typeof html!=='string'||Buffer.byteLength(html)>100*1024*1024)throw new Error('导出内容过大。');
  const view = new BrowserWindow({show:false,width:900,height:700,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  const guarded=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\' data:; font-src data:; img-src data:; media-src data:">');
  try {
    await view.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(guarded));
    await view.webContents.executeJavaScript('Promise.all([document.fonts.ready,...[...document.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.onload=image.onerror=resolve;setTimeout(resolve,5000)}))])');
    const margin=Math.max(18,Math.min(100,Number(options.margin)||36))/72;
    return await view.webContents.printToPDF({printBackground:true,pageSize:options.paper==='letter'?'Letter':'A4',preferCSSPageSize:true,margins:{top:margin,bottom:margin,left:margin,right:margin},displayHeaderFooter:!!(options.header||options.footer),headerTemplate:template(options.header||'',options.title||''),footerTemplate:template(options.footer||'',options.title||'')});
  } finally {view.destroy();}
}
