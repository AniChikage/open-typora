export class PluginEvents {
  private listeners = new Map<string, Map<(...args: any[]) => unknown, { order: number; once: boolean }>>();
  private failed: (error: unknown) => void;
  constructor(failed: (error: unknown) => void) { this.failed = failed; }
  on = (type: string, callback: (...args: any[]) => unknown, order = 0, once = false) => {
    if (typeof type !== "string" || typeof callback !== "function") throw new Error("插件事件需要名称和回调函数。");
    if (!this.listeners.has(type)) this.listeners.set(type, new Map());
    this.listeners.get(type)!.set(callback, { order, once });
    return () => this.off(type, callback);
  };
  off = (type: string, callback: (...args: any[]) => unknown) => { this.listeners.get(type)?.delete(callback); };
  emit(type: string, ...args: any[]) {
    for (const [callback, options] of [...(this.listeners.get(type) || [])].sort((a,b) => a[1].order-b[1].order)) {
      if (!this.listeners.get(type)?.has(callback)) continue;
      if (options.once) this.off(type, callback);
      try { Promise.resolve(callback(...args)).catch(this.failed); } catch (error) { this.failed(error); }
    }
  }
  clear() { this.listeners.clear(); }
}
