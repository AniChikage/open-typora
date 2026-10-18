import dark from "../../third-party/typora-plugins/dark.js?typora-plugin";
import noImage from "../../third-party/typora-plugins/no_image.js?typora-plugin";
import blur from "../../third-party/typora-plugins/blur.js?typora-plugin";
import readOnly from "../../third-party/typora-plugins/read_only.js?typora-plugin";
import markers from "../../third-party/typora-plugins/static_markers.js?typora-plugin";
import collapseList from "../../third-party/typora-plugins/collapse_list.js?typora-plugin";
import type { PluginDefinition, PluginPreferences } from "./types";
export const bundledPlugins: PluginDefinition[] = [
  { id: "collapse_list", name: "列表折叠", description: "点击列表左侧三角折叠其余列表项，当前会话记住每份文档的折叠状态。", factory: collapseList, config: { RECORD_COLLAPSE: true, TRIANGLE_COLOR: "" } },
  { id: "read_only", name: "只读模式", description: "锁定正文、源码和编辑命令，安心阅读。", factory: readOnly, config: { READ_ONLY_DEFAULT: true, HOTKEY: "mod+alt+r", SHOW_TEXT: "只读", DISABLE_EXPAND_WHEN_READ_ONLY: true, AUTO_COLLAPSE_WHEN_READ_ONLY: true, CLICK_HYPERLINK_TO_OPEN_WHEN_READ_ONLY: false, DISABLE_CONTEXT_MENU_WHEN_READ_ONLY: false, REMAIN_AVAILABLE_MENU_KEY: [] } },
  { id: "no_image", name: "无图阅读", description: "暂时隐藏图片，鼠标悬停可查看。", factory: noImage, config: { NO_IMAGE_DEFAULT: true, SHOW_ON_HOVER: true, TRANSITION_DURATION: 200, TRANSITION_DELAY: 0, HOTKEY: "mod+alt+i" } },
  { id: "blur", name: "段落聚焦", description: "模糊光标之外的段落，悬停恢复清晰。", factory: blur, config: { BLUR_DEFAULT: true, BLUR_TYPE: "blur", BLUR_LEVEL: 3, RESTORE_ON_HOVER: true, HOTKEY: "mod+alt+shift+b" } },
  { id: "static_markers", name: "常显语法标记", description: "保留粗体、斜体、代码等 Markdown 符号。", factory: markers, config: { STATIC_DEFAULT: true, STATIC_MARKERS: ["strong", "em", "del", "underline", "highlight", "superscript", "subscript", "code", "inlineMath", "image", "link", "footnote"], HOTKEY: "mod+alt+m" } },
  { id: "dark", name: "反色夜间模式", description: "系统为浅色外观时反色显示，也可选用内置深色主题。", factory: dark, config: { DARK_DEFAULT: true, HOTKEY: "mod+alt+d" } },
].map(plugin => ({ ...plugin, builtin: true }));
export const pluginPreferenceKey = "open-typora-plugins-v1";
export function loadPluginPreferences(): PluginPreferences {
  try { const parsed = JSON.parse(localStorage.getItem(pluginPreferenceKey) || "{}"); return parsed && !Array.isArray(parsed) && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
}
