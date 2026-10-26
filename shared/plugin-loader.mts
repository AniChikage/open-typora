export default function(context: Record<string, unknown> & { require(request: string): unknown }) {
  const {BasePlugin,BaseCustomPlugin,utils,File,$,document,window,setTimeout,setInterval,clearTimeout,clearInterval} = context;
  type Factory = (module: { exports: unknown }, exports: unknown, require: (request: string) => unknown) => void;
  const factories = new Map<string, Factory>([/*__MODULES__*/]);
  const cache = new Map<string, { exports: unknown }>();
  function resolve(from: string, request: string) {
    if (typeof request !== 'string' || !request.startsWith('.')) return null;
    if (request.includes('\\') || request.includes('\0') || request.includes(':')) throw new Error('无效的插件模块路径：'+request);
    const parts = from.split('/').slice(0,-1);
    for (const part of request.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!parts.length) throw new Error('插件模块不能访问文件夹之外：'+request); parts.pop(); }
      else parts.push(part);
    }
    const name=parts.join('/');
    for (const candidate of [name,name+'.js',name+'.cjs',name+'.json',name+'.css',name+'/index.js',name+'/index.cjs']) if (factories.has(candidate)) return candidate;
    throw new Error('插件文件夹中缺少模块：'+request+'（来自 '+from+'）');
  }
  function load(id?: string): unknown {
    if (typeof id !== "string") throw new Error("Missing packaged plugin entry");
    if (cache.has(id)) return cache.get(id)!.exports;
    const module: { exports: unknown }={exports:{}};
    cache.set(id,module);
    try { factories.get(id)!(module,module.exports,request=>{ const target=resolve(id,request); return target===null ? context.require(request) : load(target); }); }
    catch(error) { cache.delete(id); throw error; }
    return module.exports;
  }
  const exported=load(/*__ENTRY__*/) as { plugin?: unknown; default?: unknown };
  return exported.plugin || exported.default || exported;
}
