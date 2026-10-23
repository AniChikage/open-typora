export interface ThemeCustomization {
  fontFamily: string; codeFontFamily: string; lineHeight: number; contentWidth: number;
  paragraphSpacing: number; accent: string; paper: string; ink: string; css: string; printCss: string;
}
export const themeCustomizationKey = 'open-typora-theme-customizations-v1';
export const customizationDefaults: ThemeCustomization = { fontFamily: '', codeFontFamily: '', lineHeight: 1.6, contentWidth: 860, paragraphSpacing: 12.8, accent: '', paper: '', ink: '', css: '', printCss: '' };
export function normalizeCustomization(value: unknown): ThemeCustomization {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}, next = { ...customizationDefaults };
  for (const key of ['fontFamily', 'codeFontFamily'] as const) if (typeof raw[key] === 'string' && /^[\p{L}\p{N} ,"'._-]{0,200}$/u.test(raw[key])) next[key] = raw[key];
  for (const key of ['accent', 'paper', 'ink'] as const) if (typeof raw[key] === 'string' && /^#[\da-f]{6}$/i.test(raw[key])) next[key] = raw[key];
  for (const [key, min, max] of [['lineHeight', 1.2, 2.5], ['contentWidth', 480, 1600], ['paragraphSpacing', 0, 40]] as const) if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) next[key] = Math.max(min, Math.min(max, raw[key]));
  for (const key of ['css', 'printCss'] as const) if (typeof raw[key] === 'string') next[key] = raw[key].slice(0, 100_000);
  return next;
}
export function loadCustomizations(): Record<string, ThemeCustomization> {
  try { return Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem(themeCustomizationKey) || '{}')).slice(0, 100).map(([key, value]) => [key, normalizeCustomization(value)])); }
  catch { return {}; }
}
export function customizationCss(value: ThemeCustomization) {
  const next = normalizeCustomization(value), variables = [
    `--document-width:${next.contentWidth}px`, `--document-line-height:${next.lineHeight}`, `--paragraph-spacing:${next.paragraphSpacing}px`,
    ...(['accent','paper','ink'] as const).filter(key => next[key]).map(key => `--${key}:${next[key]}`),
    ...(next.fontFamily ? [`--document-font:${next.fontFamily}`] : []), ...(next.codeFontFamily ? [`--code-font:${next.codeFontFamily}`] : []),
  ];
  return `:root[data-theme][data-appearance]{${variables.join(';')}}\n` + next.css;
}
export function exportedThemeCss(base: string, value: ThemeCustomization) {
  return base + '\n' + customizationCss(value) + (value.printCss.trim() ? `\n@media print{\n${value.printCss}\n}` : '') + '\n';
}
