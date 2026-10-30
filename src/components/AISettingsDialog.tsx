import { t } from "../i18n";
import { useEffect, useRef, useState } from "react";
import type { AIConfig, AISettings } from "../../shared/contracts";
import { host } from "../host";
import { Dialog } from "./Dialog";
import { imeKey } from "../editor/composition";

export function AISettingsDialog({ close, saved }: { close(): void; saved(): void }) {
  const [config, setConfig] = useState<AIConfig>({ protocol: "openai", baseUrl: "", model: "" });
  const [original, setOriginal] = useState<AISettings | null>(null), [remember, setRemember] = useState(true);
  const [clearKey, setClearKey] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  const formComposing = useRef(false);
  const keyInput = useRef<HTMLInputElement>(null), testId = useRef(""), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (host.native) void host.aiSettings().then(value => { if (!alive.current) return; setOriginal(value); setConfig({ protocol: value.protocol, baseUrl: value.baseUrl, model: value.model }); setRemember((value.persistentStorage === "file" || value.secureStorage) && value.keyStorage !== "session"); }).catch(error => { if (alive.current) setError(error.message); }).finally(() => { if (alive.current) setLoading(false); });
    else setLoading(false);
    return () => { alive.current = false; if (testId.current) void host.aiCancel(testId.current).catch(() => {}); };
  }, []);
  async function save(test = false, migrateLegacyKey = false) {
    if (busy || formComposing.current) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const value = await host.aiSettings({ ...config, apiKey: keyInput.current?.value || undefined, clearKey, rememberKey: migrateLegacyKey || remember, migrateLegacyKey });
      saved();
      if (!alive.current) return;
      if (keyInput.current) keyInput.current.value = "";
      setOriginal(value); setRemember((value.persistentStorage === "file" || value.secureStorage) && value.keyStorage !== "session"); setClearKey(false); setConfig({ protocol: value.protocol, baseUrl: value.baseUrl, model: value.model });
      if (test) {
        testId.current = crypto.randomUUID();
        await host.aiRewrite({ id: testId.current, instruction: t("请只返回：连接成功"), text: t("你好") });
        if (alive.current) setStatus(t("连接成功，已收到模型的实际回复。"));
      } else setStatus(value.hasKey ? value.keyStorage === "file" ? t("已保存，密钥明文保存在本机配置文件中，不再访问钥匙串。") : value.keyStorage === "system" ? t("已保存，密钥由系统安全存储保护。") : t("已保存，密钥仅用于本次会话。") : t("已保存，无 API 密钥。"));
    } catch (error) { if (alive.current) setError((error as Error).message); }
    finally { testId.current = ""; if (alive.current) setBusy(false); }
  }
  const fileStorage = original?.persistentStorage === "file";
  const existingKey = !!original?.hasKey && config.baseUrl === original.baseUrl && config.protocol === original.protocol && !clearKey;
  return <Dialog title={t("模型设置")} close={close}>
    {!host.native ? <p className="dialog-note">{t("模型配置与 AI 改写请使用桌面应用。")}</p> : <form className="ai-settings" onCompositionStartCapture={() => { formComposing.current = true; }} onCompositionEndCapture={() => { formComposing.current = false; }} onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="dialog-note">{t("连接你自己的模型服务。只有点击改写或测试连接时才会发送请求。")}</p>
      <label>{t("接口格式")}<select aria-label={t("模型接口格式")} value={config.protocol} disabled={loading || busy} onChange={event => {
        const protocol = event.target.value as AIConfig["protocol"];
        setConfig(previous => ({ ...previous, protocol, baseUrl: !previous.baseUrl || /^http:\/\/(?:127\.0\.0\.1|localhost):(?:11434|1234)(?:\/v1)?$/.test(previous.baseUrl) ? protocol === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234/v1" : previous.baseUrl })); setStatus("");
      }}><option value="openai">{t("OpenAI 兼容 API / LM Studio")}</option><option value="ollama">{t("Ollama 原生接口")}</option></select></label>
      <label>{t("服务地址")}<input aria-label={t("模型服务地址")} type="url" autoComplete="off" spellCheck={false} value={config.baseUrl} disabled={loading || busy} placeholder={config.protocol === "ollama" ? "http://127.0.0.1:11434" : t("https://你的服务地址/v1")} onChange={event => { setConfig(previous => ({ ...previous, baseUrl: event.target.value })); setStatus(""); }} /></label>
      <p className="dialog-note">{config.protocol === "ollama" ? t("可填 Ollama 服务根地址，或完整的 /api/chat 地址。") : t("可填 API 基础地址（通常以 /v1 结尾），或完整的 /chat/completions 地址。")}{t("地址中不要包含密钥。")}</p>
      <label>{t("模型名称")}<input aria-label={t("模型名称")} autoComplete="off" spellCheck={false} value={config.model} disabled={loading || busy} placeholder={t("填写服务中实际可用的模型 ID")} onChange={event => { setConfig(previous => ({ ...previous, model: event.target.value })); setStatus(""); }} /></label>
      <label>{t("API 密钥")}<input ref={keyInput} aria-label={t("模型 API 密钥")} type="password" autoComplete="off" spellCheck={false} disabled={loading || busy} placeholder={existingKey ? original?.needsKeyMigration ? t("旧密钥待迁移，也可重新填写") : t("已保存；留空保留现有密钥") : t("本地服务可留空，取决于服务配置")} onInput={() => { setClearKey(false); setStatus(""); }} /></label>
      <p className="dialog-note">{clearKey ? t("保存后将移除现有密钥。") : existingKey ? t("密钥不会回传到界面。更换服务地址后，请重新填写对应密钥。") : t("只对当前服务地址使用此密钥。")}</p>
      {original?.hasKey && <button type="button" disabled={busy} onClick={() => { setClearKey(true); if (keyInput.current) keyInput.current.value = ""; }}>{t("移除已保存密钥")}</button>}
      <label className="checkbox-option"><input aria-label={t("记住模型密钥")} type="checkbox" checked={remember} disabled={loading || busy || !fileStorage && original?.secureStorage === false} onChange={event => setRemember(event.target.checked)} />{fileStorage ? t("保存密钥到本机配置文件") : t("使用系统安全存储记住密钥")}</label>
      <p className="dialog-note">{fileStorage ? t("密钥明文保存在本机 ai-settings.json，文件权限为仅当前用户可读写。取消勾选后，退出应用即清除会话密钥。") : original?.secureStorage === false ? t("本机安全存储不可用，密钥只会保留到本次应用退出。") : t("密钥使用系统保护的加密存储。取消勾选后，退出应用即清除会话密钥。")}</p>
      {original?.needsKeyMigration && !clearKey && <div className="dialog-note"><p>{t("旧版配置需要迁移密钥或重新填写。点击迁移可能需要最后一次授权，之后都读配置文件；无需密钥的服务可清除当前密钥后保存。")}</p><button type="button" disabled={loading || busy} onClick={() => void save(false, true)}>{t("迁移旧密钥到配置文件")}</button></div>}
      {error && <p className="form-error" role="alert">{t(error)}</p>}
      {status && <p className="ai-status" role="status">{status}</p>}
      <div className="dialog-actions"><button type="button" disabled={loading || busy} onClick={() => void save(true)}>{t("保存并测试连接")}</button><button className="primary-button" type="submit" disabled={loading || busy} onKeyDown={event => { if (imeKey(event.nativeEvent)) event.preventDefault(); }}>{busy ? t("正在处理…") : t("保存设置")}</button></div>
    </form>}
  </Dialog>;
}
