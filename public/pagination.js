// Shared with the native WebKit exporter. This file has no application bridge.
function openTyporaPagination(root, pageHeight) {
  if (!root || !(pageHeight > 0)) throw new Error('Invalid print area');
  const range = document.createRange(); range.selectNodeContents(root);
  const height = Math.ceil(Math.max(1, range.getBoundingClientRect().bottom));
  const keep = [], paragraphs = [], forced = [], tables = [];
  const visible = element => { const r = element.getBoundingClientRect(); return getComputedStyle(element).display !== 'none' && r.bottom >= r.top && r.width > 0; };
  const rects = element => {
    const result = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) {
      const line = document.createRange(); line.selectNodeContents(node);
      for (const rect of line.getClientRects()) if (rect.height > 0 && rect.height < pageHeight) result.push([rect.top, rect.bottom]);
    }
    result.sort((a,b) => a[0]-b[0]);
    const lines = [];
    for (const r of result) { const last = lines.at(-1); if (last && r[0] < last[1] - 1) last[1] = Math.max(last[1],r[1]); else lines.push(r); }
    return lines;
  };
  for (const element of root.querySelectorAll('*')) {
    if (!visible(element)) continue;
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    if (['always','page','left','right'].includes(style.breakBefore) || style.pageBreakBefore === 'always') forced.push(rect.top);
    if (['always','page','left','right'].includes(style.breakAfter) || style.pageBreakAfter === 'always') forced.push(element.nextElementSibling?.getBoundingClientRect().top ?? rect.bottom);
    if (element.matches('p,pre,blockquote,tr,img,svg,figure,video,h1,h2,h3,h4,h5,h6') || ['avoid','avoid-page'].includes(style.breakInside) || style.pageBreakInside === 'avoid') {
      let bottom = rect.bottom;
      if (element.matches('h1,h2,h3,h4,h5,h6') && !['page','always'].includes(style.breakAfter)) {
        const next = element.nextElementSibling;
        if (next && !['page','always'].includes(getComputedStyle(next).breakBefore)) bottom = Math.max(bottom, Math.min(next.getBoundingClientRect().bottom,next.getBoundingClientRect().top+22));
      }
      if (bottom > rect.top && bottom-rect.top < pageHeight && (element.tagName !== 'P' || style.breakInside !== 'auto')) keep.push([rect.top,bottom]);
    }
    if (element.matches('p,pre,li') && !element.querySelector('p,pre,li')) {
      const lines = rects(element); keep.push(...lines);
      paragraphs.push({ lines, orphans:Math.max(1,parseInt(style.orphans)||2), widows:Math.max(1,parseInt(style.widows)||2) });
    }
    if (element.matches('table') && style.getPropertyValue('--repeat-table-headers').trim() !== '0') {
      const header = element.querySelector('thead');
      if (header) { const hr=header.getBoundingClientRect(); if(hr.height>0&&hr.height<pageHeight/2) tables.push({top:rect.top,bottom:rect.bottom,headerTop:hr.top,headerBottom:hr.bottom,headerHeight:hr.height}); }
    }
  }
  forced.sort((a,b)=>a-b);
  const breaks=[0], headers=[];let start=0;
  while(start<height) {
    if(breaks.length>2000) throw new Error('Print output exceeds 2000 pages');
    const table=tables.find(table=>start>table.headerBottom+.5&&start<table.bottom-.5);
    const header=table?{top:table.headerTop,height:table.headerHeight}:{top:-1,height:0};headers.push(header);
    const available=pageHeight-header.height;
    let end=Math.min(height,start+available);
    const explicit=forced.find(at=>at>start+1&&at<end-.1);
    if(explicit!==undefined)end=explicit;
    else for(let iteration=0;iteration<40;iteration++) {
      let next=end;
      for(const [top,bottom] of keep)if(top>start+1&&top<end-.1&&bottom>end+.1)next=Math.min(next,top);
      for(const paragraph of paragraphs) {
        const lines=paragraph.lines;if(!lines.length||lines[0][0]>=end||lines.at(-1)[1]<=end)continue;
        const current=lines.filter(line=>line[0]>=start-.1), before=current.filter(line=>line[1]<=end+.1), after=lines.filter(line=>line[0]>=end-.1);
        if(before.length<paragraph.orphans&&lines[0][0]>start+1)next=Math.min(next,lines[0][0]);
        else if(after.length<paragraph.widows&&lines.length>paragraph.widows) { const at=lines[lines.length-paragraph.widows][0];if(at>start+1)next=Math.min(next,at); }
      }
      if(next>=end-.1)break;end=next;
    }
    if(end<=start+1)end=Math.min(height,start+available);
    breaks.push(end);start=end;
  }
  return {height,breaks,headers};
}
