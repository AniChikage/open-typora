import { readFile } from "node:fs/promises";
import { pluginModule } from "../shared/plugin-module.mjs";
export function typoraPlugins() {
  return { name: "typora-commonjs-plugins", enforce: "pre", async load(id) {
    if (!id.endsWith("?typora-plugin")) return;
    return pluginModule(await readFile(id.slice(0, -"?typora-plugin".length), "utf8"));
  } };
}
