const { contextBridge, ipcRenderer } = require("electron");
const call = (name, ...args) => ipcRenderer.invoke(`document:${name}`, ...args);
contextBridge.exposeInMainWorld("desktop", {
  restore: () => call("restore"),
  registerDraft: (record) => call("draft", record),
  open: () => call("open"),
  openFolder: () => call("folder"),
  scan: () => call("scan"),
  openToken: (token) => call("token", token),
  save: (id, text, saveAs = false, force = false) =>
    call("save", id, text, saveAs, force),
  persist: (session) => call("persist", session),
  check: (id) => call("check", id),
  reload: (id) => call("reload", id),
  acceptDisk: (id, content, hash) => call("acceptDisk", id, content, hash),
  importImage: (id, bytes, name) => call("image", id, bytes, name),
  exportPdf: () => call("pdf"),
  openLink: (url) => call("link", url),
  confirmDiscard: (name) => call("discard", name),
  setDirty: (dirty) => call("dirty", dirty),
  closeWindow: () => ipcRenderer.invoke("app:close"),
  onCommand: (callback) => {
    const listener = (_, command) => callback(command);
    ipcRenderer.on("app:command", listener);
    return () => ipcRenderer.removeListener("app:command", listener);
  },
});
