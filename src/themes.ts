import { customizationCss, customizationDefaults } from "./themeCustomization.ts";
import type { ThemeCustomization } from "./themeCustomization.ts";
export interface Theme { id: string; name: string; description: string; dark: boolean; paper: string; ink: string; accent: string; css: string }
const make = (id: string, name: string, description: string, dark: boolean, colors: string[], serif = false): Theme => {
  const [paper, sidebar, ink, muted, border, accent, code, selected] = colors;
  return { id, name, description, dark, paper, ink, accent, css: `:root[data-theme][data-appearance]{color-scheme:${dark ? "dark" : "light"};--paper:${paper};--sidebar:${sidebar};--ink:${ink};--muted:${muted};--border:${border};--heading-border:${border};--accent:${accent};--code:${code};--selected:${selected};--quote:${border};--selection:${selected};--document-font:${serif ? 'Georgia,"Songti SC","Noto Serif CJK SC",serif' : '"Open Sans",-apple-system,"PingFang SC","Microsoft YaHei",sans-serif'}}.rich-document,.print-document{font-family:var(--document-font)}.document-title{color:var(--muted)}.rich-document h1,.rich-document h2,.print-document h1,.print-document h2{border-color:var(--heading-border)}` };
};
export const builtInThemes: Theme[] = [
  make("light", "简白", "清晰的日常写作", false, ["#ffffff", "#fafafa", "#333333", "#707070", "#e5e5e5", "#326eaa", "#f6f7f8", "#e2ecf5"]),
  make("paper", "暖纸", "衬线字体 · 温暖纸色", false, ["#faf6ed", "#f0ebdf", "#403b32", "#797164", "#ded6c6", "#8c562d", "#f0eadf", "#e6d6bb"], true),
  make("mist", "青墨", "低饱和 · 清爽阅读", false, ["#f3f7f6", "#eaf0ee", "#263f3a", "#61766f", "#d4e0dc", "#276d60", "#e7efeb", "#cde3da"]),
  make("dark", "石墨", "柔和中灰 · 夜间写作", true, ["#30343a", "#282c31", "#e3e6ea", "#a8afb9", "#484e57", "#9dc5eb", "#272b31", "#465d76"]),
  make("midnight", "深海", "深蓝底色 · 安静专注", true, ["#171e2c", "#131a26", "#d9e2f0", "#9eacc3", "#303e54", "#a6c7f5", "#111925", "#354d70"]),
  make("forest", "松夜", "墨绿底色 · 柔和对比", true, ["#1d2925", "#18221f", "#dde6de", "#a0b3a7", "#394c43", "#b6d6b6", "#17211d", "#3a5846"], true),
];
export function adaptThemeCss(css: string) {
  return css.replace(/#write\b/g, ":is(.rich-document,.print-document)").replace(/#typora-sidebar\b/g, ".sidebar").replace(/\.md-fences\b/g, ".md-fence");
}
export function applyTheme(id: string, custom: { id: string; css: string }[] = [], customization: ThemeCustomization = customizationDefaults) {
  const builtin = builtInThemes.find(theme => theme.id === id) || builtInThemes[0];
  const selected = custom.find(theme => id === "custom:" + theme.id);
  const style = document.createElement("style"); style.dataset.customTheme = "true";
  style.textContent = builtin.css + (selected ? adaptThemeCss(selected.css) + ":root[data-theme][data-appearance]{--paper:var(--bg-color,#fff);--ink:var(--text-color,#333);--sidebar:var(--side-bar-bg-color,#fafafa);--accent:var(--primary-color,#326eaa)}" : "");
  style.textContent += "\n" + adaptThemeCss(customizationCss(customization));
  const print = document.createElement("style"); print.dataset.printTheme = "true"; print.media = "print"; print.textContent = adaptThemeCss(customization.printCss);
  document.head.append(style, print);
  document.documentElement.dataset.theme = id;
  document.documentElement.dataset.appearance = builtin.dark ? "dark" : "light";
  return () => { style.remove(); print.remove(); };
}
