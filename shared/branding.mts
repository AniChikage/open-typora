import path from "node:path";
import { existsSync } from "node:fs";

export const productName = "Open Markdown Lane";
export const packageName = "open-markdown-lane";
// Keep installed application identity stable for OS defaults, WebKit storage,
// Windows upgrades and the pre-file-storage credential migration.
export const legacyApplicationId = "org.opentypora.desktop";

// Electron captures this name for Linux libsecret/KWallet before `ready`.
// Changing it would select a new encryption key for existing API credentials.
export function encryptionApplicationName(platform: string) {
  return platform === "linux" ? "Open Typora" : productName;
}

export function applicationDataDirectory(root: string, override?: string) {
  if (override) return override;
  const legacy = path.join(root, "Open Typora");
  return existsSync(legacy) ? legacy : path.join(root, productName);
}

export function applyLegacyEnvironment(environment: NodeJS.ProcessEnv) {
  for (const [key, value] of Object.entries(environment)) {
    if (!key.startsWith("OPEN_TYPORA_") || value === undefined) continue;
    const next = key.replace("OPEN_TYPORA_", "OPEN_MARKDOWN_LANE_");
    environment[next] ??= value;
  }
}
