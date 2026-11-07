export type AppLocale = 'zh-CN' | 'en';

export function normalizeLocale(value: unknown): AppLocale {
  return typeof value === 'string' && /^zh(?:[-_@.]|$)/i.test(value.trim()) ? 'zh-CN' : 'en';
}

// LC_ALL overrides the category locale, which overrides LANG. C/POSIX and
// unsupported languages intentionally fall back to English.
export function systemLocale(platform: string, environment: Record<string, string | undefined>, preferred = ''): AppLocale {
  const value = platform === 'linux'
    ? environment.LC_ALL || environment.LC_MESSAGES || environment.LANG || preferred
    : preferred;
  return normalizeLocale(value);
}

export function preferredLocale(saved: unknown, system: unknown): AppLocale {
  return saved === 'en' || saved === 'zh-CN' ? saved : normalizeLocale(system);
}
