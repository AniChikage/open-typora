import { readFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "./store.mjs";
import { backgroundMime, checkedBackground, maxBackgroundBytes } from "../shared/background.mjs";
export async function readBackground(directory: string) {
  try {
    if ((await stat(path.join(directory,"background.json"))).size > Math.ceil(maxBackgroundBytes / 3) * 4 + 1024) throw new Error("背景图片数据过大，请重新选择。");
    const bytes = await readFile(path.join(directory, "background.json"));
    if (bytes.length > Math.ceil(maxBackgroundBytes / 3) * 4 + 1024) throw new Error("背景图片数据过大，请重新选择。");
    return checkedBackground(JSON.parse(bytes.toString("utf8")));
  } catch (errorCaught) { const error = errorCaught as NodeJS.ErrnoException; if (error.code === "ENOENT") return null; throw error; }
}
export async function saveBackground(directory: string, bytes: Buffer, name: string, validate: (bytes: Buffer, dataUrl: string) => unknown | Promise<unknown>) {
  const mime = backgroundMime(bytes);
  const value = { name: path.basename(name).slice(0,160), dataUrl: `data:${mime};base64,${bytes.toString("base64")}` };
  await validate(bytes,value.dataUrl);
  await mkdir(directory, { recursive: true });
  await atomicWrite(path.join(directory,"background.json"), JSON.stringify(value));
  return value;
}
export async function clearBackground(directory: string) {
  await mkdir(directory, { recursive: true });
  await atomicWrite(path.join(directory,"background.json"), "null");
  return null;
}
