import { Dialog } from "./Dialog";
import type { Preferences } from "../preferences";
export function PreferencesDialog({ value, change, theme, changeTheme, close }: { value: Preferences; change(next: Preferences): void; theme: string; changeTheme(theme: string): void; close(): void }) {
  const options = [["spellcheck", "拼写检查"], ["autoPair", "自动配对括号与引号"], ["highlight", "高亮：==文字=="], ["subscript", "下标：H~2~O"], ["superscript", "上标：X^2^"], ["emoji", "Emoji：:smile:"], ["inlineMath", "行内公式：$x^2$"]] as const;
  return <Dialog title="偏好设置" close={close}>
    <fieldset><legend>编辑器</legend><div className="form-grid">
      <label>主题<select aria-label="主题" value={theme} onChange={e => changeTheme(e.target.value)}><option value="light">明亮</option><option value="dark">深色</option></select></label>
      <label>正文字号<input type="number" min={12} max={28} value={value.fontSize} onChange={e => { const n = Number(e.target.value); if (n >= 12 && n <= 28) change({ ...value, fontSize: n }); }} /></label>
      <label>缩进宽度<select aria-label="缩进宽度" value={value.tabSize} onChange={e => change({ ...value, tabSize: Number(e.target.value) })}><option value={2}>2 个空格</option><option value={4}>4 个空格</option></select></label>
    </div></fieldset>
    <fieldset><legend>输入与 Markdown 扩展</legend>{options.map(([key, label]) => <label className="checkbox-option" key={key}><input type="checkbox" checked={value[key]} onChange={e => change({ ...value, [key]: e.target.checked })} />{label}</label>)}</fieldset>
    <p className="dialog-note">设置即时生效并保存在本机。关闭扩展不会修改文档源码。</p>
    <div className="dialog-actions"><button className="primary-button" onClick={close}>完成</button></div>
  </Dialog>;
}
