import type { DocumentRecord, Host, Recovery, SessionSnapshot } from "./types";
import samples from "../shared/samples.json";
const browserRecords = new Map<string, DocumentRecord>();
const key = "open-typora-session-v1";
function draft(name: string, content: string): DocumentRecord {
  return {
    id: crypto.randomUUID(),
    path: null,
    name,
    content,
    savedContent: content,
    diskHash: null,
    lineEnding: content.includes("\r\n") ? "\r\n" : "\n",
  };
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const browser: Host = {
  native: false,
  async restore() {
    let session: Recovery | null = null;
    try {
      session = JSON.parse(localStorage.getItem(key) || "null");
    } catch {}
    session ??= {
      documents: samples.map((sample) => draft(sample.name, sample.content)),
    };
    for (const record of session.documents)
      browserRecords.set(record.id, record);
    return session;
  },
  async registerDraft(record) {
    browserRecords.set(record.id, record);
  },
  open: () =>
    new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md,.markdown,.mdown";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const record = draft(file.name, await file.text());
        browserRecords.set(record.id, record);
        resolve(record);
      };
      input.addEventListener("cancel", () => resolve(null));
      input.click();
    }),
  async openFolder() {
    throw new Error("打开文件夹请使用桌面应用。浏览器预览可以打开单个文件。");
  },
  async scan() {
    return { folder: null, files: [], truncated: false };
  },
  async openToken() {
    throw new Error("浏览器预览不支持文件夹。");
  },
  async save(id, text) {
    const record = browserRecords.get(id)!;
    download(record.name, text);
    const next = { ...record, content: text, savedContent: text };
    browserRecords.set(id, next);
    return next;
  },
  async persist(session: SessionSnapshot) {
    localStorage.setItem(key, JSON.stringify(session));
  },
  async check() {
    return null;
  },
  async reload(id) {
    return browserRecords.get(id)!;
  },
  async acceptDisk(id) {
    return browserRecords.get(id)!;
  },
  async importImage(_id, bytes) {
    const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  },
  async exportPdf() {
    window.print();
    return null;
  },
  async openLink(url) {
    if (/^https?:\/\//.test(url))
      window.open(url, "_blank", "noopener,noreferrer");
  },
  async confirmDiscard(name) {
    return window.confirm(`关闭「${name}」并移除未保存的修改？`);
  },
  async confirmClose(name) {
    return window.confirm(`不保存「${name}」的修改并关闭？`)
      ? "discard"
      : "cancel";
  },
  async setDirty() {},
  async closeWindow() {
    window.close();
  },
  onCommand() {
    return () => {};
  },
};
export const host: Host = window.desktop
  ? new Proxy({ native: true } as Host, {
      get(target, name: keyof Host) {
        if (name === "native") return true;
        if (name === "onCommand" || name === "closeWindow")
          return window.desktop![name];
        return async (...args: unknown[]) => {
          const response = await window.desktop![name](...args);
          if (!response.ok) {
            const error = new Error(response.error);
            Object.assign(error, { code: response.code });
            throw error;
          }
          return response.value;
        };
      },
    })
  : browser;
