import AppKit
import UniformTypeIdentifiers
import WebKit

func jsonValue<T: Encodable>(_ value: T) throws -> Any {
  try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
}
final class Resources: NSObject, WKURLSchemeHandler {
  let root: URL
  let store: DocumentStore
  init(_ root: URL, store: DocumentStore) {
    self.root = root
    self.store = store
  }
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { return }
    do {
      let file: URL
      if url.scheme == "open-typora-asset", url.host == "local" {
        let segments =
          (URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath.split(
            separator: "/") ?? []).compactMap { String($0).removingPercentEncoding }
        guard segments.count == 2 else { throw NativeFailure("图片引用无效。") }
        file = try store.asset(segments[0], relative: segments[1])
      } else {
        guard url.scheme == "opentypora", url.host == "app" else { throw NativeFailure("资源来源无效。") }
        file = root.appendingPathComponent(String(url.path.dropFirst())).resolvingSymlinksInPath()
        guard contained(root, file) else { throw NativeFailure("资源路径无效。") }
      }
      let data = try Data(contentsOf: file)
      let mime =
        [
          "js": "application/javascript", "css": "text/css", "html": "text/html",
          "woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf", "json": "application/json",
          "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
          "webp": "image/webp", "gif": "image/gif", "avif": "image/avif",
        ][file.pathExtension] ?? "application/octet-stream"
      task.didReceive(
        URLResponse(
          url: url, mimeType: mime, expectedContentLength: data.count,
          textEncodingName: ["js", "css", "html", "json"].contains(file.pathExtension)
            ? "utf-8" : nil))
      task.didReceive(data)
      task.didFinish()
    } catch { task.didFailWithError(error) }
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
final class NativeWindowHost: NSObject, NSWindowDelegate, WKScriptMessageHandler,
  WKNavigationDelegate, WKUIDelegate
{
  let owner: NativeApplication
  let seed: SessionRecord?
  init(owner: NativeApplication, directory: URL, seed: SessionRecord? = nil) {
    self.owner = owner
    self.seed = seed
    super.init()
    self.store = DocumentStore(directory)
  }
  var window: NSWindow!
  var webView: WKWebView!
  var store: DocumentStore!
  var pdfExporter: PDFExporter?
  var closing = false
  var undoAvailable = false
  var redoAvailable = false
  var richMode = false
  var titleObservation: NSKeyValueObservation?
  func show(hidden: Bool = false) {
    let configuration = WKWebViewConfiguration()
    let content = WKUserContentController()
    content.add(self, name: "opentypora")
    let script = try! String(
      contentsOf: Bundle.main.resourceURL!.appendingPathComponent("bridge.js"), encoding: .utf8)
    content.addUserScript(
      WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    configuration.userContentController = content
    let resources = Resources(Bundle.main.resourceURL!.appendingPathComponent("dist"), store: store)
    configuration.setURLSchemeHandler(resources, forURLScheme: "opentypora")
    configuration.setURLSchemeHandler(resources, forURLScheme: "open-typora-asset")
    webView = WKWebView(
      frame: NSRect(x: 0, y: 0, width: 1380, height: 960), configuration: configuration)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    window = NSWindow(
      contentRect: webView.frame,
      styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
      backing: .buffered, defer: false)
    window.title = "Open Typora"
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.isReleasedWhenClosed = false
    window.minSize = NSSize(width: 660, height: 500)
    window.contentView = webView
    window.delegate = self
    titleObservation = webView.observe(\.title, options: [.new]) { [weak self] view, _ in
      self?.window.title = view.title ?? "Open Typora"
    }
    if !hidden {
      buildMenu()
      window.center()
      window.makeKeyAndOrderFront(nil)
      NSApp.activate(ignoringOtherApps: true)
    }
    webView.load(URLRequest(url: URL(string: "opentypora://app/index.html")!))
  }
  func windowShouldClose(_ sender: NSWindow) -> Bool {
    if closing { return true }
    send("close-window")
    return false
  }
  func send(_ action: String, record: DocumentRecord? = nil) {
    var message: [String: Any] = ["action": action]
    if let record { message["document"] = try? jsonValue(record) }
    guard let bytes = try? JSONSerialization.data(withJSONObject: message),
      let text = String(data: bytes, encoding: .utf8)
    else { return }
    webView?.evaluateJavaScript("window.__openTypora?.command(\(text))", completionHandler: nil)
  }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "opentypora",
      message.frameInfo.securityOrigin.host == "app", let request = message.body as? [String: Any],
      let id = request["id"] as? String, let name = request["name"] as? String,
      let args = request["args"] as? [Any]
    else { return }
    #if WEBTEST
      if name == "progress" {
        print("TEST:", args.first ?? "")
        return
      }
    #endif
    if name == "exportPdf" {
      do {
        let html = try arg(args, 0, String.self)
        guard html.utf8.count <= 50 * 1024 * 1024 else { throw NativeFailure("导出内容过大。") }
        #if WEBTEST
          let destination = store.dataDirectory.appendingPathComponent("native-test.pdf")
        #else
          let panel = NSSavePanel()
          panel.allowedContentTypes = [.pdf]
          panel.nameFieldStringValue = "文档.pdf"
          guard panel.runModal() == .OK, let destination = panel.url else {
            reply(id, ["ok": true, "value": NSNull()])
            return
          }
        #endif
        let exporter = PDFExporter(
          resources: Bundle.main.resourceURL!.appendingPathComponent("dist"), store: store)
        pdfExporter = exporter
        exporter.export(html) { [weak self] result in
          guard let self else { return }
          do {
            try atomicWrite(destination, try result.get())
            self.reply(id, ["ok": true, "value": destination.path])
          } catch {
            self.reply(
              id, ["ok": false, "error": error.localizedDescription, "code": "DOCUMENT_ERROR"])
          }
          self.pdfExporter = nil
        }
      } catch {
        reply(id, ["ok": false, "error": error.localizedDescription, "code": "DOCUMENT_ERROR"])
      }
      return
    }
    do {
      let value = try handle(name, args)
      reply(id, ["ok": true, "value": value ?? NSNull()])
    } catch {
      reply(
        id,
        [
          "ok": false, "error": error.localizedDescription,
          "code": (error as? NativeFailure)?.code ?? "DOCUMENT_ERROR",
        ])
    }
  }
  func reply(_ id: String, _ result: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: ["id": id, "result": result]),
      let text = String(data: data, encoding: .utf8)
    else { return }
    webView.evaluateJavaScript("window.__openTypora.receive(\(text))", completionHandler: nil)
  }
  func arg<T>(_ args: [Any], _ index: Int, _ type: T.Type) throws -> T {
    guard args.indices.contains(index), let value = args[index] as? T else {
      throw NativeFailure("请求参数无效。")
    }
    return value
  }
  func chooseFile(_ saving: Bool, name: String? = nil, folder: Bool = false) -> URL? {
    if saving {
      let panel = NSSavePanel()
      panel.nameFieldStringValue = name ?? "未命名.md"
      panel.allowedContentTypes = [UTType(filenameExtension: "md") ?? .plainText]
      return panel.runModal() == .OK ? panel.url : nil
    }
    let panel = NSOpenPanel()
    panel.canChooseDirectories = folder
    panel.canChooseFiles = !folder
    panel.allowsMultipleSelection = false
    if !folder {
      panel.allowedContentTypes = [
        UTType(filenameExtension: "md") ?? .plainText,
        UTType(filenameExtension: "markdown") ?? .plainText,
      ]
    }
    return panel.runModal() == .OK ? panel.url : nil
  }
  func confirm(_ title: String, detail: String, yes: String) -> Bool {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = detail
    alert.addButton(withTitle: "取消")
    alert.addButton(withTitle: yes)
    return alert.runModal() == .alertSecondButtonReturn
  }
  func handle(_ name: String, _ args: [Any]) throws -> Any? {
    switch name {
    case "restore":
      if let seed {
        for record in seed.documents { store.records[record.id] = record }
        store.activeId = seed.activeId
        if let folder = seed.folder { _ = try? store.scan(URL(fileURLWithPath: folder)) }
        return try jsonValue(seed)
      }
      if let session = try store.restore() { return try jsonValue(session) }
      let samples =
        try JSONSerialization.jsonObject(
          with: Data(contentsOf: Bundle.main.resourceURL!.appendingPathComponent("samples.json")))
        as! [[String: String]]
      let folder = store.dataDirectory.appendingPathComponent("示例笔记")
      var records = [DocumentRecord]()
      for sample in samples {
        let file = folder.appendingPathComponent(sample["name"]!)
        if !FileManager.default.fileExists(atPath: file.path) {
          try atomicWrite(file, Data(sample["content"]!.utf8))
        }
        records.append(try store.open(file))
      }
      _ = try store.scan(folder)
      return try jsonValue(
        SessionRecord(documents: records, activeId: records.first?.id, folder: folder.path))
    case "registerDraft":
      let value = try arg(args, 0, [String: Any].self)
      let record = try JSONDecoder().decode(
        DocumentRecord.self, from: JSONSerialization.data(withJSONObject: value))
      return try jsonValue(store.draft(record))
    case "open":
      guard let file = chooseFile(false) else { return nil }
      return try jsonValue(store.open(file))
    case "openFolder":
      guard let file = chooseFile(false, folder: true) else { return nil }
      return try store.scan(file)
    case "scan": return try store.scan()
    case "openToken":
      let token = try arg(args, 0, String.self)
      guard let file = store.tokens[token] else { throw NativeFailure("目录已更新，请刷新后重试。") }
      return try jsonValue(store.open(file))
    case "save":
      let id = try arg(args, 0, String.self)
      let text = try arg(args, 1, String.self)
      let saveAs = args.count > 2 ? args[2] as? Bool ?? false : false
      let force = args.count > 3 ? args[3] as? Bool ?? false : false
      let record = try store.require(id)
      let destination: URL?
      if record.path == nil || saveAs {
        guard let selected = chooseFile(true, name: record.name) else { return nil }
        destination = selected
      } else {
        destination = nil
      }
      if force && !confirm("覆盖磁盘上的修改？", detail: "当前草稿将替换磁盘文件。也可以取消并另存为副本。", yes: "覆盖") {
        return nil
      }
      return try jsonValue(store.save(id, text: text, destination: destination, force: force))
    case "persist":
      let value = try arg(args, 0, [String: Any].self)
      var json = value
      json["version"] = 1
      let incoming = try JSONDecoder().decode(
        SessionRecord.self, from: JSONSerialization.data(withJSONObject: json))
      try store.persist(incoming)
      return nil
    case "check": return try store.check(arg(args, 0, String.self))
    case "reload":
      let id = try arg(args, 0, String.self)
      let record = try store.require(id)
      guard let path = record.path else { return try jsonValue(record) }
      return try jsonValue(store.open(URL(fileURLWithPath: path), id: id))
    case "acceptDisk":
      return try jsonValue(
        store.accept(
          arg(args, 0, String.self), content: arg(args, 1, String.self),
          digest: arg(args, 2, String.self)))
    case "importImage":
      let id = try arg(args, 0, String.self)
      let encoded = try arg(args, 1, String.self)
      let filename = try arg(args, 2, String.self)
      guard encoded.count <= 28 * 1024 * 1024, let bytes = Data(base64Encoded: encoded) else {
        throw NativeFailure("图片数据无效。")
      }
      return try store.importImage(id, bytes: bytes, name: filename)
    case "openLink":
      let address = try arg(args, 0, String.self)
      guard let url = URL(string: address),
        ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "")
      else { throw NativeFailure("链接类型不支持。") }
      if confirm("打开外部链接？", detail: address, yes: "打开") { NSWorkspace.shared.open(url) }
      return nil
    case "confirmClose":
      #if WEBTEST
        return "cancel"
      #else
        let alert = NSAlert()
        alert.messageText = "保存对“\(try arg(args, 0, String.self))”所做的修改？"
        alert.informativeText = "保存后关闭文档，或选择不保存这次修改。"
        alert.addButton(withTitle: "保存")
        alert.addButton(withTitle: "取消")
        alert.addButton(withTitle: "不保存")
        let response = alert.runModal()
        return response == .alertFirstButtonReturn
          ? "save" : response == .alertSecondButtonReturn ? "cancel" : "discard"
      #endif
    case "confirmDiscard":
      return confirm("关闭「\(try arg(args, 0, String.self))」？", detail: "此操作移除未保存的修改。", yes: "关闭")
    case "historyState":
      undoAvailable = try arg(args, 0, Bool.self)
      redoAvailable = try arg(args, 1, Bool.self)
      richMode = args.count > 2 ? (args[2] as? Bool ?? false) : false
      return nil
    case "setDirty":
      window.isDocumentEdited = try arg(args, 0, Bool.self)
      return nil
    case "cancelClose":
      owner.cancelTermination()
      return nil
    case "closeWindow":
      closing = true
      DispatchQueue.main.async { self.owner.windowClosed(self) }
      return nil
    default: throw NativeFailure("请求方法不支持。")
    }
  }
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    decisionHandler(
      action.request.url?.scheme == "opentypora" && action.request.url?.host == "app"
        ? .allow : .cancel)
  }
  func webView(
    _ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
    defaultText: String?, initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (String?) -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = prompt
    let field = NSTextField(string: defaultText ?? "")
    field.frame = NSRect(x: 0, y: 0, width: 280, height: 24)
    alert.accessoryView = field
    alert.addButton(withTitle: "确定")
    alert.addButton(withTitle: "取消")
    alert.window.initialFirstResponder = field
    completionHandler(alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
  }
  func webView(
    _ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void
  ) { completionHandler(confirm(message, detail: "", yes: "确定")) }
  func buildMenu() {
    let main = NSMenu()
    NSApp.mainMenu = main
    func group(_ title: String, _ items: [(String, String, String)]) {
      let root = NSMenuItem(title: title, action: nil, keyEquivalent: "")
      let menu = NSMenu(title: title)
      root.submenu = menu
      main.addItem(root)
      for (label, action, key) in items {
        if label.isEmpty {
          menu.addItem(.separator())
          continue
        }
        let item = NSMenuItem(
          title: label, action: #selector(NativeApplication.command(_:)),
          keyEquivalent: key.replacingOccurrences(of: "⇧", with: ""))
        item.target = owner
        item.representedObject = action
        item.keyEquivalentModifierMask = key.hasPrefix("⇧") ? [.command, .shift] : [.command]
        menu.addItem(item)
      }
    }
    group(
      "Open Typora",
      [("关于 Open Typora", "about", ""), ("", "", ""), ("退出 Open Typora", "quit", "q")])
    group(
      "文件",
      [
        ("新建", "new", "n"), ("打开文件…", "open", "o"), ("打开文件夹…", "folder", ""), ("", "", ""),
        ("保存", "save", "s"), ("另存为…", "saveAs", "⇧s"), ("导出 PDF…", "pdf", ""), ("", "", ""),
        ("关闭窗口", "close-window", "w"),
      ])
    group("编辑", [("撤销", "undo", "z"), ("重做", "redo", "⇧z"), ("", "", ""), ("查找", "find", "f")])
    let edit = main.items[2].submenu!
    for (title, selector, key) in [
      ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a"),
    ] { edit.addItem(NSMenuItem(title: title, action: Selector(selector), keyEquivalent: key)) }
    group("格式", [("粗体", "bold", "b"), ("斜体", "italic", "i"), ("代码块", "code", "")])
    group(
      "显示",
      [
        ("源码模式", "source", "/"), ("专注模式", "focus", "⇧f"), ("显示／隐藏侧栏", "sidebar", "\\"),
        ("大纲", "outline", ""), ("文件列表", "files", ""), ("切换明暗主题", "theme", ""),
      ])
    let windows = NSMenuItem(title: "窗口", action: nil, keyEquivalent: "")
    let menu = NSMenu(title: "窗口")
    menu.addItem(
      NSMenuItem(
        title: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m"))
    menu.addItem(
      NSMenuItem(title: "全屏", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: ""))
    windows.submenu = menu
    main.addItem(windows)
    NSApp.windowsMenu = menu
  }
}
final class NativeApplication: NSObject, NSApplicationDelegate, NSMenuItemValidation {
  var hosts = [NativeWindowHost]()
  var terminating = false
  var launched = false
  var files = [URL]()
  lazy var directory: URL =
    ProcessInfo.processInfo.environment["OPEN_TYPORA_DATA_DIR"].map { URL(fileURLWithPath: $0) }
    ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent(
      Bundle.main.bundleIdentifier?.hasSuffix(".preview") == true
        ? "Open Typora Preview" : "Open Typora")
  var current: NativeWindowHost? {
    hosts.first(where: { $0.window === NSApp.keyWindow }) ?? hosts.first(where: {
      $0.window === NSApp.mainWindow
    }) ?? hosts.last
  }
  func makeWindow(directory location: URL, seed: SessionRecord? = nil) {
    let host = NativeWindowHost(owner: self, directory: location, seed: seed)
    hosts.append(host)
    host.show()
  }
  func applicationDidFinishLaunching(_ notification: Notification) {
    launched = true
    makeWindow(directory: directory)
    let secondary = directory.appendingPathComponent("windows")
    if let folders = try? FileManager.default.contentsOfDirectory(
      at: secondary, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])
    {
      for folder in folders
      where FileManager.default.fileExists(
        atPath: folder.appendingPathComponent("session.json").path)
        && !FileManager.default.fileExists(atPath: folder.appendingPathComponent("closed").path)
      { makeWindow(directory: folder) }
    }
    for file in files { openWindow(file) }
    files.removeAll()
  }
  func application(_ sender: NSApplication, openFiles filenames: [String]) {
    for name in filenames {
      let file = URL(fileURLWithPath: name)
      if launched { openWindow(file) } else { files.append(file) }
    }
    sender.reply(toOpenOrPrint: .success)
  }
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
    if !hasVisibleWindows { newWindow() }
    return true
  }
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    if hosts.isEmpty { return .terminateNow }
    if terminating { return .terminateLater }
    terminating = true
    for host in hosts { host.send("quit") }
    return .terminateLater
  }
  func newWindow() {
    let id = UUID().uuidString
    let location = directory.appendingPathComponent("windows/" + id)
    let draft = DocumentRecord(
      id: id, name: "未命名.md", content: "", savedContent: "", lineEnding: "\n")
    makeWindow(directory: location, seed: SessionRecord(documents: [draft], activeId: id))
  }
  func openWindow(_ file: URL) {
    let resolved = file.resolvingSymlinksInPath().path
    if let existing = hosts.first(where: { host in
      host.store.records.values.contains { $0.path == resolved }
    }) {
      existing.window.makeKeyAndOrderFront(nil)
      if let record = existing.store.records.values.first(where: { $0.path == resolved }) {
        existing.send("opened", record: record)
      }
      return
    }
    let location = directory.appendingPathComponent("windows/" + UUID().uuidString)
    do {
      let record = try DocumentStore(location).open(file)
      makeWindow(directory: location, seed: SessionRecord(documents: [record], activeId: record.id))
    } catch {
      let alert = NSAlert()
      alert.messageText = error.localizedDescription
      alert.runModal()
    }
  }
  func windowClosed(_ host: NativeWindowHost) {
    if !terminating, host.store.dataDirectory != directory {
      try? atomicWrite(host.store.dataDirectory.appendingPathComponent("closed"), Data())
    }
    host.titleObservation?.invalidate()
    host.webView.configuration.userContentController.removeScriptMessageHandler(
      forName: "opentypora")
    host.webView.stopLoading()
    host.window.close()
    hosts.removeAll(where: { $0 === host })
    if terminating && hosts.isEmpty { NSApp.reply(toApplicationShouldTerminate: true) }
  }
  func cancelTermination() {
    if terminating {
      terminating = false
      NSApp.reply(toApplicationShouldTerminate: false)
    }
  }
  func validateMenuItem(_ item: NSMenuItem) -> Bool {
    if ["bold", "italic", "code"].contains(item.representedObject as? String ?? "") {
      return current?.richMode == true
    }
    if item.representedObject as? String == "undo" { return current?.undoAvailable == true }
    if item.representedObject as? String == "redo" { return current?.redoAvailable == true }
    return true
  }
  @objc func command(_ sender: NSMenuItem) {
    guard let action = sender.representedObject as? String else { return }
    if action == "new" {
      newWindow()
    } else if action == "open" {
      if let file = current?.chooseFile(false) { openWindow(file) }
    } else if action == "quit" {
      NSApp.terminate(nil)
    } else if action == "close-window" {
      current?.send("close-window")
    } else {
      current?.send(action)
    }
  }
}
#if !WEBTEST
  @main struct OpenTyporaMain {
    static func main() {
      if CommandLine.arguments.contains("--store-test") {
        do { try runStoreTests() } catch {
          fputs("\(error)\n", stderr)
          exit(1)
        }
        return
      }
      let application = NSApplication.shared
      let delegate = NativeApplication()
      application.delegate = delegate
      application.setActivationPolicy(.regular)
      application.run()
      withExtendedLifetime(delegate) {}
    }
  }

#endif
