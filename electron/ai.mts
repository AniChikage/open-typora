import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AIConfig, AISettings, AISettingsUpdate, AIRewriteRequest } from "../shared/contracts.js";
import { aiDefaults, aiConfig, aiEndpoint, aiRequest, aiBody, aiResponse, aiHttpError, aiResponseLimit } from "../shared/ai.mjs";
import { atomicWrite } from "./store.mjs";
interface Protector { available(): boolean; encrypt(text: string): Buffer; decrypt(bytes: Buffer): string }
interface Stored extends AIConfig { version: 1; keyCipher?: string }
export class AIService {
  private memoryKey: { endpoint: string; key: string } | null = null;
  private requests = new Map<string, AbortController>();
  private cancelled = new Set<string>();
  private directory: string;
  private protector: Protector;
  constructor(directory: string, protector: Protector) { this.directory = directory; this.protector = protector; }
  private get file() { return path.join(this.directory, "ai-settings.json"); }
  private async read(): Promise<Stored | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.file, "utf8"));
      const config = aiConfig(value), record = value as Record<string, unknown>;
      if (record.version !== 1 || record.keyCipher !== undefined && (typeof record.keyCipher !== "string" || record.keyCipher.length > 65536)) throw new Error("invalid");
      return { ...config, version: 1, keyCipher: record.keyCipher as string | undefined };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("模型配置无法读取；原文件已保留，请检查本机配置文件。");
    }
  }
  private secret(record: Stored) {
    const endpoint = aiEndpoint(record);
    if (this.memoryKey?.endpoint === endpoint) return this.memoryKey.key;
    if (!record.keyCipher) return "";
    if (!this.protector.available()) throw new Error("系统密钥存储暂不可用。请重新填写密钥并选择仅本次会话使用。");
    try { return this.protector.decrypt(Buffer.from(record.keyCipher, "base64")); }
    catch { throw new Error("无法解密模型密钥，请在模型设置中重新填写。"); }
  }
  async settings(update?: AISettingsUpdate): Promise<AISettings> {
    let record = await this.read();
    if (update !== undefined) {
      if (typeof update.rememberKey !== "boolean") throw new Error("密钥保存设置无效。");
      const config = aiConfig(update);
      if (update.apiKey !== undefined && (typeof update.apiKey !== "string" || update.apiKey.length > 16000 || /[\r\n]/.test(update.apiKey))) throw new Error("API 密钥格式无效。");
      const endpoint = aiEndpoint(config);
      const key = update.clearKey ? "" : update.apiKey || (record && aiEndpoint(record) === endpoint ? this.secret(record) : "");
      const next: Stored = { ...config, version: 1 };
      if (key && update.rememberKey) {
        if (!this.protector.available()) throw new Error("本机没有安全密钥存储，请取消记住密钥，仅在本次会话使用。");
        next.keyCipher = this.protector.encrypt(key).toString("base64");
      }
      await atomicWrite(this.file, JSON.stringify(next));
      this.memoryKey = key ? { endpoint, key } : null;
      record = next;
    }
    const endpoint = record ? aiEndpoint(record) : "";
    return { protocol: record?.protocol || aiDefaults.protocol, baseUrl: record?.baseUrl || "", model: record?.model || "", hasKey: !!record?.keyCipher || !!(this.memoryKey?.endpoint === endpoint && this.memoryKey.key), keyStorage: record?.keyCipher ? "system" : this.memoryKey?.endpoint === endpoint ? "session" : "none", secureStorage: this.protector.available() };
  }
  cancel(id: string) {
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) return;
    const request = this.requests.get(id);
    if (request) request.abort("已取消改写。");
    else { this.cancelled.add(id); if (this.cancelled.size > 256) this.cancelled.delete(this.cancelled.values().next().value!); }
  }
  async rewrite(value: AIRewriteRequest) {
    const request = aiRequest(value), config = await this.read();
    if (this.cancelled.delete(request.id)) throw new Error("已取消改写。");
    if (!config) throw new Error("请先配置模型服务。");
    if (this.requests.has(request.id) || this.requests.size >= 4) throw new Error("已有模型请求正在处理，请取消或等待完成。");
    const key = this.secret(config), controller = new AbortController();
    this.requests.set(request.id, controller);
    const timer = setTimeout(() => controller.abort("模型响应超时，请稍后重试。"), 180_000);
    try {
      const response = await fetch(aiEndpoint(config), { method: "POST", redirect: "error", signal: controller.signal, headers: { "Content-Type": "application/json", ...(key ? { Authorization: "Bearer " + key } : {}) }, body: JSON.stringify(aiBody(config, request)) });
      if (!response.ok) { await response.body?.cancel(); throw new Error(aiHttpError(response.status)); }
      const reader = response.body?.getReader(); if (!reader) throw new Error("模型服务没有返回内容。");
      let size = 0; const chunks: Uint8Array[] = [];
      try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > aiResponseLimit) throw new Error("模型输出过大，请缩小选区后重试。"); chunks.push(value); } }
      finally { await reader.cancel().catch(() => {}); }
      let output: unknown; try { output = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("模型服务没有返回有效 JSON，请检查聊天接口地址。"); }
      return { text: aiResponse(config.protocol, output), model: config.model };
    } catch (error) {
      if (controller.signal.aborted) throw new Error(String(controller.signal.reason || "已取消改写。"));
      if (error instanceof TypeError) throw new Error("无法连接模型服务，请检查地址、网络及本地服务是否已启动。");
      throw error;
    } finally { clearTimeout(timer); this.requests.delete(request.id); }
  }
}
