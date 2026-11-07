import { storedItem } from './migrateStorage.ts';
import { normalizeLocale, preferredLocale } from '../shared/locale.mts';

let system = normalizeLocale(typeof navigator === 'undefined' ? '' : navigator.language);
export function setSystemLocale(value: string) { system = normalizeLocale(value); }
export function systemLocale() { return system; }
export function initialLocale() {
  try {
    const saved = JSON.parse(storedItem(localStorage, 'open-markdown-lane-preferences') || '{}');
    return preferredLocale(saved?.languageMode === 'system' ? undefined : saved?.language, system);
  } catch { return system; }
}
