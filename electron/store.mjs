import {
  readFile,
  writeFile,
  rename,
  mkdir,
  readdir,
  stat,
  realpath,
  unlink,
  open,
} from "node:fs/promises";
import path from "node:path";
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
export class DocumentStore {
  records = new Map();
  fileTokens = new Map();
  folder = null;
  queues = new Map();
  persistQueue = Promise.resolve();
  constructor(dataDir) {
    this.dataDir = dataDir;
  }
  async open(file, reload = false) {
    const resolved = await realpath(file);
    if (!markdown.test(resolved)) throw new Error("请选择 Markdown 文件。");
    const metadata = await stat(resolved);
    if (!metadata.isFile() || metadata.size > 20 * 1024 * 1024)
      throw new Error("文件超过首版支持的 20 MB。");
    const bytes = await readFile(resolved);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const existing = [...this.records.values()].find(
      (record) => record.path === resolved,
    );
    if (existing && !reload) return { ...existing };
    const id = existing?.id ?? randomUUID();
    const record = {
      id,
      path: resolved,
      name: path.basename(resolved),
      content: text,
      savedContent: text,
      diskHash: digest(bytes),
      lineEnding: text.includes("\r\n") ? "\r\n" : "\n",
      bom: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
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
  async save(id, text, destination, force = false) {
    if (typeof text !== "string" || Buffer.byteLength(text) > 20 * 1024 * 1024)
      throw new Error("文件内容无效或超过 20 MB。");
    const prior = this.queues.get(id) ?? Promise.resolve();
    const operation = prior
      .catch(() => {})
      .then(async () => {
        const record = this.require(id);
        const file = destination ? path.resolve(destination) : record.path;
        if (!file) throw new Error("请先为草稿选择保存位置。");
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
        const bytes = Buffer.from((record.bom ? "\uFEFF" : "") + text, "utf-8");
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
          ...record,
          path: file,
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
  async scan(folder = this.folder) {
    if (!folder) return { folder: null, files: [], truncated: false };
    this.folder = await realpath(folder);
    this.fileTokens.clear();
    const files = [];
    let truncated = false;
    const walk = async (directory, depth) => {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((a, b) =>
        a.name.localeCompare(b.name, "zh-CN", { numeric: true }),
      );
      for (const entry of entries) {
        if (
          entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.isSymbolicLink()
        )
          continue;
        if (files.length >= 1000) {
          truncated = true;
          return;
        }
        const file = path.join(directory, entry.name);
        if (entry.isDirectory() || entry.isFile() && markdown.test(entry.name)) {
          const token = digest(file); const metadata = await stat(file);
          this.fileTokens.set(token, file);
          files.push({
            token,
            name: entry.name,
            relative: path.relative(this.folder, file),
            path: file, isDirectory: String(entry.isDirectory()), modified: String(metadata.mtimeMs / 1000), created: String(metadata.birthtimeMs / 1000),
          });
          if (entry.isDirectory()) { if (depth < 8) await walk(file, depth + 1); else truncated = true; }
        }
      }
    };
    await walk(this.folder, 0);
    return { folder: this.folder, files, truncated };
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
            content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
            diskHash: hash,
            bom: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
          };
    } catch (e) {
      return { missing: e.code === "ENOENT", error: "磁盘文件暂时无法读取。" };
    }
  }
  acceptDisk(id, content, diskHash, bom = this.require(id).bom) {
    const record = this.require(id);
    const updated = {
      ...record,
      content,
      savedContent: content,
      diskHash,
      bom,
      lineEnding: content.includes("\r\n") ? "\r\n" : "\n",
    };
    this.records.set(id, updated);
    return updated;
  }
  async reload(id) {
    const record = this.require(id);
    return this.open(record.path, true);
  }
  async persist(session) {
    if (!session || !Array.isArray(session.documents))
      throw new Error("恢复数据无效。");
    const documents = session.documents.slice(0, 100).map((document) => {
      const record = this.require(document.id);
      if (
        typeof document.content !== "string" ||
        Buffer.byteLength(document.content) > 20 * 1024 * 1024
      )
        throw new Error("草稿内容无效。");
      return {
        ...record,
        content: document.content,
        savedContent:
          typeof document.savedContent === "string"
            ? document.savedContent
            : record.savedContent,
      };
    });
    const bytes = JSON.stringify({
      version: 1,
      documents,
      activeId: session.activeId,
      folder: this.folder,
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
      return { documents, activeId: session.activeId, folder: this.folder };
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
    if (
      !record.path ||
      typeof relative !== "string" ||
      !/\.(png|jpe?g|gif|webp|avif|svg)$/i.test(relative)
    )
      throw new Error("图片路径不可用。");
    const base = path.dirname(record.path),
      target = await realpath(path.resolve(base, relative));
    if (target !== path.resolve(base, relative)) throw new Error("图片位于文档目录之外。");
    if ((await stat(target)).size > 20 * 1024 * 1024)
      throw new Error("图片超过 20 MB。");
    return target;
  }
  async importImage(id, bytes, name, options = {}) {
    const record = this.require(id);
    if (!record.path) throw new Error("请先保存文档，再添加本地图片。");
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
    const parent = path.dirname(record.path), assets = path.resolve(parent, (configured || options.imageFolder || ".assets").replaceAll("${filename}", record.name.replace(/\.[^.]+$/, "")));
    const destination = path.join(assets, `${base}-${randomUUID().slice(0, 8)}.${type}`);
    let relative = path.relative(parent, destination);
    await mkdir(assets, { recursive: true });
    if (assets !== await realpath(assets))
      throw new Error("图片文件夹指向文档目录之外。");
    await atomicWrite(path.join(path.dirname(record.path), relative), data);
    if (options.imagePrefix && !relative.startsWith(".")) relative = "./" + relative;
    return options.imageEscape === false ? relative : relative.split("/").map(segment => encodeURIComponent(segment).replace(/[()]/g, c => "%" + c.charCodeAt(0).toString(16))).join("/");
  }
}
