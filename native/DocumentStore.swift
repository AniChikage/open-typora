import CryptoKit
import Darwin
import Foundation

struct NativeFailure: Error, LocalizedError {
  let message: String
  let code: String
  init(_ message: String, _ code: String = "DOCUMENT_ERROR") {
    self.message = message
    self.code = code
  }
  var errorDescription: String? { message }
}
struct DocumentRecord: Codable {
  var id: String
  var path: String?
  var name: String
  var content: String
  var savedContent: String
  var diskHash: String?
  var lineEnding: String
  var conflict: Bool?
  var bom: Bool?
}
struct SessionRecord: Codable {
  var version: Int = 1
  var documents: [DocumentRecord]
  var activeId: String?
  var folder: String?
  var restoreError: String?
}
func hashData(_ data: Data) -> String {
  SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}
func contained(_ base: URL, _ target: URL) -> Bool {
  let prefix = base.standardizedFileURL.path + "/"
  return target.standardizedFileURL.path.hasPrefix(prefix)
}
func atomicWrite(_ url: URL, _ data: Data, beforeCommit: (() throws -> Void)? = nil) throws {
  let fm = FileManager.default
  try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
  let temp = url.deletingLastPathComponent().appendingPathComponent(
    ".\(url.lastPathComponent).\(UUID().uuidString).tmp")
  let mode =
    (try? fm.attributesOfItem(atPath: url.path)[.posixPermissions] as? NSNumber)?.uint16Value
    ?? 0o600
  let descriptor = Darwin.open(temp.path, O_CREAT | O_EXCL | O_WRONLY, mode_t(mode))
  guard descriptor >= 0 else { throw NativeFailure("无法创建保存临时文件。") }
  defer {
    Darwin.close(descriptor)
    try? fm.removeItem(at: temp)
  }
  try data.withUnsafeBytes { bytes in
    var count = 0
    while count < bytes.count {
      let written = Darwin.write(
        descriptor, bytes.baseAddress!.advanced(by: count), bytes.count - count)
      if written < 0 {
        if errno == EINTR { continue }
        throw NativeFailure("无法写入文件。")
      }
      if written == 0 { throw NativeFailure("文件写入未完成。") }
      count += written
    }
  }
  guard Darwin.fsync(descriptor) == 0 else { throw NativeFailure("文件同步失败。") }
  try beforeCommit?()
  guard Darwin.rename(temp.path, url.path) == 0 else { throw NativeFailure("无法提交保存文件。") }
}
final class DocumentStore {
  let dataDirectory: URL
  var records = [String: DocumentRecord]()
  var tokens = [String: URL]()
  var folder: URL?
  var activeId: String?
  static let maxBytes = 20 * 1024 * 1024
  init(_ directory: URL) { dataDirectory = directory }
  func require(_ id: String) throws -> DocumentRecord {
    guard let record = records[id] else { throw NativeFailure("文件已关闭，请重新打开。") }
    return record
  }
  func decode(_ data: Data) throws -> (String, Bool) {
    guard data.count <= Self.maxBytes else { throw NativeFailure("文件超过支持的 20 MB。") }
    let bom = data.starts(with: [0xef, 0xbb, 0xbf])
    let content = bom ? data.dropFirst(3) : data[...]
    guard let text = String(data: content, encoding: .utf8) else {
      throw NativeFailure("文件不是有效的 UTF-8 文本。")
    }
    return (text, bom)
  }
  func open(_ file: URL, id: String? = nil) throws -> DocumentRecord {
    let resolved = file.resolvingSymlinksInPath().standardizedFileURL
    guard ["md", "markdown", "mdown"].contains(resolved.pathExtension.lowercased()) else {
      throw NativeFailure("请选择 Markdown 文件。")
    }
    let values = try resolved.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, (values.fileSize ?? Self.maxBytes + 1) <= Self.maxBytes
    else { throw NativeFailure("文件内容无效或超过 20 MB。") }
    let bytes = try Data(contentsOf: resolved)
    let (text, bom) = try decode(bytes)
    let record = DocumentRecord(
      id: id ?? records.values.first(where: { $0.path == resolved.path })?.id ?? UUID().uuidString,
      path: resolved.path, name: resolved.lastPathComponent, content: text, savedContent: text,
      diskHash: hashData(bytes), lineEnding: text.contains("\r\n") ? "\r\n" : "\n", conflict: false,
      bom: bom)
    records[record.id] = record
    return record
  }
  func draft(_ record: DocumentRecord) throws -> DocumentRecord {
    guard record.path == nil, records[record.id]?.path == nil,
      record.content.utf8.count <= Self.maxBytes
    else { throw NativeFailure("草稿格式无效。") }
    records[record.id] = record
    return record
  }
  func save(_ id: String, text: String, destination: URL? = nil, force: Bool = false) throws
    -> DocumentRecord
  {
    var record = try require(id)
    guard text.utf8.count <= Self.maxBytes else { throw NativeFailure("内容超过支持的 20 MB。") }
    guard let target = destination ?? record.path.map({ URL(fileURLWithPath: $0) }) else {
      throw NativeFailure("请先为草稿选择保存位置。")
    }
    let same = record.path == target.path
    let verify = {
      if same && !force {
        guard let bytes = try? Data(contentsOf: target), hashData(bytes) == record.diskHash else {
          throw NativeFailure("磁盘文件已被其他程序修改，草稿已保留。", "EXTERNAL_CHANGE")
        }
      }
    }
    try verify()
    var bytes = Data()
    if record.bom == true { bytes.append(contentsOf: [0xef, 0xbb, 0xbf]) }
    bytes.append(contentsOf: text.utf8)
    try atomicWrite(target, bytes, beforeCommit: verify)
    record.path = target.path
    record.name = target.lastPathComponent
    record.content = text
    record.savedContent = text
    record.diskHash = hashData(bytes)
    record.conflict = false
    records[id] = record
    return record
  }
  func check(_ id: String) throws -> [String: Any]? {
    let record = try require(id)
    guard let path = record.path else { return nil }
    do {
      let bytes = try Data(contentsOf: URL(fileURLWithPath: path))
      let digest = hashData(bytes)
      if digest == record.diskHash { return nil }
      let (text, bom) = try decode(bytes)
      return ["content": text, "diskHash": digest, "bom": bom]
    } catch {
      return ["missing": !FileManager.default.fileExists(atPath: path), "error": "磁盘文件暂时无法读取。"]
    }
  }
  func accept(_ id: String, content: String, digest: String) throws -> DocumentRecord {
    let record = try require(id)
    guard let path = record.path else { throw NativeFailure("草稿没有磁盘路径。") }
    let bytes = try Data(contentsOf: URL(fileURLWithPath: path))
    let (text, bom) = try decode(bytes)
    guard hashData(bytes) == digest, text == content else {
      throw NativeFailure("磁盘文件又发生了变化。", "EXTERNAL_CHANGE")
    }
    var updated = record
    updated.content = text
    updated.savedContent = text
    updated.bom = bom
    updated.diskHash = digest
    updated.lineEnding = text.contains("\r\n") ? "\r\n" : "\n"
    updated.conflict = false
    records[id] = updated
    return updated
  }
  func scan(_ directory: URL? = nil) throws -> [String: Any] {
    if let directory { folder = directory.resolvingSymlinksInPath() }
    guard let root = folder else { return ["folder": NSNull(), "files": [], "truncated": false] }
    tokens = [:]
    var files = [[String: String]]()
    var truncated = false
    func walk(_ parent: URL, _ depth: Int) throws {
      let children = try FileManager.default.contentsOfDirectory(
        at: parent, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
        options: [.skipsHiddenFiles]
      ).sorted {
        $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending
      }
      for file in children {
        let values = try file.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        if values.isSymbolicLink == true || file.lastPathComponent == "node_modules" { continue }
        if files.count >= 1000 {
          truncated = true
          return
        }
        if values.isDirectory == true {
          if depth < 8 { try walk(file, depth + 1) } else { truncated = true }
        } else if ["md", "markdown", "mdown"].contains(file.pathExtension.lowercased()) {
          let token = UUID().uuidString
          tokens[token] = file
          files.append([
            "token": token, "name": file.lastPathComponent,
            "relative": String(file.path.dropFirst(root.path.count + 1)), "path": file.path,
          ])
        }
      }
    }
    try walk(root, 0)
    return ["folder": root.path, "files": files, "truncated": truncated]
  }
  func persist(_ incoming: SessionRecord) throws {
    guard incoming.documents.count <= 100 else { throw NativeFailure("打开的文档超过 100 份。") }
    var documents = [DocumentRecord]()
    var bytes = 0
    for item in incoming.documents {
      var owned = try require(item.id)
      bytes += item.content.utf8.count
      guard item.content.utf8.count <= Self.maxBytes, bytes <= 100 * 1024 * 1024 else {
        throw NativeFailure("恢复数据过大。")
      }
      owned.content = item.content
      owned.conflict = item.conflict
      records[item.id] = owned
      documents.append(owned)
    }
    activeId = incoming.activeId
    let session = SessionRecord(
      documents: documents, activeId: incoming.activeId, folder: folder?.path)
    try atomicWrite(
      dataDirectory.appendingPathComponent("session.json"), JSONEncoder().encode(session))
    records = Dictionary(uniqueKeysWithValues: documents.map { ($0.id, $0) })
  }
  func restore() throws -> SessionRecord? {
    let file = dataDirectory.appendingPathComponent("session.json")
    guard FileManager.default.fileExists(atPath: file.path) else { return nil }
    let bytes = try Data(contentsOf: file)
    do {
      var session = try JSONDecoder().decode(SessionRecord.self, from: bytes)
      guard session.version == 1, session.documents.count <= 100 else {
        throw NativeFailure("恢复数据格式无效。")
      }
      var documents = [DocumentRecord]()
      for var record in session.documents {
        guard record.content.utf8.count <= Self.maxBytes else { throw NativeFailure("恢复文档过大。") }
        records[record.id] = record
        if record.path != nil, let changed = try check(record.id) {
          if record.content == record.savedContent, let text = changed["content"] as? String,
            let digest = changed["diskHash"] as? String
          {
            record = try accept(record.id, content: text, digest: digest)
          } else {
            record.conflict = true
          }
        }
        records[record.id] = record
        documents.append(record)
      }
      session.documents = documents
      activeId = session.activeId
      if let path = session.folder { _ = try? scan(URL(fileURLWithPath: path)) }
      session.folder = folder?.path
      return session
    } catch {
      try atomicWrite(
        dataDirectory.appendingPathComponent(
          "session-backup-\(Int(Date().timeIntervalSince1970 * 1000)).json"), bytes)
      return SessionRecord(documents: [], restoreError: "上次会话未能读取，原始恢复文件已另存为备份。")
    }
  }
  func asset(_ id: String, relative: String) throws -> URL {
    let record = try require(id)
    guard let path = record.path, !relative.hasPrefix("/"),
      ["png", "jpg", "jpeg", "gif", "webp", "avif"].contains(
        (relative as NSString).pathExtension.lowercased())
    else { throw NativeFailure("图片路径不可用。") }
    let base = URL(fileURLWithPath: path).deletingLastPathComponent().resolvingSymlinksInPath()
    let target = base.appendingPathComponent(relative).resolvingSymlinksInPath()
    guard contained(base, target),
      (try target.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Self.maxBytes + 1)
        <= Self.maxBytes
    else { throw NativeFailure("图片位于文档目录之外或超过 20 MB。") }
    return target
  }
  func importImage(_ id: String, bytes: Data, name: String) throws -> String {
    let record = try require(id)
    guard let path = record.path else { throw NativeFailure("请先保存文档，再添加本地图片。") }
    guard bytes.count >= 12, bytes.count <= Self.maxBytes else { throw NativeFailure("图片大小无效。") }
    let values = [UInt8](bytes.prefix(12))
    var ext: String?
    if bytes.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]) {
      ext = "png"
    } else if values[0] == 255 && values[1] == 216 {
      ext = "jpg"
    } else if String(data: bytes.prefix(3), encoding: .ascii) == "GIF" {
      ext = "gif"
    } else if String(data: bytes.prefix(4), encoding: .ascii) == "RIFF",
      String(data: bytes[8..<12], encoding: .ascii) == "WEBP"
    {
      ext = "webp"
    }
    guard let ext else { throw NativeFailure("支持 PNG、JPEG、GIF 和 WebP 图片。") }
    let parent = URL(fileURLWithPath: path).deletingLastPathComponent().resolvingSymlinksInPath()
    let assets = parent.appendingPathComponent(".assets")
    try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
    guard contained(parent, assets.resolvingSymlinksInPath()) else {
      throw NativeFailure("图片目录指向文档目录之外。")
    }
    let stem = (name as NSString).deletingPathExtension.unicodeScalars.map {
      CharacterSet.alphanumerics.contains($0) || $0 == "_" || $0 == "-" ? String($0) : "-"
    }.prefix(60).joined()
    let relative = ".assets/\(stem.isEmpty ? "image" : stem)-\(UUID().uuidString.prefix(8)).\(ext)"
    try atomicWrite(parent.appendingPathComponent(relative), bytes)
    return relative
  }
}
