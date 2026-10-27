async function runWebKitClipboardTests() {
  const desktop=window.desktop! as import("../shared/contracts.js").DesktopBridge & {
    testSpreadsheetClipboard(): Promise<import("../shared/contracts.js").BridgeResponse<null>>;
    testRecovery(): Promise<import("../shared/contracts.js").BridgeResponse<import("../shared/contracts.js").Recovery>>;
  };
  const passed:string[]=[],errors:string[]=[];
  window.addEventListener('error',event=>errors.push(event.message));
  window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
  const wait=async(test:()=>boolean)=>{const end=Date.now()+10000;while(Date.now()<end){if(test())return;await new Promise(resolve=>setTimeout(resolve,40));}throw Error('Native clipboard condition timed out');};
  const check=(condition:boolean,label:string)=>{if(!condition)throw Error(label);passed.push(label);};
  const root=()=>document.querySelector<HTMLElement>('.document-editor[data-active="true"] .rich-document')!;
  const source=()=>[...document.querySelectorAll('.document-editor[data-active="true"] .source-surface .cm-line')].map(node=>node.textContent).join('\n');
  const mode=async(value:boolean)=>{const button=document.querySelector<HTMLButtonElement>('.source-toggle')!;if((button.getAttribute('aria-pressed')==='true')!==value)button.click();await wait(()=>value?!!document.querySelector('.document-editor[data-active="true"] .source-surface:not([hidden]) .cm-content'):!!document.querySelector('.document-editor[data-active="true"] .rich-scroller:not([hidden])'));await new Promise(resolve=>setTimeout(resolve,80));};
  const expected='| 项目 | 数量 |\n| --- | --- |\n| 苹果 | 2 |\n| 香蕉 |  |';
  try {
    await wait(()=>!!root()?.querySelector('h1'));
    const restored=await desktop.restore();if(!restored.ok)throw Error(restored.error);if(!restored.value)throw Error('Native clipboard fixture session is missing');const original=restored.value.documents[0].content;
    const expectedSource=original+(original.endsWith('\n\n')?'':original.endsWith('\n')?'\n':'\n\n')+expected;
    await mode(true);const editor=document.querySelector<HTMLElement>('.document-editor[data-active="true"] .source-surface .cm-content')!;editor.focus();await new Promise(resolve=>setTimeout(resolve,80));
    await desktop.testSpreadsheetClipboard();
    await desktop.clipboardAction('paste');await wait(()=>source()===expectedSource);
    check(true,'native trusted source paste prefers the table over its PNG alternative');
    window.__openTypora.command({action:'undo'});await wait(()=>source()===original);window.__openTypora.command({action:'redo'});await wait(()=>source()===expectedSource);
    check(true,'native source spreadsheet paste is one exact undo/redo transaction');
    window.__openTypora.command({action:'save'});let saved=false;const deadline=Date.now()+10000;while(Date.now()<deadline){const recovery=await desktop.testRecovery();if(recovery.ok){const record=recovery.value.documents.find(record=>record.id==='webkit-fixture');if(record?.content===expectedSource&&record.savedContent===expectedSource){saved=true;break;}}await new Promise(resolve=>setTimeout(resolve,40));}
    check(saved,'native source paste persists the exact Markdown to recovery and saved content');
    const draft={id:crypto.randomUUID(),name:'Clipboard-rich.md',path:null,content:'',savedContent:'',diskHash:null,lineEnding:'\n'};
    await desktop.registerDraft(draft);window.__openTypora.command({action:'opened',document:draft});await wait(()=>document.querySelector('.document-title')?.textContent===draft.name);await mode(false);
    root().focus();getSelection()!.selectAllChildren(root());getSelection()!.collapseToStart();await desktop.testSpreadsheetClipboard();await desktop.clipboardAction('paste');await wait(()=>root().querySelectorAll('table').length===1);
    check(!root().querySelector('img')&&root().querySelectorAll('tbody tr').length===2,'native trusted rich paste chooses table contents over the PNG alternative');
    await mode(true);check(source()===expected,'native rich clipboard serializes to exact GFM including the empty cell');await mode(false);window.__openTypora.command({action:'undo'});await wait(()=>root().querySelectorAll('table').length===0);window.__openTypora.command({action:'redo'});await wait(()=>root().querySelectorAll('table').length===1);
    check(errors.length===0,'native rich paste undoes/redoes once without runtime errors');
    return {clipboardOnly:true,passed,errors,source:expectedSource};
  }catch(error){return {clipboardOnly:true,passed,errors,error:String(error),source:source()};}
}
