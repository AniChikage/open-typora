import { existsSync } from "node:fs";
import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Compile before packaging: Electron's sandboxed preload remains CommonJS,
// WebKit receives classic JavaScript, and only emitted files enter installers.
await rm("build/runtime", { recursive: true, force: true });
for (const config of ["tsconfig.runtime.json", "tsconfig.bridges.json"])
  execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", config], { stdio: "inherit" });
for (const name of await readdir("shared"))
  if (name.endsWith(".json") || name.endsWith(".d.ts"))
    await cp(path.join("shared", name), path.join("build/runtime/shared", name));
await rm("build/public", { recursive: true, force: true });
await mkdir("build/public", { recursive: true });
if (existsSync("public")) await cp("public", "build/public", { recursive: true });
await cp("build/runtime/browser/pagination.js", "build/public/pagination.js");
