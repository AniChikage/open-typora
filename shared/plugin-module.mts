import { readFileSync } from "node:fs";
// Wrap CommonJS without eval; installed modules are served by the desktop host.
export function pluginModule(source: string) {
  if (typeof source !== "string" || source.length > 1_000_000 || source.includes("\0")) throw new Error("插件必须是小于 1 MB 的 UTF-8 JavaScript 文件。");
  return `export default function(context) {\nconst {BasePlugin,BaseCustomPlugin,utils,File,$,document,window,setTimeout,setInterval,clearTimeout,clearInterval} = context;\nconst require=context.require; const module={exports:{}}; const exports=module.exports;\n${source}\n;return module.exports.plugin || module.exports.default || module.exports;\n}\n`;
}
export function pluginPackage(entry: string, files: Record<string, string>) {
  const modules=Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([name,source])=>{
    const body=name.toLowerCase().endsWith('.json') ? `module.exports=JSON.parse(${JSON.stringify(source)});` : name.toLowerCase().endsWith('.css') ? `module.exports=${JSON.stringify(source)};` : source;
    if (name.toLowerCase().endsWith('.json')) JSON.parse(source);
    return `[${JSON.stringify(name)},function(module,exports,require){\n${body}\n}]`;
  }).join(',\n');
  return readFileSync(new URL('./plugin-loader.mjs',import.meta.url),'utf8').replace(/\/\*__(MODULES|ENTRY)__\*\//g,(_match,key)=>key==='MODULES'?modules:JSON.stringify(entry));
}
