import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
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
