import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
const execute=promisify(execFile), id='{726747EB-6A31-4BF2-898F-11620814C1F2}';
export async function previewSettings(enable) {
  if(process.platform!=='win32')return {supported:false,enabled:false,available:false};
  const directory=app.isPackaged?path.join(process.resourcesPath,'markdown-preview'):path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../build/windows-preview');
  const dll=path.join(directory,'MarkdownPreview.dll'),system=path.join(process.env.SystemRoot||'C:\\Windows','System32');
  let available=true;try{await access(dll);}catch{available=false;}
  if(typeof enable==='boolean'){
    if(!available)throw new Error('当前安装缺少 Markdown 预览组件，请重新安装 Windows 版。');
    await execute(path.join(system,'regsvr32.exe'),['/s',...(enable?[]:['/u']),dll],{windowsHide:true,timeout:15000});
  }
  const values=await Promise.all(['.md','.markdown','.mdown'].map(async ext=>{try{const {stdout}=await execute(path.join(system,'reg.exe'),['query',`HKCU\\Software\\Classes\\${ext}\\shellex\\{8895b1c6-b41f-4c1c-a562-0d564250836f}`,'/ve'],{windowsHide:true,timeout:5000});return stdout.includes(id);}catch{return false;}}));
  return {supported:true,available,enabled:values.every(Boolean)};
}
