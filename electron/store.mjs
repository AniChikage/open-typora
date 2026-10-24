import {
  readFile,
  writeFile,
  rename,
  mkdir,
  readdir,
  stat,
  realpath,
  lstat,
  unlink,
  open,
} from "node:fs/promises";
import path from "node:path";
import iconv from "iconv-lite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID, createHash } from "node:crypto";

export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
const markdown = /\.(md|markdown|mdown)$/i;
const within = (base, file) => {
  const relative = path.relative(base, file);
  return (
    !relative.startsWith(".." + path.sep) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
};
export async function atomicWrite(file, data, beforeCommit) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${randomUUID()}.tmp`,
  );
  try {
    let mode = 0o600;
    try {
      mode = (await stat(file)).mode & 0o777;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const handle = await open(temporary, "wx", mode);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (beforeCommit) await beforeCommit();
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
export const encodings = ["utf-8", "utf-16le", "utf-16be", "gb18030", "gbk", "big5", "shift_jis", "windows-1252"];
export function decodeText(bytes, requested) {
  const marker = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])) ? ["utf-8", 3] : bytes[0] === 0xff && bytes[1] === 0xfe ? ["utf-16le", 2] : bytes[0] === 0xfe && bytes[1] === 0xff ? ["utf-16be", 2] : null;
  const encoding = requested || marker?.[0] || "utf-8", bom = marker?.[0] === encoding;
  if (!encodings.includes(encoding)) throw new Error("不支持的文本编码。");
  let text;
  try { text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bom ? bytes.subarray(marker[1]) : bytes); }
  catch { throw Object.assign(new Error(`无法按 ${encoding.toUpperCase()} 读取文本，请选择文件的实际编码。`), { code: "INVALID_ENCODING" }); }
  if (/[\u0000-\u0008\u000b\u000e-\u001f]/.test(text)) throw Object.assign(new Error("文件包含非文本字符。"), { code: "INVALID_ENCODING" });
  return { content: text, bom, encoding };
}
export function encodeText(text, encoding = "utf-8", bom = false) {
  if (!encodings.includes(encoding)) throw new Error("不支持的文本编码。");
  const bytes = iconv.encode(text, encoding);
  if (iconv.decode(bytes, encoding, { stripBOM: false }) !== text) throw Object.assign(new Error("此编码无法无损保存部分字符，请改用 UTF-8。原文件未修改。"), { code: "ENCODING_LOSS" });
  const prefix = bom ? { "utf-8": [0xef, 0xbb, 0xbf], "utf-16le": [0xff, 0xfe], "utf-16be": [0xfe, 0xff] }[encoding] || [] : [];
  const output = Buffer.concat([Buffer.from(prefix), bytes]);
  return output;
}
export class DocumentStore {
  records = new Map();
  fileTokens = new Map();
  folder = null;
  queues = new Map();
  persistQueue = Promise.resolve();
  scanQueue = Promise.resolve();
  constructor(dataDir) {
    this.dataDir = dataDir;
  }
  async open(file, reload = false, encoding) {
    const resolved = await realpath(file);
    if (!markdown.test(resolved)) throw new Error("请选择 Markdown 文件。");
    const metadata = await stat(resolved);
    if (!metadata.isFile()) throw new Error("请选择普通 Markdown 文件。");
    const bytes = await readFile(resolved);
    const existing = [...this.records.values()].find(record => record.path === resolved);
    if (existing && !reload) return { ...existing };
    const decoded = decodeText(bytes, encoding);
    const text = decoded.content;
    const id = existing?.id ?? randomUUID();
    const record = {
      id,
      path: resolved,
      name: path.basename(resolved),
      content: text,
      savedContent: text,
      diskHash: digest(bytes),
      lineEnding: text.includes("\r\n") ? "\r\n" : "\n",
      bom: decoded.bom, encoding: decoded.encoding,
    };
    this.records.set(id, record);
    return { ...record };
  }
  registerDraft(record) {
    if (
      !record ||
      typeof record.id !== "string" ||
      typeof record.content !== "string" ||
      record.path
    )
      throw new Error("草稿格式无效。");
    const previous = this.records.get(record.id);
    if (previous?.path) throw new Error("已保存文件不能转换为草稿。");
    const result = {
      id: record.id,
      path: null,
      name: typeof record.name === "string" ? record.name : "未命名.md",
      content: record.content,
      savedContent: "",
      diskHash: null,
      lineEnding: "\n",
    };
    this.records.set(result.id, result);
    return result;
  }
  require(id) {
    const record = this.records.get(id);
    if (!record) throw new Error("文件已关闭，请重新打开。");
    return record;
  }
  async save(id, text, destination, force = false, options = {}) {
    if (typeof text !== "string") throw new Error("文件内容无效。");
    const prior = this.queues.get(id) ?? Promise.resolve();
    const operation = prior
      .catch(() => {})
      .then(async () => {
        const record = this.require(id);
        const file = destination ? path.resolve(destination) : record.path;
        if (!file) throw new Error("请先为草稿选择保存位置。");
        if (record.path === file && record.conflict && !force) throw Object.assign(new Error("磁盘冲突尚未解决，请另存副本或确认覆盖。"), { code: "EXTERNAL_CHANGE" });
        if (record.path === file && !force) {
          let bytes;
          try {
            bytes = await readFile(file);
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
          if (!bytes || digest(bytes) !== record.diskHash) {
            const error = new Error("磁盘文件已被其他程序修改，草稿已保留。");
            error.code = "EXTERNAL_CHANGE";
            throw error;
          }
        }
        const encoding = options.encoding || record.encoding || "utf-8", bom = (options.bom ?? record.bom ?? false) && encoding.startsWith("utf-");
        const bytes = encodeText(text, encoding, bom);
        await atomicWrite(
          file,
          bytes,
          record.path === file && !force
            ? async () => {
                let current;
                try {
                  current = await readFile(file);
                } catch (e) {
                  if (e.code !== "ENOENT") throw e;
                }
                if (!current || digest(current) !== record.diskHash) {
                  const error = new Error(
                    "磁盘文件在保存过程中发生变化，草稿已保留。",
                  );
                  error.code = "EXTERNAL_CHANGE";
                  throw error;
                }
              }
            : undefined,
        );
        const updated = {
          ...record, encoding, bom,
          path: await realpath(file),
          name: path.basename(file),
          content: text,
          savedContent: text,
          diskHash: digest(bytes),
        };
        this.records.set(id, updated);
        return { ...updated };
      });
    this.queues.set(id, operation);
    try {
      return await operation;
    } finally {
      if (this.queues.get(id) === operation) this.queues.delete(id);
    }
  }
  scan(folder) {
    // Folder switches and periodic refreshes must commit in request order.
    const operation = this.scanQueue.then(() => this.scanFolder(folder));
    this.scanQueue = operation.then(() => {}, () => {});
    return operation;
  }
  async scanFolder(folder = this.folder) {
    if (!folder) return { folder: null, files: [], truncated: false, skipped: 0 };
    const root = await realpath(folder), tokens = new Map(), files = [];
    let truncated = false, skipped = 0;
    const walk = async (directory, depth) => {
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) {
        if (depth === 0) throw error;
        skipped++;
        return;
      }
      entries.sort((a, b) =>
        a.name.localeCompare(b.name, "zh-CN", { numeric: true }),
      );
      for (const entry of entries) {
        if (
          entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.isSymbolicLink() ||
          !(entry.isDirectory() || entry.isFile() && markdown.test(entry.name))
        )
          continue;
        if (files.length >= 1000) {
          truncated = true;
          return;
        }
        const file = path.join(directory, entry.name);
        let metadata;
        try { metadata = await lstat(file); }
        catch { skipped++; continue; }
        if (metadata.isSymbolicLink() || !(metadata.isDirectory() || metadata.isFile() && markdown.test(entry.name))) continue;
        const token = digest(file);
        tokens.set(token, file);
        files.push({
          token,
          name: entry.name,
          relative: path.relative(root, file),
          path: file, isDirectory: String(metadata.isDirectory()), modified: String(metadata.mtimeMs / 1000), created: String(metadata.birthtimeMs / 1000),
        });
        if (metadata.isDirectory()) { if (depth < 8) await walk(file, depth + 1); else truncated = true; }
      }
    };
    await walk(root, 0);
    // A failed root scan must retain the last usable folder and token grants.
    this.folder = root;
    this.fileTokens = tokens;
    return { folder: root, files, truncated, skipped };
  }
  async openToken(token) {
    const file = this.fileTokens.get(token);
    if (!file) throw new Error("目录已更新，请刷新后重试。");
    return this.open(file);
  }
  async check(id) {
    const record = this.require(id);
    if (!record.path) return null;
    try {
      const bytes = await readFile(record.path);
      const hash = digest(bytes);
      return hash === record.diskHash
        ? null
        : {
            ...decodeText(bytes, this.hasBOM(bytes) ? undefined : record.encoding),
            diskHash: hash,
          };
    } catch (e) {
      return { missing: e.code === "ENOENT", error: "磁盘文件暂时无法读取。" };
    }
  }
  hasBOM(bytes) { return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf || bytes[0] === 0xff && bytes[1] === 0xfe || bytes[0] === 0xfe && bytes[1] === 0xff; }
  acceptDisk(id, content, diskHash, bom = this.require(id).bom, encoding = this.require(id).encoding) {
    const record = this.require(id);
    const updated = {
      ...record,
      content,
      savedContent: content,
      diskHash,
      bom, encoding,
      lineEnding: content.includes("\r\n") ? "\r\n" : "\n",
    };
    this.records.set(id, updated);
    return updated;
  }
  async reopen(id) {
    const record = this.require(id);
    if (record.path) return this.reload(id);
    const restored = { ...record, content: record.savedContent };
    this.records.set(id, restored);
    return { ...restored };
  }
  async reload(id, encoding) {
    const record = this.require(id);
    return this.open(record.path, true, encoding || record.encoding);
  }
  async persist(session) {
    if (!session || !Array.isArray(session.documents))
      throw new Error("恢复数据无效。");
    const documents = session.documents.slice(0, 100).map((document) => {
      const record = this.require(document.id);
      if (
        typeof document.content !== "string"
      )
        throw new Error("草稿内容无效。");
      return {
        ...record,
        content: document.content,
        savedContent: record.savedContent,
      };
    });
    const bytes = JSON.stringify({
      version: 1,
      documents,
      activeId: session.activeId,
      folder: this.folder,
      workspace: session.workspace,
    });
    const operation = this.persistQueue
      .catch(() => {})
      .then(() => atomicWrite(path.join(this.dataDir, "session.json"), bytes));
    this.persistQueue = operation;
    await operation;
  }
  async restore() {
    try {
      const session = JSON.parse(
        await readFile(path.join(this.dataDir, "session.json"), "utf-8"),
      );
      if (session.version !== 1 || !Array.isArray(session.documents))
        return null;
      const documents = [];
      for (const record of session.documents.slice(0, 100)) {
        if (typeof record.id !== "string" || typeof record.content !== "string")
          continue;
        if (record.path) {
          this.records.set(record.id, record);
          const changed = await this.check(record.id);
          if (changed && !changed.error) {
            if (record.content === record.savedContent) {
              record.content = changed.content;
              record.savedContent = changed.content;
              record.diskHash = changed.diskHash;
              record.encoding = changed.encoding; record.bom = changed.bom; record.lineEnding = changed.content.includes("\r\n") ? "\r\n" : "\n";
            } else record.conflict = true;
          } else if (changed?.error) record.conflict = true;
        } else this.registerDraft(record);
        this.records.set(record.id, record);
        documents.push(record);
      }
      if (session.folder) {
        try {
          await this.scan(session.folder);
        } catch {}
      }
      return { documents, activeId: session.activeId, folder: this.folder, workspace: session.workspace };
    } catch (e) {
      if (e.code === "ENOENT") return null;
      const original = await readFile(path.join(this.dataDir, "session.json"));
      await atomicWrite(
        path.join(this.dataDir, `session-backup-${Date.now()}.json`),
        original,
      );
      return {
        documents: [],
        restoreError: "上次会话未能读取，原始恢复文件已另存为备份。",
      };
    }
  }
  async asset(id, relative) {
    const record = this.require(id);
    if (typeof relative !== "string") throw new Error("图片路径不可用。");
    let reference = relative.startsWith("file://") ? fileURLToPath(relative) : decodeURIComponent(relative);
    if (!/\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|ogg|mp3|wav|m4a)$/i.test(reference) || reference.includes("\0")) throw new Error("图片路径不可用。");
    const base = await realpath(record.path ? path.dirname(record.path) : this.dataDir);
    let requested = path.resolve(base, reference);
    if (process.platform === "darwin") { if (requested.startsWith("/var/")) requested = "/private" + requested; else if (requested.startsWith("/tmp/")) requested = "/private" + requested; }
    if (process.platform === "win32") {
      // realpath expands valid 8.3 names (RUNNER~1, PROGRA~1) and normalizes
      // case. Check links explicitly before accepting that normalization.
      let component = path.parse(requested).root;
      for (const part of requested.slice(component.length).split(path.sep).filter(Boolean)) {
        component = path.join(component,part);
        if ((await lstat(component)).isSymbolicLink()) throw new Error("图片位于文档目录之外（符号链接）。");
      }
      requested = await realpath(requested);
    }
    const target = await realpath(requested);
    if (target !== requested) throw new Error("图片位于文档目录之外。");
    if ((await stat(target)).size > 20 * 1024 * 1024)
      throw new Error("图片超过 20 MB。");
    return target;
  }
  async importImage(id, bytes, name, options = {}) {
    const record = this.require(id);
    const data = Buffer.from(bytes);
    if (data.length > 20 * 1024 * 1024 || data.length < 12)
      throw new Error("图片大小无效。");
    const type = data
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? "png"
      : data[0] === 255 && data[1] === 216
        ? "jpg"
        : data.subarray(0, 3).toString() === "GIF"
          ? "gif"
          : data.subarray(0, 4).toString() === "RIFF" &&
              data.subarray(8, 12).toString() === "WEBP"
            ? "webp"
            : null;
    if (!type) throw new Error("支持 PNG、JPEG、GIF 和 WebP 图片。");
    const base =
      String(name || "image")
        .replace(/\.[^.]+$/, "")
        .replace(/[^\p{L}\p{N}_-]/gu, "-")
        .slice(0, 60) || "image";
    const yaml = /^---\r?\n([\s\S]*?)\r?\n---/.exec(options.source || record.content), configured = /^typora-copy-images-to:\s*(.+)$/m.exec(yaml?.[1] || "")?.[1].trim().replace(/^["']|["']$/g, "");
    if (!record.path) await mkdir(this.dataDir, { recursive: true });
    const parent = record.path ? path.dirname(record.path) : path.join(await realpath(this.dataDir), "DraftAssets", digest(record.id)), assets = path.resolve(parent, (configured || options.imageFolder || ".assets").replaceAll("${filename}", record.name.replace(/\.[^.]+$/, "")));
    const destination = path.join(assets, `${base}-${randomUUID().slice(0, 8)}.${type}`);
    let relative = path.relative(parent, destination).split(path.sep).join("/");
    await mkdir(assets, { recursive: true });
    if (assets !== await realpath(assets))
      throw new Error("图片文件夹指向文档目录之外。");
    await atomicWrite(destination, data);
    if (!record.path) {
      if (process.platform === "win32") return pathToFileURL(destination).href;
      relative = destination;
    }
    if (options.imagePrefix && !relative.startsWith(".")) relative = "./" + relative;
    return options.imageEscape === false ? relative : relative.split("/").map(segment => encodeURIComponent(segment).replace(/[()]/g, c => "%" + c.charCodeAt(0).toString(16))).join("/");
  }
}
