import { backgroundMime, checkedBackground } from "../shared/background.mjs";
import type { BackgroundAsset } from "./background";
async function database() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open("open-typora-appearance-v1",1);
    request.onupgradeneeded = () => request.result.createObjectStore("assets");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法保存背景图片，请检查浏览器存储权限。"));
  });
}
export async function browserBackground(value?: BackgroundAsset | null) {
  const db = await database();
  try {
    return await new Promise<BackgroundAsset | null>((resolve,reject) => {
      const transaction = db.transaction("assets",value === undefined ? "readonly" : "readwrite"), store = transaction.objectStore("assets");
      const request = value === undefined ? store.get("background") : store.put(value,"background");
      transaction.oncomplete = () => { try { resolve(checkedBackground(value === undefined ? request.result ?? null : value)); } catch (error) { reject(error); } };
      transaction.onabort = transaction.onerror = () => reject(new Error("背景图片未保存，请检查可用存储空间。"));
    });
  } finally { db.close(); }
}
export function chooseBrowserBackground(): Promise<BackgroundAsset | null> {
  return new Promise((resolve,reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = "image/png,image/jpeg,image/webp";
    input.addEventListener("cancel",() => resolve(null));
    input.onchange = async () => {
      try {
        const file = input.files?.[0]; if (!file) { resolve(null); return; }
        if (file.size > 8 * 1024 * 1024) throw new Error("背景图片须小于 8 MB。");
        const bytes = new Uint8Array(await file.arrayBuffer()), mime = backgroundMime(bytes), image = new Image(), url = URL.createObjectURL(new Blob([bytes],{type:mime}));
        try { image.src = url; await image.decode().catch(() => { throw new Error("图片无法解码，请选择有效的 PNG、JPEG 或 WebP 图片。"); }); if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("背景图片分辨率过大，请缩小到 4000 万像素以内。"); }
        finally { URL.revokeObjectURL(url); }
        const dataUrl = await new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("无法读取背景图片。")); reader.readAsDataURL(new Blob([bytes],{type:mime})); });
        const asset = {name:file.name.slice(0,160),dataUrl}; await browserBackground(asset); resolve(asset);
      } catch (error) { reject(error); }
    };
    input.click();
  });
}
