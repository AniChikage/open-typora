type NativeRequests = import("../shared/contracts.js").DesktopRequests;
type NativeBridge = import("../shared/contracts.js").DesktopBridge;
type NativeResponse<T> = import("../shared/contracts.js").BridgeResponse<T>;
type NativeCommand = import("../shared/contracts.js").Command;
type NativeChange = import("../shared/contracts.js").PathChange;
(() => {
  const pending = new Map<string, {resolve(value: NativeResponse<unknown>): void; reject(reason?: unknown): void}>(),
    listeners = new Set<(command: NativeCommand) => void>();
  let sequence = 0;
  let fileOperationHandler: (phase: string, change: NativeChange) => Promise<boolean> = async () => false;
  const request = <T = unknown>(name: keyof NativeRequests | "closeWindow", args: unknown[]): Promise<NativeResponse<T>> =>
    new Promise<NativeResponse<unknown>>((resolve, reject) => {
      const id = `request-${++sequence}`;
      pending.set(id, { resolve, reject });
      try {
        window.webkit.messageHandlers.opentypora.postMessage({
          id,
          name,
          args,
        });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    }) as Promise<NativeResponse<T>>;
  const methods = [
    "background", "chooseBackground", "clearBackground",
    "restore", "imageAction", "importDocument", "exportConverted", "themes", "installTheme", "plugins", "installPlugin", "removePlugin", "conversionSettings", "ready", "fileOperation", "recent", "recentAction", "searchFiles", "reveal",
    "registerDraft",
    "open",
    "openFolder",
    "scan",
    "openToken",
    "save",
    "persist",
    "check",
    "reload",
    "acceptDisk",
    "exportPdf",
    "openLink",
    "openDocumentLink",
    "confirmDiscard",
    "confirmClose",
    "setDirty",
    "cancelClose",
    "historyState",
    "viewState",
    "windowAction",
    "exportHtml", "exportTheme", "previewSettings",
    "readClipboard",
    "clipboardAction",
    "writeClipboard",
    "chooseImage",
    "reopen",
    "readResource",
  ] as const satisfies readonly (keyof NativeRequests)[];
  type Complete<T extends never> = T;
  type AllMethods = Complete<Exclude<keyof NativeRequests, typeof methods[number] | "importImage">>;
  const desktop = Object.fromEntries(
    methods.map((name) => [name, (...args: unknown[]) => request(name, args)]),
  ) as unknown as NativeBridge;
  desktop.importImage = (id, bytes, name, options = {}) => {
    let text = "";
    for (let i = 0; i < bytes.length; i += 16384)
      text += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return request<string>("importImage", [id, btoa(text), name, options]);
  };
  desktop.closeWindow = () => request("closeWindow", []);
  desktop.onFileOperation = callback => { fileOperationHandler = callback; return () => { fileOperationHandler = async () => false; }; };
  desktop.onCommand = (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  };
  Object.defineProperty(window, "desktop", { value: Object.freeze(desktop) });
  Object.defineProperty(window, "__openTypora", {
    value: Object.freeze({
      fileOperation(phase: string, change: NativeChange) { return fileOperationHandler(phase, change); },
      receive({ id, result }: { id: string; result: NativeResponse<unknown> }) {
        const item = pending.get(id);
        if (item) {
          pending.delete(id);
          item.resolve(result);
        }
      },
      command(command: NativeCommand) {
        for (const callback of listeners) callback(command);
      },
    }),
  });
  if (!crypto.randomUUID)
    crypto.randomUUID = () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const text = [...bytes]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}` as ReturnType<Crypto["randomUUID"]>;
    };
})();
