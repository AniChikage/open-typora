import { readFile, readdir, mkdir, cp, writeFile } from "node:fs/promises";
import path from "node:path";
export async function licenseNotices(destination) {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8")),
    entries = [];
  await mkdir(destination, { recursive: true });
  for (const [location, metadata] of Object.entries(lock.packages)) {
    if (!location.startsWith("node_modules/") || metadata.dev) continue;
    let pkg;
    try {
      pkg = JSON.parse(
        await readFile(path.join(location, "package.json"), "utf8"),
      );
    } catch {
      continue;
    }
    const identifier = `${pkg.name.replaceAll("/", "__")}@${pkg.version}`,
      files = (await readdir(location)).filter((file) =>
        /^(license|licence|copying|notice)(\.|$|[-_])/i.test(file),
      );
    if (files.length) {
      const folder = path.join(destination, identifier);
      await mkdir(folder, { recursive: true });
      for (const file of files)
        await cp(path.join(location, file), path.join(folder, file), {
          recursive: true,
        });
    }
    entries.push({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license || metadata.license || "See upstream license",
      repository: pkg.repository,
      files: files.map((file) => `${identifier}/${file}`),
    });
  }
  await writeFile(
    path.join(destination, "index.json"),
    JSON.stringify(entries, null, 2),
  );
}
