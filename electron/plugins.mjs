import { readFile, readdir, mkdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { atomicWrite } from "./store.mjs";
import { pluginModule } from "../shared/plugin-module.mjs";
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
