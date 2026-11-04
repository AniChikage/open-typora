/** Copy settings and drafts on the existing origin; never delete the old keys.
 * New keys win on subsequent starts, including deliberately empty values.
 * A quota/security failure must not turn an existing draft into a new sample.
 */
export function migrateStorage(storage: Storage) {
  const oldPrefix = "open-typora-", newPrefix = "open-markdown-lane-";
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key !== null && key.startsWith(oldPrefix));
  for (const old of keys) {
    const next = newPrefix + old.slice(oldPrefix.length);
    if (storage.getItem(next) !== null) continue;
    const value = storage.getItem(old);
    if (value !== null) storage.setItem(next, value);
  }
}

export function storedItem(storage: Storage, key: string) {
  return storage.getItem(key) ?? storage.getItem(key.replace(/^open-markdown-lane-/, "open-typora-"));
}

// Restricted/quota-full storage may prevent copying. Reads still use the
// legacy value until a new value has actually been written successfully.
try { if (typeof localStorage !== "undefined") migrateStorage(localStorage); } catch {}
