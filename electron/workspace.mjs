import { readFile, realpath, stat, mkdir, copyFile, rename, open } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, encodeText, decodeText } from "./store.mjs";
const under = (base, file) => file === base || file.startsWith(base + path.sep);
export class Workspace {
  constructor(directory) { this.directory = directory; this.undo = null; }
  async recent() { try { return JSON.parse(await readFile(path.join(this.directory, "recent.json"), "utf8")); } catch (error) { if (error.code === "ENOENT") return []; throw error; } }
  async writeRecent(items) { await atomicWrite(path.join(this.directory, "recent.json"), JSON.stringify([...items.filter(item => item.pinned), ...items.filter(item => !item.pinned).slice(0, 50)])); }
  async remember(file, folder = false) { const target = await realpath(file), items = await this.recent(), pinned = items.find(item => item.path === target)?.pinned || false; await this.writeRecent([{ path: target, name: path.basename(target), folder, pinned }, ...items.filter(item => item.path !== target)]); }
  async recentAction(action, file) { let items = await this.recent(); if (action === "clear") items = items.filter(item => item.pinned); else if (action === "remove") items = items.filter(item => item.path !== file); else if (action === "pin") items = items.map(item => item.path === file && item.folder ? { ...item, pinned: !item.pinned } : item); else throw new Error("最近项目操作无效。"); await this.writeRecent(items); return items; }
  async authorize(file, store, directory = false) { const target = path.resolve(file), canonical = await realpath(target); if (canonical !== target || !(store.folder && under(store.folder, target) || !directory && [...store.records.values()].some(record => record.path === target))) throw new Error("请先打开目标文件夹，文件操作不支持符号链接。"); return target; }
  async execute(operation, store, trash) {
    const action = operation.action;
    if (action === "undo") { if (!this.undo) throw new Error("没有可撤销的文件操作。"); const { from, to } = this.undo; await this.absent(to); await rename(from, to); this.undo = null; return { fromPath: from, toPath: to }; }
    const source = await this.authorize(operation.path || store.folder || "", store, ["new-file", "new-folder"].includes(action));
    if (source === store.folder && ["rename", "move", "trash"].includes(action)) throw new Error("不能移动或删除根文件夹。");
    if (action === "trash") { if (!trash) throw new Error("当前宿主未提供废纸篓。"); await trash(source); this.undo = null; return { removedPath: source }; }
    let destination;
    if (action === "move") destination = path.join(await this.authorize(operation.target, store, true), path.basename(source));
    else { const name = operation.name; if (!name || name.startsWith(".") || /[/\\:\0]/.test(name) || Buffer.byteLength(name) > 240) throw new Error("文件名称无效。"); destination = path.join(["new-file", "new-folder"].includes(action) ? source : path.dirname(source), name); }
    await this.absent(destination); if (under(source, destination) && !["new-file", "new-folder"].includes(action)) throw new Error("目标位于自身内部。");
    if (action === "new-folder") await mkdir(destination);
    else if (action === "new-file") { if (!/\.(md|markdown|mdown)$/i.test(destination)) throw new Error("需要 Markdown 扩展名。"); const handle = await open(destination, "wx", 0o600); await handle.close(); }
    else if (action === "duplicate") { const record = [...store.records.values()].find(item => item.path === source), bytes = record && encodeText(record.content, record.encoding, record.bom); await copyFile(source, destination, 1); if (bytes) await atomicWrite(destination, bytes); }
    else if (["move", "rename"].includes(action)) { await rename(source, destination); this.undo = { from: destination, to: source }; return { fromPath: source, toPath: destination }; }
    else throw new Error("文件操作无效。");
    return { newPath: destination };
  }
  async absent(file) { try { await stat(file); } catch (error) { if (error.code === "ENOENT") return; throw error; } throw new Error("目标已存在，未覆盖任何文件。"); }
  apply(change, store) { for (const [id, record] of store.records) { if (change.removedPath && record.path && under(change.removedPath, record.path)) store.records.delete(id); else if (change.fromPath && record.path && under(change.fromPath, record.path)) { record.path = change.toPath + record.path.slice(change.fromPath.length); record.name = path.basename(record.path); } } }
  async search(files, query, options) {
    if (!query || query.length > 1000) return { matches: [], skipped: 0, truncated: false };
    const expression = new RegExp(options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), options.caseSensitive ? "g" : "gi");
    const matches = []; let skipped = 0, total = 0;
    for (const file of files.filter(item => item.isDirectory !== "true")) {
      try { const size = (await stat(file.path)).size; if (size > 2 * 1024 * 1024 || (total += size) > 30 * 1024 * 1024) { skipped++; continue; } const bytes = await readFile(file.path), lines = decodeText(bytes, options.encodings?.[file.path]).content.split("\n"); for (let line = 0; line < lines.length; line++) { for (const match of lines[line].matchAll(expression)) { if (matches.length >= 500) return { matches, skipped, truncated: true }; matches.push({ token: file.token, path: file.path, name: file.relative, line: line + 1, column: match.index + 1, length: match[0].length, preview: lines[line].slice(Math.max(0, match.index - 70), Math.max(match.index + match[0].length, match.index + 110)) }); } } } catch { skipped++; }
    }
    return { matches, skipped, truncated: false };
  }
}
