import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const svg = await readFile(new URL("../design/icon.svg", import.meta.url), "utf8");
await mkdir("build/icon.iconset", { recursive: true });
await writeFile("build/icon.svg", svg);
for (const size of [16, 32, 128, 256, 512]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`build/icon.iconset/icon_${size}x${size}.png`);
  await sharp(Buffer.from(svg))
    .resize(size * 2, size * 2)
    .png()
    .toFile(`build/icon.iconset/icon_${size}x${size}@2x.png`);
}
execFileSync("/usr/bin/iconutil", [
  "-c",
  "icns",
  "build/icon.iconset",
  "-o",
  "build/icon.icns",
]);
