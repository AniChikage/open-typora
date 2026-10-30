import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, stat, symlink, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DocumentStore, digest } from '../build/runtime/electron/store.mjs';
import { VersionStore } from '../build/runtime/electron/versions.mjs';
async function fixture() {
  const directory=await realpath(await mkdtemp(path.join(os.tmpdir(),'open-typora-versions-'))), file=path.join(directory,'中文.md');
  const text='# 版本\r\n\r\n你好，中国 👨‍👩‍👧‍👦  \r\n'; await writeFile(file,text); const store=new DocumentStore(path.join(directory,'data')); const record=await store.open(file); return {directory,file,text,store,record};
}
test('saved history survives a new host instance and reads exact Unicode/CRLF without touching disk', async()=>{
  const {directory,file,text,store,record}=await fixture();
  try {
    await store.versions.capture(record,text+'未保存','manual'); await store.save(record.id,text+'保存');
    const reopened=new DocumentStore(store.dataDir), current=await reopened.open(file), history=(await reopened.versions.list(current)).versions;
    assert.ok(history.length>=3); assert.equal((await reopened.versions.read(current,history.find(item=>item.reason==='manual')!.id)).content,text+'未保存');
    assert.equal(await readFile(file,'utf8'),text+'保存');
    const folder=path.join(store.dataDir,'versions-v1',digest('file:'+file)); if (process.platform !== 'win32') assert.equal((await stat(path.join(folder,'index.json'))).mode & 0o777,0o600);
    await assert.rejects(reopened.versions.read(current,'../../outside'));
    const item=history[0]; await writeFile(path.join(folder,item.hash+'.txt'),'corrupt'); await assert.rejects(reopened.versions.read(current,item.id),/校验/); assert.equal(await readFile(file,'utf8'),text+'保存');
  } finally { await rm(directory,{recursive:true,force:true}); }
});
test('draft save-as and folder rename retain previous snapshots, with isolated per-file history',async()=>{
  const {directory,file,text,store}=await fixture();
  try {
    const draft=store.registerDraft({id:'draft-one',name:'draft.md',content:'draft A',savedContent:'',path:null,lineEnding:'\n'});
    await store.versions.capture(draft,'draft A','manual'); const target=path.join(directory,'saved.md'),saved=await store.save(draft.id,'draft B',target);
    assert.ok((await store.versions.list(saved)).versions.some(item=>item.hash===digest('draft A')));
    const old=path.join(directory,'folder'),next=path.join(directory,'renamed'); await mkdir(old); const inFolder=path.join(old,'note.md'); await writeFile(inFolder,text); const record=await store.open(inFolder); await store.versions.capture(record,'folder snapshot','manual');
    await store.versions.remap(old,next); const moved={...record,path:path.join(next,'note.md')}; assert.ok((await store.versions.list(moved)).versions.some(item=>item.hash===digest('folder snapshot')));
    const other=await store.open(file); assert.equal((await store.versions.list(other)).versions.some(item=>item.hash===digest('folder snapshot')),false);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('retention and concurrent captures keep the latest 50 complete versions; corrupt unrelated history stays intact',async()=>{
 const {directory,store,record}=await fixture();try{
  await Promise.all(Array.from({length:60},(_,index)=>store.versions.capture(record,'版本 '+index,'manual')));
  let history=(await store.versions.list(record)).versions; assert.equal(history.length,50);assert.equal((await store.versions.read(record,history[0].id)).content,'版本 59');
  const bad=path.join(store.dataDir,'versions-v1','a'.repeat(64));await mkdir(bad,{recursive:true});await writeFile(path.join(bad,'index.json'),'broken');
  await store.versions.capture(record,'survives unrelated corruption','manual');assert.equal(await readFile(path.join(bad,'index.json'),'utf8'),'broken');
  const folder=path.join(store.dataDir,'versions-v1',digest('file:'+record.path));await writeFile(path.join(folder,'index.json'),'broken');await assert.rejects(store.versions.capture(record,'new','manual'),/索引/);assert.equal(await readFile(path.join(folder,'index.json'),'utf8'),'broken');
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('context reads require current grants and exclude symlinks, oversized files and session pollution',async()=>{
 const {directory,store,record}=await fixture();try{
  const outside=path.join(directory,'outside.md'),root=path.join(directory,'folder');await mkdir(root);await writeFile(outside,'private');await writeFile(path.join(root,'note.md'),'source');await writeFile(path.join(root,'large.md'),'x'.repeat(2*1024*1024+1));
  const scan=await store.scan(root), token=scan.files.find(item=>item.name==='note.md')!.token, before=store.records.size;
  assert.equal((await store.readContext(token)).content,'source');assert.equal(store.records.size,before);await assert.rejects(store.readContext(outside));await assert.rejects(store.readContext(scan.files.find(item=>item.name==='large.md')!.token),/2 MiB/);
  await rm(path.join(root,'note.md'));if(process.platform!=='win32'){await symlink(outside,path.join(root,'note.md'));await assert.rejects(store.readContext(token),/授权/);}
  const result=await store.readContext('document:'+record.id);assert.equal(result.name,record.name);
  await store.scan(directory);await assert.rejects(store.readContext(token),/授权/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
