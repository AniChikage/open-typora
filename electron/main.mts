import { translate } from "../shared/translate.mjs";
import type { IpcRequests, Command, PathChange } from "../shared/contracts.js";
import type { IpcMainInvokeEvent } from "electron";
type IpcHandlers = { [K in keyof IpcRequests]: (event: IpcMainInvokeEvent, ...args: Parameters<IpcRequests[K]>) => Awaited<ReturnType<IpcRequests[K]>> | Promise<Awaited<ReturnType<IpcRequests[K]>>> };
import { AIService } from "./ai.mjs";
import { renderPdf } from "./pdf.mjs";
import { previewSettings } from "./windows-preview.mjs";
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
  safeStorage,
} from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { imageAction, imageName } from "./image-actions.mjs";
import { libreOfficePath, pandocPath, convertExport, convertImport, themes, installTheme } from "./interchange.mjs";
import { Workspace } from "./workspace.mjs";
import { randomUUID } from "node:crypto";
import { atomicWrite, DocumentStore } from "./store.mjs";
import { readFile, realpath, stat } from "node:fs/promises";
import { launchFiles } from "./launch-files.mjs";
import { plugins, installPlugin } from "./plugins.mjs";
import { pluginResource, exportResource } from "./resources.mjs";
import { readBackground, saveBackground, clearBackground } from "./background.mjs";
const runtimeRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = app.isPackaged ? runtimeRoot : path.resolve(runtimeRoot, "../..");
const development = process.env.OPEN_TYPORA_DEV_URL;
if (process.env.OPEN_TYPORA_DATA_DIR)
  app.setPath("userData", process.env.OPEN_TYPORA_DATA_DIR);
