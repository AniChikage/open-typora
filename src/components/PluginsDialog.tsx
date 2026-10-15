import { useState } from "react";
import { Dialog } from "./Dialog";
import type { PluginDefinition, PluginPreferences, PluginState } from "../plugins/types";
function PluginSettings({ definition, apply }: { definition: PluginDefinition; apply(config: Record<string, any>): void }) {
  const [text, setText] = useState(JSON.stringify(definition.config, null, 2)), [error, setError] = useState("");
  return <details className="plugin-options"><summary>插件设置</summary><label>配置<textarea aria-label={`${definition.name}配置`} spellCheck={false} value={text} onChange={event => setText(event.target.value)} /></label><button onClick={() => { try { const config = JSON.parse(text); if (!config || Array.isArray(config) || typeof config !== "object") throw new Error("请输入 JSON 对象。"); apply(config); setError(""); } catch (error) { setError((error as Error).message); } }}>应用设置</button>{error && <p role="alert" className="form-error">{error}</p>}</details>;
}
export function PluginsDialog({ definitions, preferences, states, toggle, configure, invoke, install, remove, close }: { definitions: PluginDefinition[]; preferences: PluginPreferences; states: Record<string, PluginState>; toggle(id: string, value: boolean): void; configure(id: string, config: Record<string, any>): void; invoke(id: string): void; install(): Promise<void>; remove(id: string): Promise<void>; close(): void }) {
  const [trust, setTrust] = useState(false), [accepted, setAccepted] = useState(false), [error, setError] = useState("");
  return <Dialog title="插件管理" close={close}>
    <div className="plugin-intro"><p>五款社区插件，已经随应用离线提供。</p><p className="dialog-note">运行 obgnail/typora_plugin 所列插件的原版源码，也可安装使用相同接口的单文件插件。依赖 Node/Electron、第三方模块或其他 Typora 私有接口的插件暂不支持。</p></div>
    <div className="plugin-list">{definitions.map(definition => { const state = states[definition.id], enabled = preferences[definition.id]?.enabled || false; return <section className="plugin-card" key={definition.id}>
      <div className="plugin-card-top"><div><h3>{definition.name}</h3><span className="plugin-origin">{definition.builtin ? "社区插件 · 随应用提供" : "本地安装"}</span></div><label className="plugin-toggle"><input type="checkbox" aria-label={`启用${definition.name}`} checked={enabled} disabled={state?.status === "loading"} onChange={event => toggle(definition.id, event.target.checked)} /><span>{state?.status === "loading" ? "正在加载" : state?.status === "error" ? "加载失败" : enabled ? "已启用" : "未启用"}</span></label></div>
      <p>{definition.description}</p>
      {state?.status === "error" && <p role="alert" className="form-error">加载失败：{state.error}</p>}
      <div className="plugin-actions"><code>{definition.config.HOTKEY || "未设置快捷键"}</code><button disabled={state?.status !== "ready"} onClick={() => invoke(definition.id)}>切换效果</button></div>
      <PluginSettings key={JSON.stringify(definition.config)} definition={definition} apply={config => configure(definition.id, config)} />
      {!definition.builtin && <button className="plugin-remove" onClick={() => void remove(definition.id).catch(error => setError(error.message))}>移除插件</button>}
    </section>; })}</div>
    {trust ? <div className="plugin-trust"><h3>安装本地插件</h3><p>插件代码可以读取、修改已打开的文档，并调用编辑器的桌面接口。请仅安装你信任的源码。</p><p className="dialog-note">选择单文件 BasePlugin / BaseCustomPlugin 插件（.js / .cjs，UTF-8，最多 1 MB）。安装后默认关闭；完整插件包、Node 模块和 Electron 注入插件不能直接运行。</p><label className="checkbox-option"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />我信任将要安装的插件源码</label><div className="dialog-actions"><button onClick={() => setTrust(false)}>取消</button><button disabled={!accepted} onClick={() => void install().then(() => { setTrust(false); setAccepted(false); }).catch(error => setError(error.message))}>选择插件并安装…</button></div></div> : <button className="plugin-install" onClick={() => setTrust(true)}>安装本地插件…</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="primary-button" onClick={close}>完成</button></div>
  </Dialog>;
}
