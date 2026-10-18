import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadImage } from "./image-actions.mjs";
export async function pluginResource(address, profile) {
  const url = new URL(address);
  if (url.protocol !== "opentypora:" || url.host !== "app") throw new Error("资源来源无效。");
  const pathname = decodeURIComponent(url.pathname);
  if (!/^\/_plugins\/local-[a-f0-9]{64}\.mjs$/.test(pathname)) throw new Error("插件资源路径无效。");
  const root = await realpath(path.join(profile, "plugins")), file = await realpath(path.join(root, path.basename(pathname)));
  if (path.dirname(root) !== await realpath(profile) || path.dirname(file) !== root) throw new Error("资源路径无效。");
  const bytes = await readFile(file); if (bytes.length > 1_010_000) throw new Error("资源过大。");
  return { bytes, mime: "application/javascript" };
}

export async function exportResource(address, store, bundle) {
  const url = new URL(address);
  if (["http:","https:"].includes(url.protocol)) {
    const {bytes,mime} = await downloadImage(address); return {base64:bytes.toString("base64"),mime};
  }
  let file;
  if (url.protocol === "open-typora-asset:" && url.host === "local") {
    const [id,...source] = url.pathname.slice(1).split("/");
    file = await store.asset(decodeURIComponent(id),decodeURIComponent(source.join("/")));
  } else if (url.protocol === "file:") {
    const root = await realpath(bundle), target = await realpath(fileURLToPath(url)), relative = path.relative(root,target);
    if (relative === ".." || relative.startsWith(".."+path.sep) || path.isAbsolute(relative)) throw new Error("导出资源不在应用目录内。");
    file = target;
  } else throw new Error("导出资源来源无效。");
  const mime = {".css":"text/css",".woff2":"font/woff2",".woff":"font/woff",".ttf":"font/ttf",".otf":"font/otf",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".webp":"image/webp",".avif":"image/avif",".svg":"image/svg+xml"}[path.extname(file).toLowerCase()];
  if (!mime || (await stat(file)).size > 20*1024*1024) throw new Error("导出资源格式无效或超过 20 MB。");
  return {base64:(await readFile(file)).toString("base64"),mime};
}
