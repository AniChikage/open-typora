import { readFileSync } from "node:fs";
import { pluginLimits, pluginSourceError, pluginPackageError, checkPluginResourceSize } from "./plugin-limits.mjs";
// Wrap CommonJS without eval; installed modules are served by the desktop host.
export function pluginModule(source: string) {
  if (typeof source !== "string" || source.includes("\0")) throw new Error("插件必须使用无 NUL 的 UTF-8 文件。");
  if (Buffer.byteLength(source) > pluginLimits.source) throw new Error(pluginSourceError);
  return `export default function(context) {\nconst {BasePlugin,BaseCustomPlugin,utils,File,$,document,window,setTimeout,setInterval,clearTimeout,clearInterval} = context;\nconst require=context.require; const module={exports:{}}; const exports=module.exports;\n${source}\n;return module.exports.plugin || module.exports.default || module.exports;\n}\n`;
}
export function pluginPackage(entry: string, files: Record<string, string>) {
  let total = 0;
  if (Object.keys(files).length > pluginLimits.files) throw new Error(pluginPackageError);
  for (const source of Object.values(files)) {
    const size = Buffer.byteLength(source); total += size;
    if (size > pluginLimits.source || total > pluginLimits.package) throw new Error(pluginPackageError);
    if (source.includes('\0')) throw new Error('插件必须使用无 NUL 的 UTF-8 文件。');
  }
  const modules=Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,source])=>{
    const body=name.toLowerCase().endsWith('.json') ? `module.exports=JSON.parse(${JSON.stringify(source)});` : name.toLowerCase().endsWith('.css') ? `module.exports=${JSON.stringify(source)};` : source;
    if (name.toLowerCase().endsWith('.json')) JSON.parse(source);
    return `[${JSON.stringify(name)},function(module,exports,require){\n${body}\n}]`;
  }).join(',\n');
  const module = readFileSync(new URL('./plugin-loader.mjs',import.meta.url),'utf8').replace(/\/\*__(MODULES|ENTRY)__\*\//g,(_match,key)=>key==='MODULES'?modules:JSON.stringify(entry));
  checkPluginResourceSize(Buffer.byteLength(module));
  return module;
}
