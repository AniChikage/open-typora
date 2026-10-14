import { cp, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const folder = path.join(os.homedir(), "Applications");
const source = path.resolve(
  `release/mac${process.arch === "arm64" ? "-arm64" : ""}/Open Typora.app`,
);
const destination = path.join(folder, "Open Typora.app");
await stat(source);
await mkdir(folder, { recursive: true });
const staging = path.join(folder, `.Open Typora-${Date.now()}.app`);
await cp(source, staging, { recursive: true });
try {
  await stat(destination);
  const backups = path.join(folder, ".open-typora-backups");
  await mkdir(backups, { recursive: true });
  await rename(
    destination,
    path.join(backups, `Open Typora-${Date.now()}.app`),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await rename(staging, destination);
console.log(`已安装：${destination}`);
