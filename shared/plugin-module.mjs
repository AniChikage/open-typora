// Wrap CommonJS without eval; installed modules are served by the desktop host.
export function pluginModule(source) {
  if (typeof source !== "string" || source.length > 1_000_000 || source.includes("\0")) throw new Error("插件必须是小于 1 MB 的 UTF-8 JavaScript 文件。");
  return `export default function(context) {\nconst {BasePlugin,BaseCustomPlugin,utils,File,$,document,window,setTimeout,setInterval,clearTimeout,clearInterval} = context;\nconst require=context.require; const module={exports:{}}; const exports=module.exports;\n${source}\n;return module.exports.plugin || module.exports.default || module.exports;\n}\n`;
}
