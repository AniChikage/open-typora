import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const svg = await readFile(new URL("../design/icon.svg", import.meta.url), "utf8");
await mkdir("build/icon.iconset", { recursive: true });
await writeFile("build/icon.svg", svg);
await sharp(Buffer.from(svg)).resize(512, 512).png().toFile("build/icon.png");
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
// Windows accepts PNG-compressed images in a multi-resolution ICO container.
const images = await Promise.all([16, 24, 32, 48, 64, 128, 256].map(async size => ({
  size, bytes: await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer(),
})));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ size, bytes }, index) => {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(bytes.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += bytes.length;
});
await writeFile("build/icon.ico", Buffer.concat([header, ...images.map(image => image.bytes)]));
if (process.platform === "darwin") execFileSync("/usr/bin/iconutil", [
  "-c",
  "icns",
  "build/icon.iconset",
  "-o",
  "build/icon.icns",
]);
