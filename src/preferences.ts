export interface Preferences {
  fontSize: number; tabSize: number; spellcheck: boolean; autoPair: boolean;
  highlight: boolean; subscript: boolean; superscript: boolean; emoji: boolean; inlineMath: boolean;
}
export const defaultPreferences: Preferences = { fontSize: 16, tabSize: 2, spellcheck: true, autoPair: true, highlight: true, subscript: true, superscript: true, emoji: true, inlineMath: true };
export function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem("open-typora-preferences") || "{}");
    const next = { ...defaultPreferences };
    for (const key of ["spellcheck", "autoPair", "highlight", "subscript", "superscript", "emoji", "inlineMath"] as const) if (typeof saved[key] === "boolean") next[key] = saved[key];
    if (Number.isFinite(saved.fontSize)) next.fontSize = Math.max(12, Math.min(28, saved.fontSize));
    if ([2, 4].includes(saved.tabSize)) next.tabSize = saved.tabSize;
    return next;
  } catch { return { ...defaultPreferences }; }
}
