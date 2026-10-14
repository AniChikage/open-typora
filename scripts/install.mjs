import { cp, mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
const folder = path.join(os.homedir(), "Applications");
const source = path.resolve("release/native/Open Typora.app");
const destination = path.join(folder, "Open Typora.app");
const running = execFileSync("/bin/ps", ["-axo", "command"], {
  encoding: "utf8",
});
if (running.includes(`${destination}/Contents/`))
  throw new Error("请先正常退出已安装的 Open Typora，再运行安装。");
await stat(source);
await mkdir(folder, { recursive: true });
const staging = path.join(folder, `.Open Typora-${Date.now()}.app`);
await cp(source, staging, { recursive: true, verbatimSymlinks: true });
execFileSync(
  "/usr/bin/codesign",
  ["--force", "--deep", "--sign", "-", "--timestamp=none", staging],
  { stdio: "inherit" },
);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", staging], {
  stdio: "inherit",
});
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
