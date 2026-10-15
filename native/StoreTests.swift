import Foundation

func runStoreTests() throws {
  let fm = FileManager.default
  let directory = fm.temporaryDirectory.appendingPathComponent(
    "open-typora-native-tests-\(UUID().uuidString)").resolvingSymlinksInPath()
  try fm.createDirectory(at: directory, withIntermediateDirectories: true)
  func expect(_ condition: @autoclosure () throws -> Bool, _ name: String) throws {
    if try !condition() { throw NativeFailure("FAIL: \(name)") }
    print("PASS: \(name)")
  }
  let file = directory.appendingPathComponent("original.md")
  let original = Data("\u{feff}---\r\ntitle: 中文\r\n---\r\n\r\n# 标题\r\n\r\n保留两个空格  \r\n".utf8)
  try atomicWrite(file, original)
  try fm.setAttributes([.posixPermissions: 0o640], ofItemAtPath: file.path)
  let store = DocumentStore(directory.appendingPathComponent("data"))
  let record = try store.open(file)
  try expect(
    record.bom == true && record.lineEnding == "\r\n" && !record.content.hasPrefix("\u{feff}"),
    "decode BOM and CRLF")
  _ = try store.save(record.id, text: record.content + "新增中文")
  let saved = try Data(contentsOf: file)
  try expect(
    saved == original + Data("新增中文".utf8),
    "native save preserves encoding, trailing spaces and bytes")
  let mode = try fm.attributesOfItem(atPath: file.path)[.posixPermissions] as! NSNumber
  try expect(mode.intValue == 0o640, "save preserves file permissions")
  try atomicWrite(file, Data("外部修改".utf8))
  let ownedHash = try store.require(record.id).diskHash
  _ = try store.open(file)
  try expect(try store.require(record.id).diskHash == ownedHash, "reopening an owned path cannot silently accept external changes")
  do {
    _ = try store.save(record.id, text: "覆盖")
    throw NativeFailure("Unexpected overwrite")
  } catch let error as NativeFailure {
    try expect(error.code == "EXTERNAL_CHANGE", "external edits fail closed")
  }
  let draft = DocumentRecord(
    id: UUID().uuidString, name: "未命名.md", content: "# 草稿", savedContent: "", lineEnding: "\n")
  _ = try store.draft(draft)
  var dirty = try store.require(record.id)
  dirty.content += "未保存"
  try store.persist(SessionRecord(documents: [dirty, draft], activeId: draft.id))
  let recovered = try DocumentStore(store.dataDirectory).restore()!
  try expect(
    recovered.documents.first?.conflict == true && recovered.documents.last?.content == "# 草稿",
    "recovery retains dirty file conflict and untitled draft")
  let change = try store.check(record.id)!
  _ = try store.accept(
    record.id, content: change["content"] as! String, digest: change["diskHash"] as! String)
  try expect(
    try store.require(record.id).content == "外部修改",
    "external change acceptance updates owned record")
  let same = try Data(contentsOf: file)
  do {
    try atomicWrite(file, Data("broken".utf8), beforeCommit: { throw NativeFailure("aborted") })
  } catch {}
  try expect(try Data(contentsOf: file) == same, "failed atomic commit retains original")
  try fm.createSymbolicLink(
    at: directory.appendingPathComponent("shortcut.md"), withDestinationURL: file)
  let scan = try store.scan(directory)
  let files = scan["files"] as! [[String: String]]
  try expect(files.allSatisfy { $0["name"] != "shortcut.md" }, "folder inventory excludes symlinks")
  let outside = fm.temporaryDirectory.appendingPathComponent("outside-\(UUID().uuidString).png")
  try atomicWrite(outside, Data(repeating: 1, count: 20))
  try fm.createSymbolicLink(
    at: directory.appendingPathComponent("outside.png"), withDestinationURL: outside)
  do {
    _ = try store.asset(record.id, relative: "outside.png")
    throw NativeFailure("escaped")
  } catch let error as NativeFailure {
    try expect(error.message.contains("之外"), "local asset symlink cannot escape document grant")
  }
  let png = Data([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
  let relative = try store.importImage(record.id, bytes: png, name: "图片.png")
  try expect(
    try Data(contentsOf: store.asset(record.id, relative: relative)) == png,
    "native image import and scoped read retain bytes")
  try store.persist(SessionRecord(documents: [], activeId: nil))
  let reopened = try store.reopen(record.id)
  try expect(reopened.id == record.id && reopened.content == "外部修改", "reopen reads the current disk content with the same owned id")
  do { _ = try store.reopen("unknown"); throw NativeFailure("unowned reopen") }
  catch let error as NativeFailure { try expect(error.message.contains("不可用"), "reopen refuses an unknown document id") }
  let workspace = Workspace(store.dataDirectory)
  _ = try store.scan(directory)
  var latest = try store.require(record.id); latest.content = "未保存内容\r\n"; store.records[record.id] = latest
  let renamed = try workspace.execute(["action": "rename", "path": file.path, "name": "renamed.md"], store: store)
  store.applyPathChange(renamed)
  try expect(try store.require(record.id).content == latest.content && store.require(record.id).path == renamed["toPath"], "rename keeps the dirty draft and updates its owned path")
  try expect(try String(contentsOfFile: renamed["toPath"]!, encoding: .utf8) == "外部修改", "rename does not overwrite the disk with a dirty draft")
  let reversed = try workspace.execute(["action": "undo"], store: store); store.applyPathChange(reversed)
  try expect(try store.require(record.id).path == canonicalFileURL(file).path, "undo restores the original file path")
  let copied = try workspace.execute(["action": "duplicate", "path": file.path, "name": "copy.md"], store: store)
  try expect(try String(contentsOfFile: copied["newPath"]!, encoding: .utf8) == latest.content, "duplicate includes the latest unsaved content")
  do { _ = try workspace.execute(["action": "rename", "path": file.path, "name": "copy.md"], store: store); throw NativeFailure("overwrite") }
  catch let error as NativeFailure { try expect(error.message.contains("已存在"), "file operations refuse an occupied destination") }
  _ = try workspace.execute(["action": "new-folder", "path": directory.path, "name": "empty-folder"], store: store)
  let scanAgain = try store.scan()["files"] as! [[String: String]]
  try expect(scanAgain.contains { $0["name"] == "empty-folder" && $0["isDirectory"] == "true" }, "inventory includes empty folders")
  let search = try Workspace.search(scanAgain, query: "外部", regex: false, caseSensitive: true)
  try expect((search["matches"] as! [[String: Any]]).contains { $0["line"] as? Int == 1 && $0["path"] as? String == canonicalFileURL(file).path }, "folder search returns real file and source line")
  try workspace.remember(directory, folder: true); try workspace.remember(file, folder: false)
  _ = try workspace.recentAction("pin", path: directory.path); _ = try workspace.recentAction("clear", path: "")
  try expect(workspace.recent().count == 1 && workspace.recent()[0].pinned, "recent folders retain pinned entries across clearing")
  let trashChange = try workspace.execute(["action": "trash", "path": copied["newPath"]!], store: store)
  try expect(!fm.fileExists(atPath: trashChange["removedPath"]!), "delete moves an owned fixture to macOS Trash")
  _ = try workspace.execute(["action": "undo"], store: store)
  try expect(fm.fileExists(atPath: copied["newPath"]!), "undo Trash restores the original fixture bytes and location")
  let word = directory.appendingPathComponent("exported.docx")
  try Interchange.export("docx", source: "# Word\n\n中文 **粗体**", html: "<html><body><h1>Word</h1><p>中文 <b>粗体</b></p></body></html>", destination: word, workingDirectory: directory, temporaryDirectory: store.dataDirectory)
  try expect(try Data(contentsOf: word).starts(with: [0x50, 0x4b]), "Word export creates an actual DOCX archive")
  let imported = try Interchange.importFile(word, directory: store.dataDirectory)
  try expect((imported["html"] ?? imported["markdown"] ?? "").contains("中文"), "Word import retains Chinese document content")
  let encodingStore = DocumentStore(directory.appendingPathComponent("encoding-data"))
  // Actual byte fixtures exercise the same codecs and atomic saves as the installed host.
  for encoding in DocumentStore.encodings {
    let text = encoding == "windows-1252" ? "# Café €\r\n" : encoding == "shift_jis" ? "# 日本語\r\n" : "# 中文測試\r\n"
    for bom in [false, true] where !bom || encoding.hasPrefix("utf-") {
      let file = directory.appendingPathComponent("encoding-" + encoding + (bom ? "-bom" : "") + ".md")
      let bytes = try DocumentStore.encode(text, encoding: encoding, bom: bom)
      try atomicWrite(file, bytes)
      let opened = try encodingStore.open(file, encoding: bom || encoding == "utf-8" ? nil : encoding)
      let written = try encodingStore.save(opened.id, text: opened.content + "OK")
      try expect(written.content == text + "OK" && written.encoding == encoding && written.bom == bom && Data(contentsOf: file) == DocumentStore.encode(text + "OK", encoding: encoding, bom: bom), "byte roundtrip " + encoding + (bom ? " BOM" : ""))
    }
  }
  let imageDraft = DocumentRecord(id: "draft-image", name: "图片草稿.md", content: "", savedContent: "", lineEnding: "\n")
  _ = try encodingStore.draft(imageDraft)
  let draftImagePath = try encodingStore.importImage(imageDraft.id, bytes: png, name: "草稿图片.png")
  try expect(draftImagePath.hasPrefix("/") && Data(contentsOf: encodingStore.asset(imageDraft.id, relative: draftImagePath)) == png, "untitled image insertion persists an owned asset before the first save")
  let encodedFiles = try encodingStore.scan(directory)["files"] as! [[String: String]]
  let codecSearch = try Workspace.search(encodedFiles, query: "中文測試", regex: false, caseSensitive: true, encodings: Dictionary(encodingStore.records.values.compactMap { record in record.path.map { ($0, record.encoding ?? "utf-8") } }, uniquingKeysWith: { a, _ in a }))
  try expect((codecSearch["matches"] as? [[String: Any]] ?? []).count >= 8, "folder search reads BOM Unicode and explicitly opened legacy encodings")
  let lossFile = directory.appendingPathComponent("loss.md"); try atomicWrite(lossFile, Data("original".utf8))
  let lossRecord = try encodingStore.open(lossFile)
  do { _ = try encodingStore.save(lossRecord.id, text: "中文😀", encoding: "windows-1252", bom: false); throw NativeFailure("lossy save") }
  catch let error as NativeFailure { try expect(error.code == "ENCODING_LOSS" && Data(contentsOf: lossFile) == Data("original".utf8) && encodingStore.require(lossRecord.id).encoding == "utf-8", "unrepresentable conversion retains disk and owned metadata") }
  let utf16 = try encodingStore.save(lossRecord.id, text: "中文😀\r\n", encoding: "utf-16be", bom: true)
  try encodingStore.persist(SessionRecord(documents: [utf16], activeId: utf16.id))
  let encodingRecovery = try DocumentStore(encodingStore.dataDirectory).restore()!
  try expect(encodingRecovery.documents.first?.encoding == "utf-16be" && encodingRecovery.documents.first?.content == "中文😀\r\n", "encoding and Unicode survive recovery")
  try atomicWrite(lossFile, try DocumentStore.encode("外部 GBK", encoding: "gbk", bom: false))
  do { _ = try encodingStore.save(utf16.id, text: "overwrite", encoding: "gbk"); throw NativeFailure("overwrite") }
  catch let error as NativeFailure { try expect(error.code == "EXTERNAL_CHANGE", "conversion still refuses external disk edits") }
  let redecoded = try encodingStore.open(lossFile, id: utf16.id, encoding: "gbk")
  try expect(redecoded.content == "外部 GBK" && redecoded.encoding == "gbk", "explicit reopen decodes the actual file without rewriting it")
  if Interchange.pandoc() != nil {
    let rtf = directory.appendingPathComponent("complex.rtf")
    let base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII="
    let complex = "# 复杂标题\n\n| 项目 | 内容 |\n| --- | --- |\n| 中文甲 | 完整单元格 |\n\n脚注引用[^n]。\n\n[^n]: 中文脚注内容。\n\n![图片](data:image/png;base64," + base64 + ")\n\n```javascript\nconst message = \"中文代码\";\n```\n"
    try Interchange.export("rtf", source: complex, html: "<p>中文</p>", destination: rtf, workingDirectory: directory, temporaryDirectory: store.dataDirectory)
    let roundtrip = try Interchange.importFile(rtf, directory: store.dataDirectory)["markdown"] ?? ""
    try expect(roundtrip.contains("中文甲") && roundtrip.contains("完整单元格"), "complex RTF import retains actual table contents")
    try expect(roundtrip.contains("[^rtf-note-1]") && roundtrip.contains("中文脚注内容"), "complex RTF import retains note position and content")
    try expect(roundtrip.contains("![导入图片]"), "complex RTF import extracts the actual PNG")
    try expect(roundtrip.contains("中文代码"), "complex RTF import retains code")
    if !roundtrip.contains("# 复杂标题") { print("RTF OUTPUT:", roundtrip) }
    try expect(roundtrip.contains("# 复杂标题"), "complex RTF import retains semantic heading level")
    let malformed = directory.appendingPathComponent("malformed.rtf"); try atomicWrite(malformed, Data("{\\rtf1 unclosed".utf8))
    do { _ = try Interchange.importFile(malformed, directory: store.dataDirectory); throw NativeFailure("malformed RTF accepted") }
    catch let error as NativeFailure { try expect(error.message.contains("闭合"), "malformed RTF fails explicitly without creating a partial imported document") }
  }
  let css = directory.appendingPathComponent("owned-theme.css")
  try atomicWrite(css, Data("#write { color: #123456; }".utf8))
  let installedTheme = try Interchange.installTheme(css, directory: store.dataDirectory)
  try expect(try Interchange.themes(store.dataDirectory).contains { $0["id"] == installedTheme && $0["css"]!.contains("#123456") }, "CSS theme installation persists the selected theme")
  var imageRecord = try store.require(record.id); imageRecord.content = "---\ntypora-copy-images-to: assets/${filename}\n---\n"; store.records[record.id] = imageRecord
  let configuredImage = try store.importImage(record.id, bytes: png, name: "configured.png")
  try expect(configuredImage.hasPrefix("assets/original/"), "document YAML controls the image copy folder")
  try expect(try Data(contentsOf: store.asset(record.id, relative: configuredImage)) == png, "copied image remains readable through its relative reference")
  try atomicWrite(store.dataDirectory.appendingPathComponent("session.json"), Data("invalid".utf8))
  let corrupt = try DocumentStore(store.dataDirectory).restore()!
  let backups = try fm.contentsOfDirectory(atPath: store.dataDirectory.path)
  try expect(
    corrupt.restoreError != nil && backups.contains(where: { $0.hasPrefix("session-backup-") }),
    "corrupt session is retained as backup")
  print("Native document store checks passed. Artifacts: \(directory.path)")
}
