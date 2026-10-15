// Stage the canonical editor sources into an already registered Sites checkout.
// Site credentials are supplied separately to the official publishing helper.
import { cp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(process.argv[2] || "");
if (!process.argv[2] || target === root || root.startsWith(target + "/"))
  throw new Error("Pass a separate, registered Sites checkout directory.");
const manifestPath = resolve(target, ".openai/hosting.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!manifest.project_id) throw new Error("Register the Site and persist its project_id before staging source.");
for (const path of ["src", "shared", "design", "web", "tsconfig.json", "LICENSE", "package-lock.json"])
  await cp(resolve(root, path), resolve(target, path), { recursive: true });
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
pkg.scripts = { dev: "vite --host 127.0.0.1 --port 5187", build: "tsc -b && vite build" };
await writeFile(resolve(target, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
const config = (await readFile(resolve(root, "vite.demo.config.ts"), "utf8")).replace('project + "dist-demo"', 'project + "dist"');
await writeFile(resolve(target, "vite.config.ts"), config);
await writeFile(resolve(target, ".gitignore"), "node_modules/\ndist/\n*.tsbuildinfo\n.DS_Store\n.openai/*.local.*\n");
await mkdir(resolve(target, ".openai"), { recursive: true });
await writeFile(manifestPath, JSON.stringify({ ...manifest, static: { directory: "dist" } }, null, 2) + "\n");
console.log(`Staged browser editor sources into ${await realpath(target)}`);
