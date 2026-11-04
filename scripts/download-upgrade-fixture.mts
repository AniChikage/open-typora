// Resolve a real, checksum-verified prior release without depending on retired assets.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const repository = "AniChikage/open-markdown-lane";
interface Asset {name: string; browser_download_url: string}
export function selectUpgradeAssets(release: {tag_name: string; draft: boolean; prerelease: boolean; assets: Asset[]}, platform: string) {
  assert.match(release.tag_name, /^v\d+\.\d+\.\d+$/);
  assert.equal(release.draft || release.prerelease, false);
  assert.ok(platform === "linux" || platform === "windows");
  const suffix = platform === "linux" ? "linux-x64.deb" : "windows-x64-Setup.exe";
  const version = release.tag_name.slice(1);
  const installers = release.assets.filter(a => ["Open-Typora", "Open-Markdown-Lane"].some(prefix => a.name === `${prefix}-${version}-${suffix}`));
  const sums = release.assets.filter(a => a.name === "SHA256SUMS.txt");
  assert.equal(installers.length, 1, "Expected exactly one previous installer");
  assert.equal(sums.length, 1, "Expected one release checksum manifest");
  for (const asset of [installers[0], sums[0]]) {
    assert.equal(asset.browser_download_url, `https://github.com/${repository}/releases/download/${release.tag_name}/${asset.name}`);
  }
  return {installer: installers[0], sums: sums[0]};
}
export function verifyUpgradeChecksum(manifest: string, name: string, bytes: Uint8Array) {
  const rows = manifest.split(/\r?\n/).filter(Boolean).map(row => /^([a-fA-F0-9]{64}) [ *](.+)$/.exec(row));
  assert.ok(rows.every(Boolean), "Malformed release checksum manifest");
  const matches = rows.filter(row => row![2] === name);
  assert.equal(matches.length, 1, "Missing or duplicate installer checksum");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, matches[0]![1].toLowerCase(), "Previous installer checksum mismatch");
  return sha256;
}
async function download(url: string, headers: Record<string,string> = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {headers, signal: AbortSignal.timeout(180_000)});
      if (!response.ok) throw new Error(`Upgrade fixture HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) { if (attempt === 2) throw error; }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const platform = process.argv[2];
  const headers: Record<string,string> = {Accept:"application/vnd.github+json"};
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const release = JSON.parse((await download(`https://api.github.com/repos/${repository}/releases/latest`, headers)).toString());
  const {installer, sums} = selectUpgradeAssets(release, platform);
  const manifest = (await download(sums.browser_download_url)).toString();
  const bytes = await download(installer.browser_download_url);
  const sha256 = verifyUpgradeChecksum(manifest, installer.name, bytes);
  const folder = path.resolve("build/upgrade-fixtures"); await mkdir(folder, {recursive:true});
  const file = path.join(folder, installer.name); await writeFile(file, bytes);
  await writeFile(path.join(folder, `${platform}.json`), JSON.stringify({tag:release.tag_name, file, sha256, legacyName:installer.name.startsWith("Open-Typora-")}, null, 2));
  console.log(`Verified previous ${platform} installer: ${release.tag_name} (${sha256})`);
}
