import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pkg from "../package.json" with { type: "json" };
import { licenseNotices } from "./license-notices.mts";

// Ship only the Node file bridge's dependencies; Vite bundles the editor.
export async function prepareElectronApplication(platform: "linux" | "windows") {
  const application = path.resolve(`build/${platform}-app`);
  await rm(application, { recursive: true, force: true });
  await mkdir(application, { recursive: true });
  for (const folder of ["dist", "electron", "shared"]) await cp(folder === "dist" ? folder : `build/runtime/${folder}`, path.join(application, folder), { recursive: true, filter: source => !/\.d\.[cm]?ts$/.test(source) });
  for (const name of ["iconv-lite", "safer-buffer"]) await cp(`node_modules/${name}`, path.join(application, "node_modules", name), { recursive: true });
  await cp("LICENSE", path.join(application, "LICENSE"));
  await cp("build/icon.png", path.join(application, "icon.png"));
  await licenseNotices(path.join(application, "ThirdPartyLicenses"));
  await cp("third-party/typora-plugins", path.join(application, "ThirdPartyLicenses/typora-plugins"), { recursive: true });
  await writeFile(path.join(application, "package.json"), JSON.stringify({
    name: pkg.name, version: pkg.version, description: pkg.description,
    main: "electron/main.mjs", type: "module", license: pkg.license, author: pkg.author,
    ...(platform === "linux" ? { desktopName: "open-typora.desktop" } : {}),
    homepage: pkg.homepage, dependencies: { "iconv-lite": pkg.dependencies["iconv-lite"] },
  }, null, 2));
  return application;
}
