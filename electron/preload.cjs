const { contextBridge, ipcRenderer } = require("electron");
const call = (name, ...args) => ipcRenderer.invoke(`document:${name}`, ...args);
contextBridge.exposeInMainWorld("desktop", {
  background: () => call("background"), chooseBackground: () => call("chooseBackground"), clearBackground: () => call("clearBackground"),
  plugins: () => call("plugins"), installPlugin: () => call("installPlugin"), removePlugin: id => call("removePlugin", id),
  themes: () => call("themes"), installTheme: () => call("installTheme"), conversionSettings: choose => call("conversionSettings", choose), importDocument: () => call("importDocument"), exportConverted: (id, format, source, html) => call("exportConverted", id, format, source, html), imageAction: (id, sources, action, options) => call("imageAction", id, sources, action, options),
  ready: () => call("ready"),
  cancelClose: () => call("cancelClose"),
  fileOperation: operation => call("fileOperation", operation),
  recent: () => call("recent"),
  recentAction: (action, path) => call("recentAction", action, path),
  searchFiles: (query, options) => call("searchFiles", query, options),
  reveal: path => call("reveal", path),
  onFileOperation: callback => { const listener = async (_, id, phase, change) => { try { ipcRenderer.send("workspace:prepared", id, await callback(phase, change)); } catch { ipcRenderer.send("workspace:prepared", id, false); } }; ipcRenderer.on("workspace:operation", listener); return () => ipcRenderer.removeListener("workspace:operation", listener); },
  restore: () => call("restore"),
  registerDraft: (record) => call("draft", record),
  open: () => call("open"),
  openFolder: () => call("folder"),
  scan: () => call("scan"),
  openToken: (token) => call("token", token),
  reopen: id => call("reopen", id),
  chooseImage: (id, options) => call("chooseImage", id, options),
  exportHtml: (name, html) => call("html", name, html),
  writeClipboard: text => call("writeClipboard", text),
  readClipboard: () => call("readClipboard"),
  confirmClose: name => call("confirmClose", name),
  save: (id, text, saveAs = false, force = false, options) =>
    call("save", id, text, saveAs, force, options),
  persist: (session) => call("persist", session),
  check: (id) => call("check", id),
  reload: (id, encoding) => call("reload", id, encoding),
  acceptDisk: (id, content, hash) => call("acceptDisk", id, content, hash),
  importImage: (id, bytes, name, options) => call("image", id, bytes, name, options),
  exportPdf: () => call("pdf"),
  openLink: (url) => call("link", url),
  openDocumentLink: (id, url) => call("documentLink", id, url),
  confirmDiscard: (name) => call("discard", name),
  setDirty: (dirty) => call("dirty", dirty),
  closeWindow: () => ipcRenderer.invoke("app:close"),
  onCommand: (callback) => {
    const listener = (_, command) => callback(command);
    ipcRenderer.on("app:command", listener);
    return () => ipcRenderer.removeListener("app:command", listener);
  },
});