app.setName("Open Typora");
protocol.registerSchemesAsPrivileged([
  { scheme: "opentypora", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  {
    scheme: "open-typora-asset",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let window: BrowserWindow | null,
  store: DocumentStore, workspace: Workspace,
  dirty = false,
  closing = false;
const pending: string[] = [];
let rendererReady = false;
const pluginToken = randomUUID();
const authorizedPlugin = <T extends { id: string; name: string; url: string } | null>(item: T): T => item && ({ ...item, url: item.url + "?token=" + pluginToken }) as T;
function openFiles(files: string[]) {
  for (const file of files) {
    if (window && rendererReady) store.open(file)
      .then(document => send({ action: "opened", document })).catch(showError);
    else pending.push(file);
  }
}
if (process.platform !== "darwin") {
  if (process.platform === "win32") app.setAppUserModelId("org.opentypora.desktop");
  if (!app.requestSingleInstanceLock()) app.quit();
  else {
    pending.push(...launchFiles(process.argv, app.isPackaged));
    app.on("second-instance", (_, argv, cwd) => {
      openFiles(launchFiles(argv, app.isPackaged, cwd));
      if (window?.isMinimized()) window!.restore();
      window?.show();
      window?.focus();
    });
  }
}
app.on("open-file", (event, file) => {
  event.preventDefault();
  openFiles([file]);
});
const send = (command: Command | string) =>
  window?.webContents.send(
    "app:command",
    typeof command === "string" ? { action: command } : command,
  );
const showError = (error: Error) => dialog.showErrorBox("Open Typora", error.message);
const handshakes = new Map<string, (value: boolean) => void>();
ipcMain.on("workspace:prepared", (event, id, value) => { if (event.sender !== window?.webContents) return; handshakes.get(id)?.(value); });
function prepareOperation(phase: string, change: PathChange) { return new Promise<boolean>((resolve, reject) => { const id = randomUUID(), timeout = setTimeout(() => { handshakes.delete(id); reject(new Error("文件操作等待超时。")); }, 30000); handshakes.set(id, value => { clearTimeout(timeout); handshakes.delete(id); resolve(value); }); window!.webContents.send("workspace:operation", id, phase, change); }); }
let operationRunning = false;
let ai: AIService;
let uiLocale = 'zh-CN';
const l = (source: string) => translate(uiLocale, source);
let buildMenu = () => {};
const handlers: IpcHandlers = {
  aiSettings: (_, update) => ai.settings(update),
  aiRewrite: (_, request) => ai.rewrite(request),
  aiCancel: (_, id) => ai.cancel(id),
  readContext: (_, token) => store.readContext(token),
  versions: (_, id) => store.versions.list(store.require(id)),
  captureVersion: (_, id, content, reason) => store.versions.capture(store.require(id), content, reason),
  readVersion: (_, id, versionId) => store.versions.read(store.require(id), versionId),
  setLocale: (_, locale) => { const next = locale === 'en' ? 'en' : 'zh-CN'; if (uiLocale !== next) { uiLocale = next; buildMenu(); } return true; },
  background: () => readBackground(store.dataDir),
  clearBackground: () => clearBackground(store.dataDir),
  chooseBackground: async () => {
    const result = await dialog.showOpenDialog(window!,{title:l("选择背景图片"),filters:[{name:l("背景图片"),extensions:["png","jpg","jpeg","webp"]}],properties:["openFile"]});
    if (result.canceled || !result.filePaths[0]) return null;
    const file = result.filePaths[0];
    if ((await stat(file)).size > 8 * 1024 * 1024) throw new Error("背景图片须小于 8 MB。");
    return saveBackground(store.dataDir,await readFile(file),path.basename(file),async (_bytes,dataUrl) => {
      // Chromium supports WebP consistently; nativeImage's supported codecs differ by host.
      const size = await window!.webContents.executeJavaScript(`(async () => {
        const image = new Image(); image.src = ${JSON.stringify(dataUrl)};
        let timer;
        try { await Promise.race([image.decode(),new Promise((_,reject) => {timer = setTimeout(() => reject(new Error('decode timeout')),10000);})]); return {width:image.naturalWidth,height:image.naturalHeight}; }
        catch { return {width:0,height:0}; }
        finally {clearTimeout(timer);image.src='';}
      })()`);
      if (!size.width || !size.height || size.width * size.height > 40_000_000) throw new Error("图片无效或分辨率超过 4000 万像素，请选择较小的图片。");
    });
  },
  plugins: async () => (await plugins(store.dataDir)).map(authorizedPlugin),
  removePlugin: async (_, id) => { if (!/^local-[a-f0-9]{64}$/.test(id)) throw new Error("插件标识无效。"); const root = await realpath(path.join(store.dataDir, "plugins")); if (path.dirname(root) !== await realpath(store.dataDir)) throw new Error("插件目录无效。"); for (const suffix of [".json", ".mjs"]) { const file = path.join(root, id + suffix); try { if (path.dirname(await realpath(file)) !== root) throw new Error("插件资源路径无效。"); await shell.trashItem(file); } catch (errorCaught) { const error = errorCaught as NodeJS.ErrnoException; if (error.code !== "ENOENT") throw error; } } return true; },
  installPlugin: async (_, folder = false) => { const result = await dialog.showOpenDialog(window!, folder ? { title: l("安装插件文件夹"), properties: ["openDirectory"] } : { filters: [{ name: "JavaScript", extensions: ["js", "cjs"] }], properties: ["openFile"] }); return result.canceled ? null : authorizedPlugin(await installPlugin(result.filePaths[0], store.dataDir)); },
  themes: () => themes(store.dataDir),
  installTheme: async () => { const result = await dialog.showOpenDialog(window!, { filters: [{ name: "CSS", extensions: ["css"] }], properties: ["openFile"] }); return result.canceled ? null : installTheme(result.filePaths[0], store.dataDir); },
  previewSettings: (_, enable) => previewSettings(enable),
  exportTheme: async (_, name, css) => {
    if (typeof css !== "string" || Buffer.byteLength(css) > 32 * 1024 * 1024) throw new Error("主题内容过大。");
    const result = await dialog.showSaveDialog(window!, { defaultPath: String(name).replace(/[/\\]/g,"-") + ".css", filters: [{ name: "CSS", extensions: ["css"] }] });
    if (result.canceled) return null; await atomicWrite(result.filePath, css); return result.filePath;
  },
  readResource: async (_, address) => exportResource(address,store,path.join(root,"dist")),
  conversionSettings: async (_, choose) => { if (choose) { const result = await dialog.showOpenDialog(window!, { title: l("选择 Pandoc 可执行文件"), properties: ["openFile"] }); if (!result.canceled) process.env.OPEN_TYPORA_PANDOC = result.filePaths[0]; } return { word: process.platform === "darwin", libreOffice: await libreOfficePath(), pandoc: await pandocPath() }; },
  importDocument: async () => { const result = await dialog.showOpenDialog(window!, { title: l("导入文档"), properties: ["openFile"], filters: [{ name: l("文档"), extensions: ["docx", "doc", "rtf", "odt", "epub", "tex", "rst", "html", "txt"] }] }); return result.canceled ? null : convertImport(result.filePaths[0], store.dataDir); },
  exportConverted: async (_, id, format, source, html) => { const record = store.require(id), ext = { latex: "tex", revealjs: "html", mediawiki: "wiki" }[format] || format; const result = await dialog.showSaveDialog(window!, { defaultPath: record.name.replace(/\.[^.]+$/, "." + ext) }); return result.canceled ? null : convertExport(store.dataDir, format, source, html, result.filePath); },
  imageAction: async (_, id, sources, action, options) => {
    store.require(id);
    if (!Array.isArray(sources) || !sources.length || sources.length > 200 || sources.some(source => typeof source !== "string") || !["copy", "move", "delete", "upload"].includes(action)) throw new Error("图片操作无效。");
    let destination, directory;
    if (["copy", "move"].includes(action)) {
      if (sources.length > 1) { const result = await dialog.showOpenDialog(window!, {title:l("选择图片目标文件夹"),properties:["openDirectory"]}); if (result.canceled) return null; directory = result.filePaths[0]; }
      else { const result = await dialog.showSaveDialog(window!, {title:action === "move" ? l("移动或重命名图片") : l("复制图片"),defaultPath:imageName(sources[0])}); if (result.canceled) return null; destination = result.filePath; }
    }
    if (action === "delete") { const result = await dialog.showMessageBox(window!,{type:"warning",message:l("删除图片文件？"),detail:l("图片文件会移到废纸篓，文档中的引用也会移除。"),buttons:[l("取消"),l("移到废纸篓")],defaultId:0,cancelId:0}); if(result.response !== 1) return null; }
    return imageAction({store,id,sources,action,options,destination,directory,trash:file=>shell.trashItem(file),notice:message=>window!.webContents.send("app:command",{action:"notice",message})});
  },
  ready: async () => { rendererReady = true; for (const file of pending.splice(0)) {
    try { send({ action: "opened", document: await store.open(file) }); }
    catch (errorCaught) { const error = errorCaught as NodeJS.ErrnoException; showError(error); }
  } return true; },
  cancelClose: () => { closing = false; },
  recent: () => workspace.recent(),
  recentAction: async (_, action, file) => { if (action !== "open") return workspace.recentAction(action, file); const item = (await workspace.recent()).find(item => item.path === file); if (!item) throw new Error("最近项目已移除。"); await workspace.remember(file!, item.folder); return item.folder ? store.scan(file!) : store.open(file!); },
  searchFiles: async (_, query, options) => {
    const inventory = await store.scan();
    const result = await workspace.search(inventory.files, query, { ...options, encodings: Object.fromEntries([...store.records.values()].filter(record => record.path).map(record => [record.path, record.encoding])) });
    return { ...result, skipped: result.skipped + inventory.skipped };
  },
  reveal: async (_, file, openFolder) => {
    const authorized = await workspace.authorize(file, store);
    if (!openFolder) return shell.showItemInFolder(authorized);
    const error = await shell.openPath(path.dirname(authorized)); if (error) throw new Error(error);
  },
  fileOperation: async (_, operation) => {
    if (operationRunning) throw new Error("另一个文件操作正在进行。"); operationRunning = true;
    try {
      if (operation.action === "trash") { const answer = await dialog.showMessageBox(window!, { message: l("移到废纸篓？"), detail: operation.path, buttons: [l("取消"), l("移到废纸篓")], cancelId: 0 }); if (answer.response !== 1) return null; }
      if (!await prepareOperation("prepare", { removedPath: operation.action === "trash" ? operation.path : undefined })) throw new Error("文件操作已取消。");
      const change = await workspace.execute(operation, store, file => shell.trashItem(file));
      if (change.fromPath && change.toPath) await store.versions.remap(change.fromPath, change.toPath).catch(() => send({ action: "notice", message: l("历史版本迁移失败，原始历史记录已保留。") }));
      workspace.apply(change, store);
      await prepareOperation("commit", change); return change;
    } finally { try { await prepareOperation("release", {}); } finally { operationRunning = false; } }
  },
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
      } catch (errorCaught) { const error = errorCaught as NodeJS.ErrnoException;
        if (error.code === "ENOENT") await atomicWrite(file, process.platform === "win32" ? sample.content.replace(/⌘\s*/g, "Ctrl+") : sample.content);
        else throw error;
      }
      documents.push(await store.open(file));
    }
    await store.scan(folder);
    return { documents, activeId: documents[0].id, folder };
  },
  draft: (_, record) => store.registerDraft(record),
  open: async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: "打开 Markdown 文件",
      properties: ["openFile"],
      filters: [{ name: "Markdown", extensions: ["md", "markdown", "mdown"] }],
    });
    return result.canceled ? null : store.open(result.filePaths[0]);
  },
  folder: async () => {
    const result = await dialog.showOpenDialog(window!, {
      title: "打开笔记文件夹",
      properties: ["openDirectory"],
    });
    return result.canceled ? null : store.scan(result.filePaths[0]);
  },
  scan: () => store.scan(),
  token: async (_, token) => { const record = await store.openToken(token); await workspace.remember(record.path); return record; },
  reopen: (_, id) => store.reopen(id),
  writeClipboard: (_, text) => clipboard.writeText(String(text)),
  readClipboard: () => clipboard.readText(),
  readClipboardFormats: async () => {
    const item = (await clipboard.read())[0];
    const read = async (type: string) => item?.types.includes(type) ? (await item.getType(type) as Blob).text() : "";
    const [text, html] = await Promise.all([read("text/plain"), read("text/html")]);
    return { text, html };
  },
  clipboardAction: (_, action) => {
    if (!["cut", "copy", "paste"].includes(action)) throw new Error("不支持的剪贴板操作。");
    window!.webContents[action]();
  },
  chooseImage: async (_, id, options) => {
    store.require(id);
    const result = await dialog.showOpenDialog(window!, { title: "插入图片", properties: ["openFile"], filters: [{ name: l("图片"), extensions: ["png", "jpg", "jpeg", "gif", "webp"] }] });
    if (result.canceled) return null;
    const file = result.filePaths[0];
    return { path: await store.importImage(id, new Uint8Array(await readFile(file)), path.basename(file), options), alt: path.basename(file) };
  },
  html: async (_, name, html) => {
    const result = await dialog.showSaveDialog(window!, { title: "导出 HTML", defaultPath: String(name).replace(/\.(?:md|markdown|mdown)$/i, "") + ".html", filters: [{ name: "HTML", extensions: ["html"] }] });
    if (result.canceled) return null;
    await atomicWrite(result.filePath, String(html)); return result.filePath;
  },
  confirmClose: async (_, name) => {
    const result = await dialog.showMessageBox(window!, { type: "question", message: `保存对“${String(name).slice(0,150)}”所做的修改？`, buttons: [l("保存"), l("取消"), l("不保存")], defaultId: 0, cancelId: 1 });
    return (["save", "cancel", "discard"] as const)[result.response];
  },
  save: async (_, id, text, saveAs, force, options) => {
    const record = store.require(id);
    let destination;
    if (!record.path || saveAs) {
      const result = await dialog.showSaveDialog(window!, {
        title: "保存 Markdown 文件",
        defaultPath: record.path ?? record.name,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (result.canceled) return null;
      destination = result.filePath;
    }
    if (force) {
      const result = await dialog.showMessageBox(window!, {
        type: "warning",
        message: "覆盖磁盘上的修改？",
        detail: "当前草稿将替换磁盘文件。也可以取消并另存为副本。",
        buttons: [l("取消"), "覆盖"],
        defaultId: 0,
        cancelId: 0,
      });
      if (result.response !== 1) return null;
    }
    return store.save(id, text, destination, force, options);
  },
  persist: (_, value) => store.persist(value),
  check: (_, id) => store.check(id),
  reload: (_, id, encoding) => store.reload(id, encoding),
  acceptDisk: async (_, id, content, hash) => {
    const disk = await store.check(id);
    if (!disk || disk.content !== content || disk.diskHash !== hash)
      throw new Error("磁盘内容已再次变化。");
    return store.acceptDisk(id, content, hash, disk.bom, disk.encoding);
  },
  image: (_, id, bytes, name, options) => store.importImage(id, bytes, name, options),
  pdf: async (_, html, options) => {
    const result = await dialog.showSaveDialog(window!, { title:l("导出 PDF"), defaultPath:"文档.pdf", filters:[{name:"PDF",extensions:["pdf"]}] });
    if (result.canceled) return null;
    const data = await renderPdf(html!, options); await atomicWrite(result.filePath, data); return result.filePath;
  },
  link: async (_, url) => {
    const parsed = new URL(url);
    if (!["https:", "http:", "mailto:"].includes(parsed.protocol))
      throw new Error("链接类型不受支持。");
    const result = await dialog.showMessageBox(window!, {
      message: "在浏览器中打开链接？",
      detail: parsed.href,
      buttons: [l("取消"), l("打开")],
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
    const result = await dialog.showMessageBox(window!, {
      type: "question",
      message: `关闭「${String(name).slice(0, 150)}」？`,
      detail: "尚未保存的修改将从当前会话移除。",
      buttons: [l("取消"), "关闭"],
      defaultId: 0,
      cancelId: 0,
    });
    return result.response === 1;
  },
  dirty: (_, value) => {
    dirty = Boolean(value);
    if (process.platform === "darwin") window?.setDocumentEdited(dirty);
  },
};
app
  .whenReady()
  .then(async () => {
    if (process.platform !== "darwin" && !app.hasSingleInstanceLock()) return;
    store = new DocumentStore(app.getPath("userData"));
    ai = new AIService(process.env.OPEN_TYPORA_AI_SETTINGS_DIR || store.dataDir, {
      available: () => safeStorage.isEncryptionAvailable() && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
      encrypt: text => safeStorage.encryptString(text), decrypt: bytes => safeStorage.decryptString(bytes),
    }, process.platform === "darwin" ? "file" : "system");
    workspace = new Workspace(app.getPath("userData"));
    protocol.handle("opentypora", async request => {
      try {
        if (new URL(request.url).searchParams.get("token") !== pluginToken) throw new Error("插件会话无效。");
        const { bytes, mime } = await pluginResource(request.url, store.dataDir);
        const headers: Record<string, string> = { "Content-Type": mime, "X-Content-Type-Options": "nosniff" };
        const origin = request.headers.get("origin");
        if (origin === "null" || origin === "file://" || (development && origin === new URL(development).origin)) headers["Access-Control-Allow-Origin"] = origin;
        return new Response(bytes, { headers });
      } catch { return new Response("Resource unavailable", { status: 404 }); }
    });
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
          event.senderFrame !== window!.webContents.mainFrame
        )
          return { ok: false, error: "来源无效。" };
        try {
          return { ok: true, value: await Reflect.apply(handler, undefined, [event, ...args]) };
        } catch (errorCaught) { const error = errorCaught as NodeJS.ErrnoException;
          return { ok: false, error: error.message, code: error.code };
        }
      });
    function createWindow() {
      window = new BrowserWindow({
        show: process.env.OPEN_TYPORA_TEST_HIDDEN !== "1",
        width: 1380,
        height: 960,
        minWidth: 660,
        minHeight: 500,
        title: "Open Typora",
        ...(process.platform === "darwin" ? {
          titleBarStyle: "hiddenInset", trafficLightPosition: { x: 12, y: 9 },
        } : {}),
        ...(process.platform === "linux" ? { icon: path.join(root, "icon.png") } : {}),
        backgroundColor: "#FFFFFF",
        webPreferences: {
          backgroundThrottling: process.env.OPEN_TYPORA_TEST_HIDDEN !== "1",
          preload: path.join(runtimeRoot, "electron/preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      session.defaultSession.setPermissionRequestHandler((_, __, callback) =>
        callback(false),
      );
      window!.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window!.webContents.on("will-navigate", (event) => event.preventDefault());
      if (development) window!.loadURL(development);
      else window!.loadFile(path.join(root, "dist/index.html"));
      window!.on("close", (event) => {
        if (!closing) {
          event.preventDefault();
          send("quit");
        }
      });
      window!.on("closed", () => {
        window = null;
        rendererReady = false;
      });
    }
    ipcMain.handle("app:close", (event) => {
      if (event.sender === window?.webContents) {
        closing = true;
        window!.close();
        app.quit();
      }
    });
    const command = (action: string) => () => send(action);
    const groups = JSON.parse(await readFile(path.join(root, "shared/commands.json"), "utf8")) as {title: string; items: {action: string; label: string; key?: string; pcKey?: string; selector?: string}[]}[];
    const roles: Record<string, import("electron").MenuItemConstructorOptions["role"]> = { "cut:": "cut", "copy:": "copy", "paste:": "paste", "selectAll:": "selectAll" };
    const accelerator = (key?: string) => key?.replaceAll("Mod-", "CommandOrControl+").replaceAll("Ctrl-", "Control+").replaceAll("Alt-", "Alt+").replaceAll("Shift-", "Shift+");
    buildMenu = () => Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: "Open Typora", submenu: [{ label: l("关于 Open Typora"), click: command("about") }, { label: l("偏好设置…"), accelerator: "CommandOrControl+,", click: command("preferences") }, ...(process.platform === "darwin" ? [{ type: "separator" as const }, { role: "hide" as const, label: l("隐藏 Open Typora") }, { role: "hideOthers" as const, label: l("隐藏其他应用") }] : []), { type: "separator" as const }, { label: l("退出 Open Typora"), accelerator: "CommandOrControl+Q", click: command("quit") }] },
      ...groups.map(group => ({ label: uiLocale === "en" && group.title === "文件" ? "File" : l(group.title), submenu: group.items.filter(item => item.action !== "preferences").map(item => ({ label: l(item.label), accelerator: accelerator(process.platform === "darwin" ? item.key : item.pcKey ?? item.key), ...(item.selector ? { role: roles[item.selector] } : { click: command(item.action) }) })) })),
      { role: "windowMenu", label: l("窗口") }
    ]));
    buildMenu();
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
