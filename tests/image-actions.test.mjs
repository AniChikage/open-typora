import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,rename,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {imageAction} from '../electron/image-actions.mjs';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=','base64');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(),'open-typora-images-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const {DocumentStore} = await import('../electron/store.mjs');
  const store = new DocumentStore(path.join(root,'session'));
  const file = path.join(root,'中文.md'); await writeFile(file,'# Images');
  const record = await store.open(file), directory = path.join(root,'目标 images'); await mkdir(directory);
  await writeFile(path.join(root,'one.png'),png); await writeFile(path.join(root,'two.png'),png);
  let trashed = 0; const notices = [];
  const trash = async file => { await rename(file,file+'.trash'); trashed++; };
  const run = args => imageAction({store,id:record.id,trash,notice:message=>notices.push(message),...args});
  return {root,store,record,directory,run,notices,trashed:()=>trashed};
}
test('batch copy/move honors relative escaped paths, never overwrites and keeps originals until every copy succeeds',async t=>{
  const f = await fixture(t), args = {sources:['one.png','two.png'],action:'move',directory:f.directory,options:{imagePrefix:true}};
  await writeFile(path.join(f.directory,'two.png'),'existing');
  await assert.rejects(f.run(args),/已存在/);
  assert.equal(f.trashed(),0); await assert.rejects(stat(path.join(f.directory,'one.png')),{code:'ENOENT'});
  assert.equal(await readFile(path.join(f.directory,'two.png'),'utf8'),'existing');
  const second = path.join(f.root,'new images'); await mkdir(second);
  const mapping = await f.run({...args,directory:second});
  assert.equal(mapping['one.png'],'./new%20images/one.png'); assert.equal(f.trashed(),2);
  assert.deepEqual(await readFile(path.join(second,'one.png')),png);
});
test('failed remote batch rolls back new copies; successful download preserves byte content',async t=>{
  const f = await fixture(t);
  const server = createServer((request,response)=>{if(request.url === '/image.png') {response.writeHead(200,{'content-type':'image/png'});response.end(png);}else {response.writeHead(500);response.end('failed');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); t.after(()=>server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  await assert.rejects(f.run({sources:['one.png',url+'/failed.png'],action:'move',directory:f.directory}),/远程图片/);
  assert.equal(f.trashed(),0); await assert.rejects(stat(path.join(f.directory,'one.png')),{code:'ENOENT'});
  await f.run({sources:[url+'/image.png'],action:'copy',destination:path.join(f.directory,'download.png')});
  assert.deepEqual(await readFile(path.join(f.directory,'download.png')),png);
});
test('partial trash failure reports success only for files actually removed, while failed moves keep safe destination references',async t=>{
  const f = await fixture(t);
  const trash = async file=>{if(file.endsWith('two.png')) throw Error('denied'); await rename(file,file+'.trash');};
  const mapping = await f.run({sources:['one.png','two.png'],action:'delete',trash});
  assert.deepEqual(mapping,{'one.png':''}); assert.equal(f.notices.length,1);
  const moved = await f.run({sources:['two.png'],action:'move',destination:path.join(f.directory,'moved.png'),trash});
  assert.ok(moved['two.png']); assert.deepEqual(await readFile(path.join(f.root,'two.png')),png);
  assert.deepEqual(await readFile(path.join(f.directory,'moved.png')),png);
});
test('absolute image paths from the system temporary directory accept Windows short directory names',async t=>{
  const f=await fixture(t),absolute=path.join(f.root,'one.png');
  const resolved=await f.store.asset(f.record.id,absolute);
  assert.deepEqual(await readFile(resolved),png);
  const fileURL=(await import('node:url')).pathToFileURL(absolute).href;
  assert.equal(await f.store.asset(f.record.id,fileURL),resolved);
});
