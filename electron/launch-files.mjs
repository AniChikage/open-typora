import path from "node:path";
import { fileURLToPath } from "node:url";

// Electron development has an extra app-directory argument. Installed file
// associations pass the document after the executable on Windows.
export function launchFiles(argv, packaged, cwd = process.cwd()) {
  return [...new Set(argv.slice(packaged ? 1 : 2).map(value => {
    if (!value.startsWith("file:")) return value;
    try { return fileURLToPath(value); } catch { return ""; }
  })
    .filter(value => !value.startsWith("-") && /\.(md|markdown|mdown)$/i.test(value))
    .map(value => path.resolve(cwd, value)))];
}
