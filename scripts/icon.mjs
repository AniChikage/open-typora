import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="52" y="52" width="920" height="920" rx="205" fill="#555555"/><rect x="260" y="185" width="515" height="650" rx="25" fill="#FFFFFF"/><path d="M623 185h127c14 0 25 11 25 25v127z" fill="#EEEEEE"/><path d="M371 381c-62 0-96 55-96 143s34 143 96 143 96-55 96-143-34-143-96-143zm0 33c43 0 56 49 56 110s-13 110-56 110-56-49-56-110 13-110 56-110z" fill="#555555"/><path d="M463 409h226v40h-90v218h-45V449h-91z" fill="#555555"/><path d="M320 734h340" stroke="#D0D0D0" stroke-width="12" stroke-linecap="round"/></svg>`;
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
