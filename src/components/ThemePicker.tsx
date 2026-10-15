import { builtInThemes } from "../themes";
export function ThemePicker({ value, change, custom, install }: { value: string; change(id: string): void; custom: { id: string; name: string }[]; install(): Promise<void> }) {
  return <fieldset className="theme-settings"><legend>外观</legend>
    <div className="theme-grid" role="group" aria-label="内置主题">{builtInThemes.map(theme => <button type="button" key={theme.id} className="theme-choice" aria-label={`使用${theme.name}主题`} aria-pressed={value === theme.id} onClick={() => change(theme.id)}>
      <span className="theme-preview" style={{ background: theme.paper, color: theme.ink }}><span className="theme-preview-side" style={{ background: theme.accent }} /><span className="theme-preview-text"><b style={{ color: theme.accent }}>Aa</b><i /><i /><i /></span>{value === theme.id && <span className="theme-check">✓</span>}</span>
      <span className="theme-choice-name">{theme.name}</span><span className="theme-choice-note">{theme.description}</span>
    </button>)}</div>
    <div className="theme-import"><label>主题<select aria-label="主题" value={value} onChange={event => change(event.target.value)}><optgroup label="内置主题">{builtInThemes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</optgroup>{custom.length > 0 && <optgroup label="自定义主题">{custom.map(theme => <option key={theme.id} value={"custom:" + theme.id}>{theme.name}</option>)}</optgroup>}</select></label><button type="button" onClick={() => void install()}>安装 CSS 主题…</button></div>
  </fieldset>;
}
