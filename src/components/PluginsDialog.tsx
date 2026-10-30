import { t } from "../i18n";
import { useState } from "react";
import { Dialog } from "./Dialog";
import type { PluginDefinition, PluginPreferences, PluginState, PluginAction } from "../plugins/types";
function PluginSettings({ definition, apply }: { definition: PluginDefinition; apply(config: Record<string, any>): void }) {
  const [text, setText] = useState(JSON.stringify(definition.config, null, 2)), [error, setError] = useState("");
  return <details className="plugin-options"><summary>{t("插件设置")}</summary><label>{t("配置")}<textarea aria-label={t("{0}配置", definition.name)} spellCheck={false} value={text} onChange={event => setText(event.target.value)} /></label><button onClick={() => { try { const config = JSON.parse(text); if (!config || Array.isArray(config) || typeof config !== "object") throw new Error(t("请输入 JSON 对象。")); apply(config); setError(""); } catch (error) { setError((error as Error).message); } }}>{t("应用设置")}</button>{error && <p role="alert" className="form-error">{t(error)}</p>}</details>;
}
export function PluginsDialog({ definitions, preferences, states, toggle, configure, invoke, actions, install, remove, close }: { definitions: PluginDefinition[]; preferences: PluginPreferences; states: Record<string, PluginState>; toggle(id: string, value: boolean): void; configure(id: string, config: Record<string, any>): void; invoke(id: string, action?: string): Promise<void>; actions(id: string): PluginAction[]; install(folder?: boolean): Promise<void>; remove(id: string): Promise<void>; close(): void }) {
  const [trust, setTrust] = useState(false), [accepted, setAccepted] = useState(false), [error, setError] = useState("");
  const [commands,setCommands] = useState<{id:string;items:PluginAction[]} | null>(null);
  return <Dialog title={t("插件管理")} close={close}>
    <div className="plugin-intro"><p>{t("六款社区插件，已经随应用离线提供。")}</p><p className="dialog-note">{t("运行 obgnail/typora_plugin 所列插件的原版源码，也可安装使用相同接口的插件文件或文件夹。支持文件夹内的 CommonJS、JSON、CSS 引用；Node/Electron、npm 依赖和未适配的 Typora 私有接口暂不支持。")}</p></div>
    <div className="plugin-list">{definitions.map(definition => { const state = states[definition.id], enabled = preferences[definition.id]?.enabled || false; return <section className="plugin-card" key={definition.id}>
      <div className="plugin-card-top"><div><h3>{t(definition.name)}</h3><span className="plugin-origin">{definition.builtin ? t("社区插件 · 随应用提供") : t("本地安装")}</span></div><label className="plugin-toggle"><input type="checkbox" aria-label={t("启用{0}", definition.name)} checked={enabled} disabled={state?.status === "loading"} onChange={event => toggle(definition.id, event.target.checked)} /><span>{state?.status === "loading" ? t("正在加载") : state?.status === "error" ? t("加载失败") : enabled ? t("已启用") : t("未启用")}</span></label></div>
      <p>{t(definition.description)}</p>
      {state?.status === "error" && <p role="alert" className="form-error">{t("加载失败：")}{t(state.error || "")}</p>}
      <div className="plugin-actions"><code>{definition.config.HOTKEY || t("未设置快捷键")}</code>{definition.id !== "collapse_list" && <button disabled={state?.status !== "ready"} onClick={() => void invoke(definition.id)}>{t("切换效果")}</button>}<button disabled={state?.status !== "ready"} onClick={() => setCommands({id:definition.id,items:actions(definition.id)})}>{t("插件命令…")}</button></div>
      {commands?.id===definition.id && state?.status==='ready' && <div aria-label={t("{0}命令", definition.name)}>{commands.items.length ? commands.items.map(action=><button key={action.value} disabled={action.disabled} aria-pressed={action.checked} onClick={() => void invoke(definition.id,action.value).then(()=>setCommands({id:definition.id,items:actions(definition.id)}))}>{action.name}</button>) : <p className="dialog-note">{t("此插件未提供额外命令。")}</p>}</div>}
      <PluginSettings key={JSON.stringify(definition.config)} definition={definition} apply={config => configure(definition.id, config)} />
      {!definition.builtin && <button className="plugin-remove" onClick={() => void remove(definition.id).catch(error => setError(error.message))}>{t("移除插件")}</button>}
    </section>; })}</div>
    {trust ? <div className="plugin-trust"><h3>{t("安装本地插件")}</h3><p>{t("插件代码可以读取、修改已打开的文档，并调用编辑器的桌面接口。请仅安装你信任的源码。")}</p><p className="dialog-note">{t("选择 BasePlugin / BaseCustomPlugin 入口文件（.js / .cjs），或包含 index.js / package.json main 的文件夹。文件夹仅收集 JS、CJS、JSON、CSS，最多 64 个文件、共 4 MB，单文件不超过 1 MB；跳过隐藏目录和 node_modules。安装后默认关闭；完整 Typora 插件发行包不能直接运行。")}</p><label className="checkbox-option"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />{t("我信任将要安装的插件源码")}</label><div className="dialog-actions"><button onClick={() => setTrust(false)}>{t("取消")}</button><button disabled={!accepted} onClick={() => void install().then(() => { setTrust(false); setAccepted(false); }).catch(error => setError(error.message))}>{t("选择插件并安装…")}</button><button disabled={!accepted} onClick={() => void install(true).then(() => { setTrust(false); setAccepted(false); }).catch(error => setError(error.message))}>{t("选择插件文件夹…")}</button></div></div> : <button className="plugin-install" onClick={() => setTrust(true)}>{t("安装本地插件…")}</button>}
    {error && <p className="form-error" role="alert">{t(error)}</p>}
    <div className="dialog-actions"><button className="primary-button" onClick={close}>{t("完成")}</button></div>
  </Dialog>;
}
