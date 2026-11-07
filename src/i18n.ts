import { initialLocale } from './initialLocale.ts';
import { useSyncExternalStore } from 'react';
import { translate } from '../shared/translate.mts';
import type { Locale } from '../shared/translate.mts';
export type { Locale };
let language: Locale = initialLocale();
const listeners = new Set<() => void>();
export function t(source: string, ...values: (string | number)[]) { return translate(language, source, ...values); }
export function locale() { return language; }
export function setLanguage(value: Locale) {
  if (language === value) return;
  language = value; document.documentElement.lang = value;
  for (const listener of listeners) listener();
}
export function useLanguage() { return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, locale); }
