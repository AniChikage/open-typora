import { useState } from 'react';
import type { ThemeCustomization } from '../themeCustomization';
import { customizationDefaults } from '../themeCustomization';
export function ThemeCustomizer({ value, change, reset, save }: { value: ThemeCustomization; change(value: ThemeCustomization): void; reset(): void; save(): Promise<void> }) {
  const [expanded, setExpanded] = useState(false), [error, setError] = useState('');
  return <div className="theme-customizer">
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>自定义当前主题</button>
    {expanded && <div className="theme-customizer-fields">
      <p className="dialog-note">设置只作用于当前主题，编辑区即时预览。CSS 可使用 .rich-document、.source-surface 和 .print-document；主题资源继续通过 CSS 导入。</p>
      <div className="form-grid">
        <label>正文字体<input aria-label="主题正文字体" placeholder={'"Open Sans", "PingFang SC", sans-serif'} value={value.fontFamily} maxLength={200} onChange={event => change({ ...value, fontFamily: event.target.value })}/></label>
        <label>代码字体<input aria-label="主题代码字体" placeholder="Menlo, Consolas, monospace" value={value.codeFontFamily} maxLength={200} onChange={event => change({ ...value, codeFontFamily: event.target.value })}/></label>
        <label>行高<input aria-label="主题行高" type="number" min={1.2} max={2.5} step={.1} value={value.lineHeight} onChange={event => { const n=Number(event.target.value); if(n>=1.2&&n<=2.5) change({...value,lineHeight:n}); }}/></label>
        <label>正文宽度（px）<input aria-label="主题正文宽度" type="number" min={480} max={1600} step={20} value={value.contentWidth} onChange={event => { const n=Number(event.target.value); if(n>=480&&n<=1600) change({...value,contentWidth:n}); }}/></label>
        <label>段落间距（px）<input aria-label="主题段落间距" type="number" min={0} max={40} step={1} value={value.paragraphSpacing} onChange={event => { const n=Number(event.target.value); if(n>=0&&n<=40) change({...value,paragraphSpacing:n}); }}/></label>
        {(['accent','paper','ink'] as const).map((key,index) => <label key={key}>{['强调色','纸张颜色','文字颜色'][index]}<span className="theme-color-field"><input aria-label={`主题${['强调色','纸张颜色','文字颜色'][index]}`} type="color" value={value[key] || ['#326eaa','#ffffff','#333333'][index]} onChange={event => change({...value,[key]:event.target.value})}/><button type="button" onClick={() => change({...value,[key]:''})}>跟随主题</button></span></label>)}
      </div>
      <label className="workspace-field">自定义 CSS<textarea aria-label="自定义主题 CSS" spellCheck={false} rows={6} maxLength={100000} value={value.css} placeholder=".rich-document h2 { color: var(--accent); }" onChange={event => change({...value,css:event.target.value})}/></label>
      <label className="workspace-field">打印专用 CSS<textarea aria-label="打印主题 CSS" spellCheck={false} rows={4} maxLength={100000} value={value.printCss} placeholder=".print-document h2 { break-before: page; }" onChange={event => change({...value,printCss:event.target.value})}/></label>
      <p className="dialog-note">打印 CSS 用于 HTML 打印和 PDF。可用 break-before、break-after、break-inside 控制分页；过高的内容仍会拆页。</p>
      <div className="theme-customizer-actions"><button type="button" onClick={() => { change({...customizationDefaults}); reset(); }}>恢复当前主题默认值</button><button type="button" onClick={() => void save().catch(error => setError(error.message))}>导出当前主题 CSS…</button></div>
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
