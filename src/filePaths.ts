export function windowsPath(path: string) { return /^(?:[a-z]:[\\/]|\\\\)/i.test(path); }
export function documentFileName(path: string) {
  return path.split(windowsPath(path) ? /[\\/]/ : /\//).at(-1) || path;
}
export function pathContains(file: string, parent: string) {
  const windows = windowsPath(parent);
  if (windows !== windowsPath(file)) return false;
  const normalize = (value: string) => (windows ? value.replace(/\\/g, "/").toLowerCase() : value).replace(/\/+$/, "");
  const source = normalize(parent), target = normalize(file);
  return source === target || target.startsWith(source + "/");
}
