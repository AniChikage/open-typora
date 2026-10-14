import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function exists(file) {
  try { await stat(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

export async function installBundle({ source, destination, sign, verify, running = "" }) {
  const folder = path.dirname(destination);
  const rollback = path.join(folder, ".Open Typora-rollback.app");
  if ([destination, rollback].some(file => running.includes(`${file}/Contents/`)))
    throw new Error("请先正常退出已安装的 Open Typora，再运行安装。");
  if (path.resolve(source) === path.resolve(destination)) throw new Error("安装源与目标不能相同。");
  await stat(source);
  await mkdir(folder, { recursive: true });

  // Recover an interrupted replacement before starting another one. Keep the
  // old bundle until the new destination has passed signature verification.
  if (await exists(rollback)) {
    if (await exists(destination)) {
      await verify(destination);
      await rm(rollback, { recursive: true });
    } else await rename(rollback, destination);
  }
  const staging = path.join(folder, `.Open Typora-${Date.now()}-${process.pid}.app`);
  let oldMoved = false, newInstalled = false;
  try {
    await cp(source, staging, { recursive: true, verbatimSymlinks: true });
    await sign(staging);
    await verify(staging);
    if (await exists(destination)) {
      await rename(destination, rollback);
      oldMoved = true;
    }
    await rename(staging, destination);
    newInstalled = true;
    await verify(destination);
  } catch (error) {
    if (newInstalled) await rm(destination, { recursive: true, force: true });
    if (oldMoved) await rename(rollback, destination);
    throw error;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  await rm(rollback, { recursive: true, force: true });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = path.join(os.homedir(), "Applications/Open Typora.app");
  await installBundle({
    source: path.resolve("release/native/Open Typora.app"), destination,
    running: execFileSync("/bin/ps", ["-axo", "command"], { encoding: "utf8" }),
    sign: file => execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", file], { stdio: "inherit" }),
    verify: file => execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", file], { stdio: "inherit" }),
  });
  console.log(`已安装：${destination}（旧应用已移除，文档数据保留）`);
}
