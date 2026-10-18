import { readFile, readdir, mkdir, realpath, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { atomicWrite } from "./store.mjs";
import { pluginModule, pluginPackage } from "../shared/plugin-module.mjs";
export async function plugins(directory) {
  const root = path.join(directory, "plugins"); await mkdir(root, { recursive: true });
  if (path.dirname(await realpath(root)) !== await realpath(directory)) throw new Error("插件目录无效。");
  const records = [];
  for (const name of (await readdir(root)).sort()) {
    if (!/^local-[a-f0-9]{64}\.json$/.test(name)) continue;
    try {
      if (path.dirname(await realpath(path.join(root, name))) !== await realpath(root)) continue;
      const item = JSON.parse(await readFile(path.join(root, name), "utf8")), file = path.join(root, item.id + ".mjs");
      if (name !== item.id + ".json" || typeof item.name !== "string" || path.dirname(await realpath(file)) !== await realpath(root)) continue;
      records.push({ id: item.id, name: item.name.slice(0, 96), url: `opentypora://app/_plugins/${item.id}.mjs` });
    } catch { /* An interrupted or invalid installation is not executable. */ }
  }
  return records;
}
export async function installPlugin(file, directory) {
  if ((await lstat(file)).isDirectory()) return installPackage(file,directory);
  if (!/\.(?:js|cjs)$/i.test(file)) throw new Error("请选择 JavaScript 插件。");
  const bytes = await readFile(file); if (bytes.length > 1_000_000) throw new Error("插件必须小于 1 MB。");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes), id = "local-" + createHash("sha256").update(bytes).digest("hex"), name = path.basename(file, path.extname(file)).slice(0, 96);
  const root = path.join(directory, "plugins"); await mkdir(root, { recursive: true });
  const canonical = await realpath(root), base = await realpath(directory);
  if (path.dirname(canonical) !== base) throw new Error("插件目录无效。");
  await atomicWrite(path.join(root, id + ".mjs"), pluginModule(source));
  await atomicWrite(path.join(root, id + ".json"), JSON.stringify({ id, name }));
  return { id, name, url: `opentypora://app/_plugins/${id}.mjs` };
}
async function installPackage(folder,directory) {
  const base=await realpath(folder), files={}; let total=0;
  async function collect(current,depth=0) {
    if (depth>8) throw new Error('插件文件夹最多支持 8 层。');
    for (const item of (await readdir(current,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
      if (item.name.startsWith('.') || item.name==='node_modules') continue;
      const file=path.join(current,item.name);
      if (item.isSymbolicLink()) throw new Error('插件文件夹不能包含符号链接。');
      if (item.isDirectory()) { await collect(file,depth+1); continue; }
      if (!item.isFile() || !/\.(js|cjs|json|css)$/i.test(item.name)) continue;
      const bytes=await readFile(file);total+=bytes.length;
      if (bytes.length>1_000_000 || total>4_000_000 || Object.keys(files).length>=64) throw new Error('插件文件夹最多 64 个文件、共 4 MB，单文件不超过 1 MB。');
      const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      if (source.includes('\0')) throw new Error('插件必须使用无 NUL 的 UTF-8 文件。');
      files[path.relative(base,file).split(path.sep).join('/')]=source;
    }
  }
  await collect(base);
  const metadata=files['package.json'] ? JSON.parse(files['package.json']) : {};
  const requested=metadata.main || (files['index.js']!==undefined?'index.js':'index.cjs');
  if (typeof requested!=='string' || requested.includes('\\') || path.posix.isAbsolute(requested) || requested.split('/').includes('..')) throw new Error('插件入口必须位于所选文件夹内。');
  const entry=path.posix.normalize(requested);
  if (!/\.(js|cjs)$/i.test(entry) || files[entry]===undefined) throw new Error('插件文件夹需要 index.js、index.cjs 或 package.json 中的 main 入口。');
  const digest=Object.keys(files).sort().map(name=>[name,createHash('sha256').update(files[name]).digest('hex')]);
  const id='local-'+createHash('sha256').update(JSON.stringify(digest)).digest('hex');
  const name=String(metadata.name || path.basename(folder)).slice(0,96), module=pluginPackage(entry,files);
  const root=path.join(directory,'plugins');await mkdir(root,{recursive:true});
  if (path.dirname(await realpath(root))!==await realpath(directory)) throw new Error('插件目录无效。');
  await atomicWrite(path.join(root,id+'.mjs'),module);
  await atomicWrite(path.join(root,id+'.json'),JSON.stringify({id,name}));
  return {id,name,url:`opentypora://app/_plugins/${id}.mjs`};
}
