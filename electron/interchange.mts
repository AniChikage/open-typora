type PandocNode = { t?: string; c?: unknown[]; [key: string]: unknown };
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, mkdtemp, rm, access, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { atomicWrite } from "./store.mjs";
const exec = promisify(execFile);
export async function pandocPath(): Promise<string> {
  const executable = process.platform === "win32" ? "pandoc.exe" : "pandoc";
  const candidates = [process.env.OPEN_TYPORA_PANDOC,
    ...(process.platform === "win32" ? [process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean).map(root => path.join(root!, "Pandoc", executable)) : ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"]),
    ...(process.env.PATH || "").split(path.delimiter).filter(Boolean).map(root => path.join(root!, executable)),
  ].filter(Boolean);
  for (const file of candidates as string[]) try { await access(file); return file; } catch {}
  return "";
}
export async function convertExport(directory: string, format: string, source: string, html: string, destination: string) {
  await mkdir(directory, { recursive: true }); const temporary = await mkdtemp(path.join(directory, "conversion-"));
  try { const pandoc = await pandocPath();
    if (pandoc) { const file = path.join(temporary, "input.md"); await writeFile(file, source); await exec(pandoc, [file, "--to=" + format, "--standalone", "--output=" + destination], { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }); }
    else if (process.platform === "darwin" && ["docx", "odt", "rtf"].includes(format)) { const file = path.join(temporary, "input.html"); await writeFile(file, html); const { stdout } = await exec("/usr/bin/textutil", ["-convert", format, "-stdout", file], { encoding: "buffer", timeout: 30000, maxBuffer: 50 * 1024 * 1024 }); await atomicWrite(destination, stdout); }
    else throw new Error("此格式需要安装 Pandoc。");
    return destination;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export async function libreOfficePath(): Promise<string> {
  const names = process.platform === "win32" ? ["soffice.com", "soffice.exe"] : ["soffice", "libreoffice"];
  const roots = process.platform === "win32" ? [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean).map(root => path.join(root!,"LibreOffice","program")) : ["/Applications/LibreOffice.app/Contents/MacOS", "/usr/bin", "/opt/homebrew/bin"];
  const candidates = [process.env.OPEN_TYPORA_LIBREOFFICE, ...roots.flatMap(root => names.map(name => path.join(root!,name))), ...(process.env.PATH || "").split(path.delimiter).filter(Boolean).flatMap(root => names.map(name => path.join(root!,name)))].filter(Boolean);
  for (const file of candidates as string[]) try { await access(file); return file; } catch {}
  return "";
}
async function checkMedia(directory: string) {
  let count = 0, total = 0;
  async function walk(folder: string): Promise<void> {
    for (const entry of await readdir(folder,{withFileTypes:true})) {
      const file = path.join(folder,entry.name);
      if (entry.isSymbolicLink()) throw new Error("导入资源包含不支持的符号链接。");
      if (entry.isDirectory()) await walk(file);
      else { const size = (await stat(file)).size; if (++count > 200 || size > 20*1024*1024 || (total += size) > 50*1024*1024) throw new Error("导入资源过多或超过大小限制。"); }
    }
  }
  await walk(directory);
}
async function importFormat(pandoc: string) {
  const {stdout} = await exec(pandoc,["--list-extensions=gfm"],{timeout:10000,maxBuffer:100000});
  if (!stdout.includes("tex_math_dollars")) return "markdown+pipe_tables+tex_math_dollars+footnotes-simple_tables-multiline_tables-grid_tables-implicit_figures-link_attributes";
  return "gfm+tex_math_dollars+footnotes" + (stdout.includes("tex_math_gfm") ? "-tex_math_gfm" : "");
}
export async function convertImport(file: string, directory: string) {
  const name = path.basename(file).replace(/\.[^.]+$/, ".md");
  if ((await stat(file)).size > 20*1024*1024) throw new Error("导入文档必须小于 20 MB。");
  if (/\.html?$/i.test(file)) return { html: await readFile(file, "utf8"), name };
  if (/\.txt$/i.test(file)) return { markdown: await readFile(file, "utf8"), name };
  const pandoc = await pandocPath(), legacy = /\.(doc|rtf)$/i.test(file);
  const format = pandoc ? await importFormat(pandoc) : "";
  // Pandoc 2.x's ODT reader omits equations and table headers. LibreOffice's
  // DOCX bridge retains those structures instead of silently dropping them.
  const oldODT = /\.odt$/i.test(file) && format.startsWith("markdown");
  const needsOffice = legacy || oldODT, office = needsOffice ? await libreOfficePath() : "";
  if (!pandoc || (needsOffice && !office)) {
    if (process.platform === "darwin") { const {stdout} = await exec("/usr/bin/textutil",["-convert","html","-stdout",file],{timeout:30000,maxBuffer:20*1024*1024}); return {html:stdout,name}; }
    if (oldODT) throw new Error("当前 Pandoc 的 ODT 导入需要 LibreOffice；也可升级到 Pandoc 3.x。");
    throw new Error(legacy ? "导入 DOC / RTF 需要安装 LibreOffice 和 Pandoc；也可先另存为 DOCX。" : "导入此格式需要安装 Pandoc，可在偏好设置中选择其可执行文件。");
  }
  if (!directory) throw new Error("缺少导入资源存储目录。");
  const imports = path.join(directory,"Imported"); await mkdir(imports,{recursive:true});
  const media = await realpath(await mkdtemp(path.join(imports,"document-")));
  const temporary = await mkdtemp(path.join(directory,"conversion-"));
  let success = false;
  try {
    let input = path.resolve(file);
    if (needsOffice) {
      // An isolated profile prevents a running LibreOffice GUI from absorbing
      // the conversion request or opening a user's active document.
      await exec(office!,["-env:UserInstallation="+pathToFileURL(path.join(temporary,"profile")).href,"--headless","--nologo","--norestore","--convert-to","docx","--outdir",temporary,input],{timeout:60000,maxBuffer:2*1024*1024});
      input = path.join(temporary,path.basename(file,path.extname(file))+".docx");
      const converted = await stat(input).catch(()=>null);
      if (!converted?.size || converted.size > 50*1024*1024) throw new Error("LibreOffice 未生成有效的 DOCX 文件。");
    }
    const {stdout} = await exec(pandoc,[input,"--to=json","--extract-media=media"],{cwd:media,timeout:30000,maxBuffer:20*1024*1024});
    const document = JSON.parse(stdout);
    // Rewrite only parsed image/link destinations, never Markdown text or code.
    function resources(input: unknown) {
      const value = input as PandocNode | null | undefined;
      if (!value || typeof value !== "object") return;
      if (["Image","Link"].includes(value.t!)) {
        const target = value.c?.at(-1);
        if (Array.isArray(target) && typeof target[0] === "string" && target[0].startsWith("media/")) {
          if (value.t === "Image" && !/\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(target[0])) throw new Error("导入图片格式不受支持，请先将 WMF / EMF 等图片转换为 PNG 或 JPEG。");
          const resource = path.resolve(media,target[0]);
          if (!resource.startsWith(media+path.sep)) throw new Error("导入资源路径无效。");
          target[0] = resource.split(path.sep).join("/").replace(/[ %()#?]/g,character=>"%"+character.charCodeAt(0).toString(16).toUpperCase());
        }
      }
      for (const child of Object.values(value)) if (Array.isArray(child)) child.forEach(resources); else if (child && typeof child === "object") resources(child);
    }
    resources(document);
    function unwrap(input: unknown): unknown {
      const value = input as PandocNode | null | undefined;
      if (Array.isArray(value)) return value.flatMap((child: PandocNode | null) => child && ["Div","Span"].includes(child.t!) ? unwrap(child.c![1]) : [unwrap(child)]);
      if (!value || typeof value !== "object") return value;
      if (value.t === "Header") value.c![1] = ["",[],[]];
      for (const key of Object.keys(value)) value[key] = unwrap(value[key]);
      return value;
    }
    unwrap(document); await checkMedia(media);
    const json = path.join(temporary,"document.json"); await writeFile(json,JSON.stringify(document));
    const result = await exec(pandoc,[json,"--from=json","--to="+format,format.startsWith("gfm") ? "--markdown-headings=atx" : "--atx-headers","--wrap=none"],{cwd:media,timeout:30000,maxBuffer:20*1024*1024});
    success = true;
    if (!(await readdir(media)).length) await rm(media,{recursive:true,force:true});
    return {markdown:result.stdout,name};
  } finally { await rm(temporary,{recursive:true,force:true}); if (!success) await rm(media,{recursive:true,force:true}); }
}
export async function themes(directory: string) { const root = path.join(directory, "themes"); await mkdir(root, { recursive: true }); return Promise.all((await readdir(root)).filter(name => name.endsWith(".css")).map(async id => ({ id, name: id.slice(0, -4), css: await readFile(path.join(root!, id), "utf8") }))); }
export async function installTheme(file: string, directory: string) {
  if (path.extname(file).toLowerCase() !== ".css") throw new Error("请选择 CSS 主题。");
  const base = await realpath(path.dirname(file)), seen = new Set(); let total = 0, cssTotal = 0;
  const inside = (target: string) => { const relative = path.relative(base, target); return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); };
  const local = async (from: string, reference: string) => {
    if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(reference)) throw new Error("请先下载主题字体和图片到本地。");
    const target = await realpath(path.resolve(path.dirname(from), decodeURIComponent(reference)));
    if (!inside(target)) throw new Error("主题资源位于主题目录之外。"); return target;
  };
  async function embed(file: string, depth = 0): Promise<string> {
    if (depth > 4 || seen.has(file)) throw new Error("主题包含循环引用或嵌套过深。"); seen.add(file);
    const bytes = await readFile(file); cssTotal += bytes.length; if (cssTotal > 32 * 1024 * 1024) throw new Error("CSS 主题超过 32 MB。");
    let css = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const imports = [...css.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g)];
    for (const match of imports.reverse()) css = css.slice(0, match.index) + await embed(await local(file, match[1]), depth + 1) + css.slice(match.index + match[0].length);
    for (const match of [...css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/g)].reverse()) {
      const reference = match[1]; if (/^(?:data:|#)/i.test(reference)) continue;
      const asset = await local(file, reference), bytes = await readFile(asset); total += bytes.length;
      if (total > 20 * 1024 * 1024) throw new Error("主题资源超过 20 MB。");
      const mime = ({ ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" } as Record<string,string>)[path.extname(asset).toLowerCase()] || "application/octet-stream";
      css = css.slice(0, match.index) + `url(data:${mime};base64,${bytes.toString("base64")})` + css.slice(match.index + match[0].length);
    }
    if (Buffer.byteLength(css) > 32 * 1024 * 1024) throw new Error("完整主题超过 32 MB。");
    seen.delete(file); return css;
  }
  const css = await embed(await realpath(file)), id = path.basename(file);
  await atomicWrite(path.join(directory, "themes", id), css); return id;
}
