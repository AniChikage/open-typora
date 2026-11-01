// Keep in step with PluginLimits in native/Interchange.swift; both hosts have boundary tests.
export const pluginLimits = { source: 16 * 1024 * 1024, package: 32 * 1024 * 1024, resource: 64 * 1024 * 1024, files: 64, depth: 8 } as const;
export const pluginSourceError = "单个插件源文件超过 16 MiB，请拆分文件后重新安装。";
export const pluginPackageError = "插件文件夹最多 64 个文件、共 32 MiB，单个文件不超过 16 MiB。";
export const pluginResourceError = "插件构建产物超过 64 MiB，请拆分插件或减小构建产物后重新安装。";
export function checkPluginResourceSize(bytes: number) {
  if (bytes > pluginLimits.resource) throw Object.assign(new Error(pluginResourceError), { code: "PLUGIN_TOO_LARGE" });
}
