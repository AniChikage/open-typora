const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");
type IpcRequests = import("../shared/contracts.js").IpcRequests;
type BridgeResponse<T> = import("../shared/contracts.js").BridgeResponse<T>;
type DesktopBridge = import("../shared/contracts.js").DesktopBridge;
type IpcRendererEvent = import("electron").IpcRendererEvent;
type Command = import("../shared/contracts.js").Command;
type PathChange = import("../shared/contracts.js").PathChange;
const call = <K extends keyof IpcRequests>(name: K, ...args: Parameters<IpcRequests[K]>): Promise<BridgeResponse<Awaited<ReturnType<IpcRequests[K]>>>> => ipcRenderer.invoke(`document:${name}`, ...args);
contextBridge.exposeInMainWorld("desktop", {
  readResource: address => call("readResource", address),
  background: () => call("background"), chooseBackground: () => call("chooseBackground"), clearBackground: () => call("clearBackground"),
  plugins: () => call("plugins"), installPlugin: folder => call("installPlugin", folder), removePlugin: id => call("removePlugin", id),
  themes: () => call("themes"), installTheme: () => call("installTheme"), conversionSettings: choose => call("conversionSettings", choose), importDocument: () => call("importDocument"), exportConverted: (id, format, source, html) => call("exportConverted", id, format, source, html), imageAction: (id, sources, action, options) => call("imageAction", id, sources, action, options),
  ready: () => call("ready"),
  cancelClose: () => call("cancelClose"),
  fileOperation: operation => call("fileOperation", operation),
  recent: () => call("recent"),
  recentAction: (action, path) => call("recentAction", action, path),
  searchFiles: (query, options) => call("searchFiles", query, options),
  reveal: (path, openFolder) => call("reveal", path, openFolder),
  onFileOperation: callback => { const listener = async (_: IpcRendererEvent, id: string, phase: string, change: PathChange) => { try { ipcRenderer.send("workspace:prepared", id, await callback(phase, change)); } catch { ipcRenderer.send("workspace:prepared", id, false); } }; ipcRenderer.on("workspace:operation", listener); return () => ipcRenderer.removeListener("workspace:operation", listener); },
  restore: () => call("restore"),
  registerDraft: (record) => call("draft", record),
  open: () => call("open"),
  openFolder: () => call("folder"),
  scan: () => call("scan"),
  openToken: (token) => call("token", token),
  reopen: id => call("reopen", id),
  chooseImage: (id, options) => call("chooseImage", id, options),
  exportHtml: (name, html) => call("html", name, html),
  exportTheme: (name, css) => call("exportTheme", name, css),
  previewSettings: enable => call("previewSettings", enable),
  writeClipboard: text => call("writeClipboard", text),
  readClipboard: () => call("readClipboard"),
  readClipboardFormats: () => call("readClipboardFormats"),
  clipboardAction: action => call("clipboardAction", action),
  confirmClose: name => call("confirmClose", name),
  save: (id, text, saveAs = false, force = false, options) =>
    call("save", id, text, saveAs, force, options),
  persist: (session) => call("persist", session),
  check: (id) => call("check", id),
  reload: (id, encoding) => call("reload", id, encoding),
  acceptDisk: (id, content, hash) => call("acceptDisk", id, content, hash),
  importImage: (id, bytes, name, options) => call("image", id, bytes, name, options),
  exportPdf: (html, options) => call("pdf", html, options),
  openLink: (url) => call("link", url),
  openDocumentLink: (id, url) => call("documentLink", id, url),
  confirmDiscard: (name) => call("discard", name),
  setDirty: (dirty) => call("dirty", dirty),
  closeWindow: () => ipcRenderer.invoke("app:close"),
  onCommand: (callback) => {
    const listener = (_: IpcRendererEvent, command: Command) => callback(command);
    ipcRenderer.on("app:command", listener);
    return () => ipcRenderer.removeListener("app:command", listener);
  },
} satisfies DesktopBridge);
