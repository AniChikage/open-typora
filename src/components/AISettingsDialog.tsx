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
    if (host.native) void host.aiSettings().then(value => { if (!alive.current) return; setOriginal(value); setConfig({ protocol: value.protocol, baseUrl: value.baseUrl, model: value.model }); setRemember(value.secureStorage && value.keyStorage !== "session"); }).catch(error => { if (alive.current) setError(error.message); }).finally(() => { if (alive.current) setLoading(false); });
    else setLoading(false);
    return () => { alive.current = false; if (testId.current) void host.aiCancel(testId.current).catch(() => {}); };
  }, []);
  async function save(test = false) {
    if (busy || formComposing.current) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const value = await host.aiSettings({ ...config, apiKey: keyInput.current?.value || undefined, clearKey, rememberKey: remember });
      saved();
      if (!alive.current) return;
      if (keyInput.current) keyInput.current.value = "";
      setOriginal(value); setClearKey(false); setConfig({ protocol: value.protocol, baseUrl: value.baseUrl, model: value.model });
      if (test) {
        testId.current = crypto.randomUUID();
        await host.aiRewrite({ id: testId.current, instruction: "请只返回：连接成功", text: "你好" });
        if (alive.current) setStatus("连接成功，已收到模型的实际回复。");
      } else setStatus(value.hasKey ? value.keyStorage === "system" ? "已保存，密钥由系统安全存储保护。" : "已保存，密钥仅用于本次会话。" : "已保存，无 API 密钥。");
    } catch (error) { if (alive.current) setError((error as Error).message); }
    finally { testId.current = ""; if (alive.current) setBusy(false); }
  }
  const existingKey = !!original?.hasKey && config.baseUrl === original.baseUrl && config.protocol === original.protocol && !clearKey;
  return <Dialog title="模型设置" close={close}>
    {!host.native ? <p className="dialog-note">模型配置与 AI 改写请使用桌面应用。</p> : <form className="ai-settings" onCompositionStartCapture={() => { formComposing.current = true; }} onCompositionEndCapture={() => { formComposing.current = false; }} onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="dialog-note">连接你自己的模型服务。只有点击改写或测试连接时才会发送请求。</p>
      <label>接口格式<select aria-label="模型接口格式" value={config.protocol} disabled={loading || busy} onChange={event => {
        const protocol = event.target.value as AIConfig["protocol"];
        setConfig(previous => ({ ...previous, protocol, baseUrl: !previous.baseUrl || /^http:\/\/(?:127\.0\.0\.1|localhost):(?:11434|1234)(?:\/v1)?$/.test(previous.baseUrl) ? protocol === "ollama" ? "http://127.0.0.1:11434" : "http://127.0.0.1:1234/v1" : previous.baseUrl })); setStatus("");
      }}><option value="openai">OpenAI 兼容 API / LM Studio</option><option value="ollama">Ollama 原生接口</option></select></label>
      <label>服务地址<input aria-label="模型服务地址" type="url" autoComplete="off" spellCheck={false} value={config.baseUrl} disabled={loading || busy} placeholder={config.protocol === "ollama" ? "http://127.0.0.1:11434" : "https://你的服务地址/v1"} onChange={event => { setConfig(previous => ({ ...previous, baseUrl: event.target.value })); setStatus(""); }} /></label>
      <p className="dialog-note">{config.protocol === "ollama" ? "可填 Ollama 服务根地址，或完整的 /api/chat 地址。" : "可填 API 基础地址（通常以 /v1 结尾），或完整的 /chat/completions 地址。"}地址中不要包含密钥。</p>
      <label>模型名称<input aria-label="模型名称" autoComplete="off" spellCheck={false} value={config.model} disabled={loading || busy} placeholder="填写服务中实际可用的模型 ID" onChange={event => { setConfig(previous => ({ ...previous, model: event.target.value })); setStatus(""); }} /></label>
      <label>API 密钥<input ref={keyInput} aria-label="模型 API 密钥" type="password" autoComplete="off" spellCheck={false} disabled={loading || busy} placeholder={existingKey ? "已保存；留空保留现有密钥" : "本地服务可留空，取决于服务配置"} onInput={() => { setClearKey(false); setStatus(""); }} /></label>
      <p className="dialog-note">{clearKey ? "保存后将移除现有密钥。" : existingKey ? "密钥不会回传到界面。更换服务地址后，请重新填写对应密钥。" : "只对当前服务地址使用此密钥。"}</p>
      {original?.hasKey && <button type="button" disabled={busy} onClick={() => { setClearKey(true); if (keyInput.current) keyInput.current.value = ""; }}>移除已保存密钥</button>}
      <label className="checkbox-option"><input aria-label="安全记住模型密钥" type="checkbox" checked={remember} disabled={loading || busy || original?.secureStorage === false} onChange={event => setRemember(event.target.checked)} />使用系统安全存储记住密钥</label>
      <p className="dialog-note">{original?.secureStorage === false ? "本机安全存储不可用，密钥只会保留到本次应用退出。" : "macOS 使用系统钥匙串；Windows/Linux 使用系统保护的加密存储。取消勾选后，退出应用即清除会话密钥。"}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {status && <p className="ai-status" role="status">{status}</p>}
      <div className="dialog-actions"><button type="button" disabled={loading || busy} onClick={() => void save(true)}>保存并测试连接</button><button className="primary-button" type="submit" disabled={loading || busy} onKeyDown={event => { if (imeKey(event.nativeEvent)) event.preventDefault(); }}>{busy ? "正在处理…" : "保存设置"}</button></div>
    </form>}
  </Dialog>;
}
