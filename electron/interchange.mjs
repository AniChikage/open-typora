import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, mkdtemp, rm, access, readdir } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "./store.mjs";
const exec = promisify(execFile);
export async function pandocPath() { for (const file of [process.env.OPEN_TYPORA_PANDOC, "/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"].filter(Boolean)) try { await access(file); return file; } catch {} return ""; }
export async function convertExport(directory, format, source, html, destination) {
  await mkdir(directory, { recursive: true }); const temporary = await mkdtemp(path.join(directory, "conversion-"));
  try { const pandoc = await pandocPath();
    if (pandoc) { const file = path.join(temporary, "input.md"); await writeFile(file, source); await exec(pandoc, [file, "--to=" + format, "--standalone", "--output=" + destination], { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }); }
    else if (["docx", "odt", "rtf"].includes(format)) { const file = path.join(temporary, "input.html"); await writeFile(file, html); const { stdout } = await exec("/usr/bin/textutil", ["-convert", format, "-stdout", file], { encoding: "buffer", timeout: 30000, maxBuffer: 50 * 1024 * 1024 }); await atomicWrite(destination, stdout); }
    else throw new Error("此格式需要安装 Pandoc。");
    return destination;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
export async function convertImport(file) { const pandoc = await pandocPath(); if (pandoc && !/\.html?$/i.test(file)) { const { stdout } = await exec(pandoc, [file, "--to=gfm+tex_math_dollars", "--wrap=none"], { timeout: 30000, maxBuffer: 20 * 1024 * 1024 }); return { markdown: stdout, name: path.basename(file).replace(/\.[^.]+$/, ".md") }; } const { stdout } = await exec("/usr/bin/textutil", ["-convert", "html", "-stdout", file], { timeout: 30000, maxBuffer: 20 * 1024 * 1024 }); return { html: stdout, name: path.basename(file).replace(/\.[^.]+$/, ".md") }; }
export async function themes(directory) { const root = path.join(directory, "themes"); await mkdir(root, { recursive: true }); return Promise.all((await readdir(root)).filter(name => name.endsWith(".css")).map(async id => ({ id, name: id.slice(0, -4), css: await readFile(path.join(root, id), "utf8") }))); }
