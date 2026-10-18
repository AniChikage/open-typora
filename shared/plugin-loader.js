export default function(context) {
  const {BasePlugin,BaseCustomPlugin,utils,File,$,document,window,setTimeout,setInterval,clearTimeout,clearInterval} = context;
  const factories = new Map([/*__MODULES__*/]);
  const cache = new Map();
  function resolve(from, request) {
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
  function load(id) {
    if (cache.has(id)) return cache.get(id).exports;
    const module={exports:{}};
    cache.set(id,module);
    try { factories.get(id)(module,module.exports,request=>{ const target=resolve(id,request); return target===null ? context.require(request) : load(target); }); }
    catch(error) { cache.delete(id); throw error; }
    return module.exports;
  }
  const exported=load(/*__ENTRY__*/);
  return exported.plugin || exported.default || exported;
}
