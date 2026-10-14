import { spawn } from "node:child_process";
import { setTimeout } from "node:timers/promises";
const children = new Set();
const child = (command, args, options = {}) => {
  const process = spawn(command, args, { stdio: "inherit", ...options });
  children.add(process);
  process.on("exit", () => children.delete(process));
  return process;
};
const server = child(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--host",
  "127.0.0.1",
  "--port",
  "5186",
  "--strictPort",
]);
let available = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await fetch("http://127.0.0.1:5186")).ok) {
      available = true;
      break;
    }
  } catch {}
  await setTimeout(200);
}
if (!available) {
  server.kill();
  throw new Error("开发服务器未能启动。");
}
const electron = child("node_modules/.bin/electron", ["."], {
  env: { ...process.env, OPEN_TYPORA_DEV_URL: "http://127.0.0.1:5186" },
});
const close = () => {
  for (const process of children) process.kill("SIGTERM");
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
electron.on("exit", close);
