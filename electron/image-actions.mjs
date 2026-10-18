import path from "node:path";
import { pathToFileURL } from "node:url";
import { copyFile, open, writeFile, realpath, lstat, rm, mkdtemp } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";

const maximum = 20 * 1024 * 1024;
const imageTypes = { "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif", "image/svg+xml": ".svg" };
export function imageName(source) {
  try { return path.basename(decodeURIComponent(new URL(source).pathname)) || "image.png"; }
  catch { return path.basename(decodeURIComponent(source)) || "image.png"; }
}
export async function downloadImage(source) {
  const response = await fetch(source, {signal: AbortSignal.timeout(20000)});
  const extension = imageTypes[response.headers.get("content-type")?.split(";")[0]];
  if (!response.ok || !extension || Number(response.headers.get("content-length")) > maximum) throw new Error("远程图片读取失败或超过 20 MB。");
  const parts = []; let size = 0;
  for await (const part of response.body) { size += part.length; if (size > maximum) { throw new Error("远程图片超过 20 MB。"); } parts.push(part); }
  if (!size) throw new Error("远程图片为空。");
  return {bytes:Buffer.concat(parts),extension,mime:response.headers.get("content-type").split(";")[0]};
}
function reference(target, record, options) {
  if (!record.path) return pathToFileURL(target).href;
  let relative = path.relative(path.dirname(record.path),target);
  if (path.isAbsolute(relative)) return pathToFileURL(target).href; // Another Windows drive.
  relative = relative.split(path.sep).join("/");
  if (options.imagePrefix && !relative.startsWith(".")) relative = "./" + relative;
  return options.imageEscape === false ? relative : relative.replace(/[ ()#?%]/g,c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
// Originals are removed only after every destination has been written. A failed
// copy rolls back this operation's new files, never an existing destination.
export async function imageAction({store,id,sources,action,options={},destination,directory,trash,notice=()=>{}}) {
  const record = store.require(id);
  if (!Array.isArray(sources) || !sources.length || sources.length > 200 || sources.some(source=>typeof source !== "string") || !["copy","move","delete","upload"].includes(action)) throw new Error("图片操作无效。");
  const items = [];
  for (const source of new Set(sources)) {
    const remote = /^https?:\/\//i.test(source);
    if (remote && action === "delete") throw new Error("远程图片只能移除文档引用，不能删除服务器文件。");
    const local = remote ? null : await store.asset(id,source);
    if (local && !/\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(local)) throw new Error("请选择图片文件。");
    items.push({source,local});
  }
  const mapping = {};
  if (action === "delete") {
    let failed = 0;
    for (const local of new Set(items.map(item=>item.local))) {
      const aliases = items.filter(item=>item.local === local);
      try { await trash(local); for (const item of aliases) mapping[item.source] = ""; } catch { failed += aliases.length; }
    }
    if (failed === items.length) throw new Error("图片未能移到废纸篓，文档引用已保留。");
    if (failed) notice("部分图片未能移到废纸篓，对应引用已保留。");
    return mapping;
  }
  if (action === "upload") {
    const endpoint = options.imageUploader || "http://127.0.0.1:36677/upload";
    if (!/^https?:\/\//i.test(endpoint)) throw new Error("PicGo Server 地址无效。");
    const temporary = await mkdtemp(path.join(os.tmpdir(),"open-typora-upload-"));
    try {
      for (const [index,item] of items.entries()) {
        let file = item.local;
        if (!file) { const {bytes,extension} = await downloadImage(item.source); file = path.join(temporary,index+extension); await writeFile(file,bytes); }
        const response = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({list:[file]}),signal:AbortSignal.timeout(30000)});
        const result = await response.json();
        if (!response.ok || !result.success || !/^https?:\/\//i.test(result.result?.[0] || "")) throw new Error("PicGo 未返回有效图片地址。请确认图床已配置。");
        mapping[item.source] = result.result[0];
      }
      return mapping;
    } finally { await rm(temporary,{recursive:true,force:true}); }
  }
  if ((!destination && !directory) || (destination && items.length !== 1)) throw new Error("目标位置无效。");
  const targets = new Set(), created = [];
  for (const item of items) {
    const candidate = destination || path.join(directory,item.local ? path.basename(item.local) : imageName(item.source));
    const parent = await realpath(path.dirname(candidate));
    item.target = path.join(parent,path.basename(candidate));
    const key = process.platform === "win32" ? item.target.toLowerCase() : item.target;
    if (targets.has(key)) throw new Error("多张图片的目标文件名相同，请分别重命名后再操作。");
    targets.add(key);
    if (item.local === item.target) { mapping[item.source] = item.source; continue; }
    try { await lstat(item.target); throw new Error("目标图片已存在，未覆盖。"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  try {
    for (const item of items) {
      if (item.local === item.target) continue;
      if (item.local) await copyFile(item.local,item.target,constants.COPYFILE_EXCL);
      else {
        const {bytes} = await downloadImage(item.source), handle = await open(item.target,"wx");
        created.push(item.target);
        try { await handle.writeFile(bytes); } finally { await handle.close(); }
      }
      if (item.local) created.push(item.target);
      mapping[item.source] = reference(item.target,record,options);
    }
  } catch (error) { await Promise.all(created.map(file=>rm(file,{force:true}))); throw error; }
  if (action === "move") {
    let failed = 0;
    for (const file of new Set(items.filter(item=>item.local && item.local !== item.target).map(item=>item.local))) try { await trash(file); } catch { failed++; }
    if (failed) notice("图片已复制到目标位置，但部分原图片未能移到废纸篓。");
  }
  return mapping;
}
