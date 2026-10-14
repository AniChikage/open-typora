import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  protocol,
  net,
  shell,
  session,
  clipboard,
} from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { atomicWrite, DocumentStore } from "./store.mjs";
import { readFile, realpath } from "node:fs/promises";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const development = process.env.OPEN_TYPORA_DEV_URL;
if (process.env.OPEN_TYPORA_DATA_DIR)
  app.setPath("userData", process.env.OPEN_TYPORA_DATA_DIR);
app.setName("Open Typora");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "open-typora-asset",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let window,
  store,
  dirty = false,
  closing = false;
const pending = [];
app.on("open-file", (event, file) => {
  event.preventDefault();
  if (window)
    store
      .open(file)
      .then((document) => send({ action: "opened", document }))
      .catch(showError);
  else pending.push(file);
});
const send = (command) =>
  window?.webContents.send(
    "app:command",
    typeof command === "string" ? { action: command } : command,
  );
const showError = (error) => dialog.showErrorBox("Open Typora", error.message);
const handlers = {
  restore: async () => {
    const restored = await store.restore();
    if (restored) return restored;
    const samples = JSON.parse(
      await readFile(path.join(root, "shared/samples.json"), "utf-8"),
    );
    const folder = path.join(app.getPath("userData"), "示例笔记");
    const documents = [];
    for (const sample of samples) {
      const file = path.join(folder, sample.name);
      try {
        await readFile(file);
      } catch (error) {
        if (error.code === "ENOENT") await atomicWrite(file, sample.content);
        else throw error;
      }
      documents.push(await store.open(file));
    }
    await store.scan(folder);
    return { documents, activeId: documents[0].id, folder };
  },
  draft: (_, record) => store.registerDraft(record),
  open: async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "打开 Markdown 文件",
      properties: ["openFile"],
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown"] }],
    });
    return result.canceled ? null : store.open(result.filePaths[0]);
  },
  folder: async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "打开笔记文件夹",
      properties: ["openDirectory"],
    });
    return result.canceled ? null : store.scan(result.filePaths[0]);
  },
  scan: () => store.scan(),
  token: (_, token) => store.openToken(token),
  reopen: (_, id) => store.reload(id),
  writeClipboard: (_, text) => clipboard.writeText(String(text)),
  readClipboard: () => clipboard.readText(),
  chooseImage: async (_, id) => {
    store.require(id);
    const result = await dialog.showOpenDialog(window, { title: "插入图片", properties: ["openFile"], filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    return { path: await store.importImage(id, new Uint8Array(await readFile(file)), path.basename(file)), alt: path.basename(file) };
  },
  html: async (_, name, html) => {
    const result = await dialog.showSaveDialog(window, { title: "导出 HTML", defaultPath: String(name).replace(/\.(?:md|markdown|mdown)$/i, "") + ".html", filters: [{ name: "HTML", extensions: ["html"] }] });
    if (result.canceled) return null;
    await atomicWrite(result.filePath, String(html)); return result.filePath;
  },
  confirmClose: async (_, name) => {
    const result = await dialog.showMessageBox(window, { type: "question", message: `保存对“${String(name).slice(0,150)}”所做的修改？`, buttons: ["保存", "取消", "不保存"], defaultId: 0, cancelId: 1 });
    return ["save", "cancel", "discard"][result.response];
  },
  save: async (_, id, text, saveAs, force) => {
    const record = store.require(id);
    let destination;
    if (!record.path || saveAs) {
      const result = await dialog.showSaveDialog(window, {
        title: "保存 Markdown 文件",
        defaultPath: record.path ?? record.name,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (result.canceled) return null;
      destination = result.filePath;
    }
    if (force) {
      const result = await dialog.showMessageBox(window, {
        type: "warning",
        message: "覆盖磁盘上的修改？",
        detail: "当前草稿将替换磁盘文件。也可以取消并另存为副本。",
        buttons: ["取消", "覆盖"],
        defaultId: 0,
        cancelId: 0,
      });
      if (result.response !== 1) return null;
    }
    return store.save(id, text, destination, force);
  },
  persist: (_, value) => store.persist(value),
  check: (_, id) => store.check(id),
  reload: (_, id) => store.reload(id),
  acceptDisk: async (_, id, content, hash) => {
    const disk = await store.check(id);
    if (!disk || disk.content !== content || disk.diskHash !== hash)
      throw new Error("磁盘内容已再次变化。");
    return store.acceptDisk(id, content, hash, disk.bom);
  },
  image: (_, id, bytes, name) => store.importImage(id, bytes, name),
  pdf: async () => {
    const result = await dialog.showSaveDialog(window, {
      title: "导出 PDF",
      defaultPath: "文档.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled) return null;
    const data = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
    });
    await atomicWrite(result.filePath, data);
    return result.filePath;
  },
  link: async (_, url) => {
    const parsed = new URL(url);
    if (!["https:", "http:", "mailto:"].includes(parsed.protocol))
      throw new Error("链接类型不受支持。");
    const result = await dialog.showMessageBox(window, {
      message: "在浏览器中打开链接？",
      detail: parsed.href,
      buttons: ["取消", "打开"],
      defaultId: 0,
      cancelId: 0,
    });
    if (result.response === 1) await shell.openExternal(parsed.href);
  },
  documentLink: async (_, id, address) => {
    const record = store.require(id), relative = decodeURIComponent(String(address).split("#")[0]);
    if (!record.path || path.isAbsolute(relative) || relative.includes(":") || relative.includes("\\")) throw new Error("请先保存文档，并使用相对 Markdown 文件路径。");
    const base = await realpath(path.dirname(record.path)), target = await realpath(path.resolve(base, relative));
    if (!target.startsWith(base + path.sep)) throw new Error("链接位于当前文档目录之外，请用“打开文件”选择目标。");
    send({ action: "opened", document: await store.open(target) });
  },
  discard: async (_, name) => {
    const result = await dialog.showMessageBox(window, {
      type: "question",
      message: `关闭「${String(name).slice(0, 150)}」？`,
      detail: "尚未保存的修改将从当前会话移除。",
      buttons: ["取消", "关闭"],
      defaultId: 0,
      cancelId: 0,
    });
    return result.response === 1;
  },
  dirty: (_, value) => {
    dirty = Boolean(value);
    window?.setDocumentEdited(dirty);
  },
};
app
  .whenReady()
  .then(async () => {
    store = new DocumentStore(app.getPath("userData"));
    protocol.handle("open-typora-asset", async (request) => {
      try {
        const url = new URL(request.url);
        const [id, ...rest] = url.pathname.slice(1).split("/");
        const file = await store.asset(
          decodeURIComponent(id),
          decodeURIComponent(rest.join("/")),
        );
        return net.fetch(pathToFileURL(file).href);
      } catch {
        return new Response("Image unavailable", { status: 404 });
      }
    });
    for (const [name, handler] of Object.entries(handlers))
      ipcMain.handle(`document:${name}`, async (event, ...args) => {
        if (
          event.sender !== window?.webContents ||
          event.senderFrame !== window.webContents.mainFrame
        )
          return { ok: false, error: "来源无效。" };
        try {
          return { ok: true, value: await handler(event, ...args) };
        } catch (error) {
          return { ok: false, error: error.message, code: error.code };
        }
      });
    function createWindow() {
      window = new BrowserWindow({
        width: 1380,
        height: 960,
        minWidth: 660,
        minHeight: 500,
        title: "Open Typora",
        titleBarStyle: "hiddenInset",
        trafficLightPosition: { x: 12, y: 9 },
        backgroundColor: "#FFFFFF",
        webPreferences: {
          preload: path.join(root, "electron/preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      session.defaultSession.setPermissionRequestHandler((_, __, callback) =>
        callback(false),
      );
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      if (development) window.loadURL(development);
      else window.loadFile(path.join(root, "dist/index.html"));
      window.webContents.on("did-finish-load", async () => {
        for (const file of pending.splice(0)) {
          try {
            send({ action: "opened", document: await store.open(file) });
          } catch (error) {
            showError(error);
          }
        }
      });
      window.on("close", (event) => {
        if (!closing && dirty) {
          event.preventDefault();
          send("quit");
        }
      });
      window.on("closed", () => {
        window = null;
      });
    }
    ipcMain.handle("app:close", (event) => {
      if (event.sender === window?.webContents) {
        closing = true;
        window.close();
        app.quit();
      }
    });
    const command = (action) => () => send(action);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Open Typora",
          submenu: [
            { label: "关于 Open Typora", role: "about" },
            { type: "separator" },
            { role: "hide", label: "隐藏 Open Typora" },
            { role: "hideOthers", label: "隐藏其他应用" },
            { type: "separator" },
            {
              label: "退出 Open Typora",
              accelerator: "CmdOrCtrl+Q",
              click: command("quit"),
            },
          ],
        },
        {
          label: "文件",
          submenu: [
            {
              label: "新建",
              accelerator: "CmdOrCtrl+N",
              click: command("new"),
            },
            {
              label: "打开文件…",
              accelerator: "CmdOrCtrl+O",
              click: command("open"),
            },
            { label: "打开文件夹…", click: command("folder") },
            { type: "separator" },
            {
              label: "保存",
              accelerator: "CmdOrCtrl+S",
              click: command("save"),
            },
            {
              label: "另存为…",
              accelerator: "CmdOrCtrl+Shift+S",
              click: command("saveAs"),
            },
            { label: "导出 PDF…", click: command("pdf") },
            { type: "separator" },
            {
              label: "关闭当前文档",
              accelerator: "CmdOrCtrl+W",
              click: command("close"),
            },
          ],
        },
        {
          label: "编辑",
          submenu: [
            { role: "undo", label: "撤销" },
            { role: "redo", label: "重做" },
            { type: "separator" },
            { role: "cut", label: "剪切" },
            { role: "copy", label: "复制" },
            { role: "paste", label: "粘贴" },
            { role: "selectAll", label: "全选" },
            { type: "separator" },
            {
              label: "查找与替换",
              accelerator: "CmdOrCtrl+F",
              click: command("find"),
            },
          ],
        },
        {
          label: "视图",
          submenu: [
            {
              label: "切换源码模式",
              accelerator: "CmdOrCtrl+/",
              click: command("source"),
            },
            {
              label: "专注模式",
              accelerator: "CmdOrCtrl+Shift+F",
              click: command("focus"),
            },
            {
              label: "切换侧栏",
              accelerator: "CmdOrCtrl+\\",
              click: command("sidebar"),
            },
            { label: "大纲", click: command("outline") },
            { label: "文件列表", click: command("files") },
            { type: "separator" },
            { label: "切换明暗主题", click: command("theme") },
            { role: "togglefullscreen", label: "全屏" },
          ],
        },
        { role: "windowMenu", label: "窗口" },
      ]),
    );
    createWindow();
    app.on("activate", () => {
      if (!window) {
        closing = false;
        createWindow();
      }
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
  })
  .catch((error) => {
    console.error(error);
    app.quit();
  });
