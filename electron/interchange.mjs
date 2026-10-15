import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, mkdtemp, rm, access, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "./store.mjs";
const exec = promisify(execFile);
export async function pandocPath() {
  const executable = process.platform === "win32" ? "pandoc.exe" : "pandoc";
  const candidates = [process.env.OPEN_TYPORA_PANDOC,
    ...(process.platform === "win32" ? [process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean).map(root => path.join(root, "Pandoc", executable)) : ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"]),
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean).map(root => path.join(root, executable)),
  ].filter(Boolean);
  for (const file of candidates) try { await access(file); return file; } catch {}
  return "";
}
export async function convertExport(directory, format, source, html, destination) {
  await mkdir(directory, { recursive: true }); const temporary = await mkdtemp(path.join(directory, "conversion-"));
  try { const pandoc = await pandocPath();
    if (pandoc) { const file = path.join(temporary, "input.md"); await writeFile(file, source); await exec(pandoc, [file, "--to=" + format, "--standalone", "--output=" + destination], { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }); }
    else if (process.platform === "darwin" && ["docx", "odt", "rtf"].includes(format)) { const file = path.join(temporary, "input.html"); await writeFile(file, html); const { stdout } = await exec("/usr/bin/textutil", ["-convert", format, "-stdout", file], { encoding: "buffer", timeout: 30000, maxBuffer: 50 * 1024 * 1024 }); await atomicWrite(destination, stdout); }
    else throw new Error("此格式需要安装 Pandoc。");
    return destination;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export async function convertImport(file) {
  const name = path.basename(file).replace(/\.[^.]+$/, ".md");
  if (/\.html?$/i.test(file)) return { html: await readFile(file, "utf8"), name };
  if (/\.txt$/i.test(file)) return { markdown: await readFile(file, "utf8"), name };
  const pandoc = await pandocPath();
  if (pandoc && !/\.(doc|rtf)$/i.test(file)) {
    const { stdout } = await exec(pandoc, [file, "--to=gfm+tex_math_dollars", "--wrap=none"], { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
    return { markdown: stdout, name };
  }
  if (process.platform !== "darwin") throw new Error(/\.(doc|rtf)$/i.test(file) ? "请先将 DOC / RTF 另存为 DOCX，再用 Pandoc 导入。" : "导入此格式需要安装 Pandoc，可在偏好设置中选择其可执行文件。");
  const { stdout } = await exec("/usr/bin/textutil", ["-convert", "html", "-stdout", file], { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
  return { html: stdout, name };
}
export async function themes(directory) { const root = path.join(directory, "themes"); await mkdir(root, { recursive: true }); return Promise.all((await readdir(root)).filter(name => name.endsWith(".css")).map(async id => ({ id, name: id.slice(0, -4), css: await readFile(path.join(root, id), "utf8") }))); }
export async function installTheme(file, directory) {
  if (path.extname(file).toLowerCase() !== ".css") throw new Error("请选择 CSS 主题。");
  const base = await realpath(path.dirname(file)), seen = new Set(); let total = 0;
  const inside = target => { const relative = path.relative(base, target); return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); };
  const local = async (from, reference) => {
    if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(reference)) throw new Error("请先下载主题字体和图片到本地。");
    const target = await realpath(path.resolve(path.dirname(from), decodeURIComponent(reference)));
    if (!inside(target)) throw new Error("主题资源位于主题目录之外。"); return target;
  };
  async function embed(file, depth = 0) {
    if (depth > 4 || seen.has(file)) throw new Error("主题包含循环引用或嵌套过深。"); seen.add(file);
    const bytes = await readFile(file); if (bytes.length > 1_000_000) throw new Error("CSS 主题必须小于 1 MB。"); total += bytes.length;
    let css = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const imports = [...css.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g)];
    for (const match of imports.reverse()) css = css.slice(0, match.index) + await embed(await local(file, match[1]), depth + 1) + css.slice(match.index + match[0].length);
    for (const match of [...css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)].reverse()) {
      const reference = match[1]; if (/^(?:data:|#)/i.test(reference)) continue;
      const asset = await local(file, reference), bytes = await readFile(asset); total += bytes.length;
      if (total > 20 * 1024 * 1024) throw new Error("主题资源超过 20 MB。");
      const mime = { ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[path.extname(asset).toLowerCase()] || "application/octet-stream";
      css = css.slice(0, match.index) + `url(data:${mime};base64,${bytes.toString("base64")})` + css.slice(match.index + match[0].length);
    }
    seen.delete(file); return css;
  }
  const css = await embed(await realpath(file)), id = path.basename(file);
  await atomicWrite(path.join(directory, "themes", id), css); return id;
}
