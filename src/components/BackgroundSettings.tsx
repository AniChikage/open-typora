import { t } from "../i18n";
import { useState } from "react";
import { backgroundDefaults, backgroundStyle } from "../background";
import type { BackgroundAsset } from "../background";
import type { Preferences } from "../preferences";
export function BackgroundSettings({ asset, value, change, choose, clear }: { asset: BackgroundAsset | null; value: Preferences; change(value: Preferences): void; choose(): Promise<void>; clear(): Promise<void> }) {
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <fieldset className="background-settings"><legend>{t("背景图片")}</legend>
    <div className="background-preview" aria-label={t("背景效果预览")}>
      {asset && <div className="background-image" style={backgroundStyle(asset,value)} />}
      <div className="background-preview-text"><strong>A quieter place to write.</strong><span>{t("让文字，回到文字。")}</span></div>
    </div>
    <div className="background-file"><span title={asset?.name}>{asset?.name || t("跟随主题背景")}</span><button disabled={busy} onClick={() => void perform(choose)}>{busy ? t("正在处理…") : asset ? t("更换图片…") : t("选择图片…")}</button>{asset && <button disabled={busy} onClick={() => void perform(clear)}>{t("清除背景")}</button>}</div>
    <div className="background-controls">
      <label>{t("不透明度")}<output>{value.backgroundOpacity}%</output><input aria-label={t("背景不透明度")} type="range" min="0" max="100" value={value.backgroundOpacity} disabled={!asset || busy} onChange={event => change({...value,backgroundOpacity:Number(event.target.value)})} /></label>
      <label>{t("模糊")}<output>{value.backgroundBlur} px</output><input aria-label={t("背景模糊")} type="range" min="0" max="30" value={value.backgroundBlur} disabled={!asset || busy} onChange={event => change({...value,backgroundBlur:Number(event.target.value)})} /></label>
      <label>{t("显示方式")}<select aria-label={t("背景显示方式")} value={value.backgroundSize} disabled={!asset || busy} onChange={event => change({...value,backgroundSize:event.target.value as Preferences["backgroundSize"]})}><option value="cover">{t("填满")}</option><option value="contain">{t("完整显示")}</option><option value="repeat">{t("平铺")}</option></select></label>
      <label>{t("位置")}<select aria-label={t("背景位置")} value={value.backgroundPosition} disabled={!asset || busy} onChange={event => change({...value,backgroundPosition:event.target.value as Preferences["backgroundPosition"]})}><option value="center">{t("居中")}</option><option value="top">{t("顶部")}</option><option value="bottom">{t("底部")}</option><option value="left">{t("左侧")}</option><option value="right">{t("右侧")}</option></select></label>
    </div>
    {asset && <button className="background-reset" onClick={() => change({...value,...backgroundDefaults})}>{t("重置效果")}</button>}
    <p className="dialog-note">{t("PNG、JPEG、WebP，最多 8 MB。图片仅保存在本机，应用于所有主题的编辑区，不写入文档或导出文件。")}</p>
    {error && <p role="alert" className="form-error">{t(error)}</p>}
  </fieldset>;
}
