import CryptoKit
import Darwin
import Foundation
import CoreFoundation

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
  var encoding: String?
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
func canonicalFileURL(_ url: URL) -> URL {
  if let path = Darwin.realpath(url.path, nil) { defer { free(path) }; return URL(fileURLWithPath: String(cString: path)) }
  return url.standardizedFileURL.resolvingSymlinksInPath()
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
  var closedRecords = [String: DocumentRecord]()
  private var closedOrder = [String]()
  static let maxBytes = 20 * 1024 * 1024
  init(_ directory: URL) { dataDirectory = directory }
  func require(_ id: String) throws -> DocumentRecord {
    guard let record = records[id] else { throw NativeFailure("文件已关闭，请重新打开。") }
    return record
  }
  static let encodings = ["utf-8", "utf-16le", "utf-16be", "gb18030", "gbk", "big5", "shift_jis", "windows-1252"]
  static func stringEncoding(_ name: String) throws -> String.Encoding {
    switch name {
    case "utf-8": return .utf8
    case "utf-16le": return .utf16LittleEndian
    case "utf-16be": return .utf16BigEndian
    case "gb18030": return String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(0x0632))
    case "gbk": return String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(0x0631))
    case "big5": return String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(0x0a03))
    case "shift_jis": return String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(0x0a01))
    case "windows-1252": return .windowsCP1252
    default: throw NativeFailure("不支持的文本编码。")
    }
  }
  static func encode(_ text: String, encoding: String, bom: Bool) throws -> Data {
    guard let bytes = text.data(using: try stringEncoding(encoding), allowLossyConversion: false),
      let decoded = String(data: bytes, encoding: try stringEncoding(encoding)), decoded.utf8.elementsEqual(text.utf8) else {
      throw NativeFailure("此编码无法无损保存部分字符，请改用 UTF-8。原文件未修改。", "ENCODING_LOSS")
    }
    let prefix: [UInt8] = bom ? ["utf-8": [0xef, 0xbb, 0xbf], "utf-16le": [0xff, 0xfe], "utf-16be": [0xfe, 0xff]][encoding] ?? [] : []
    guard bytes.count + prefix.count <= maxBytes else { throw NativeFailure("编码后的文件超过 20 MB。") }
    return Data(prefix) + bytes
  }
  func decode(_ data: Data, encoding requested: String? = nil) throws -> (String, Bool, String) {
    guard data.count <= Self.maxBytes else { throw NativeFailure("文件超过支持的 20 MB。") }
    let marker: (String, Int)? = data.starts(with: [0xef, 0xbb, 0xbf]) ? ("utf-8", 3) : data.starts(with: [0xff, 0xfe]) ? ("utf-16le", 2) : data.starts(with: [0xfe, 0xff]) ? ("utf-16be", 2) : nil
    let encoding = requested ?? marker?.0 ?? "utf-8"
    let bom = marker?.0 == encoding
    let bytes = bom ? Data(data.dropFirst(marker!.1)) : data
    guard let text = String(data: bytes, encoding: try Self.stringEncoding(encoding)),
      !text.unicodeScalars.contains(where: { $0.value == 0 || ($0.value < 32 && ![9, 10, 12, 13].contains($0.value)) }) else {
      throw NativeFailure("无法按 \(encoding.uppercased()) 读取文本，请选择文件的实际编码。", "INVALID_ENCODING")
    }
    return (text, bom, encoding)
  }
  func open(_ file: URL, id: String? = nil, encoding: String? = nil) throws -> DocumentRecord {
    let resolved = canonicalFileURL(file)
    if id == nil, let existing = records.values.first(where: { $0.path == resolved.path }) { return existing }
    guard ["md", "markdown", "mdown"].contains(resolved.pathExtension.lowercased()) else {
      throw NativeFailure("请选择 Markdown 文件。")
    }
    let values = try resolved.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, (values.fileSize ?? Self.maxBytes + 1) <= Self.maxBytes
    else { throw NativeFailure("文件内容无效或超过 20 MB。") }
    let bytes = try Data(contentsOf: resolved)
    let (text, bom, detected) = try decode(bytes, encoding: encoding)
    let record = DocumentRecord(
      id: id ?? records.values.first(where: { $0.path == resolved.path })?.id ?? UUID().uuidString,
      path: resolved.path, name: resolved.lastPathComponent, content: text, savedContent: text,
      diskHash: hashData(bytes), lineEnding: text.contains("\r\n") ? "\r\n" : "\n", conflict: false,
      bom: bom, encoding: detected)
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
  func reopen(_ id: String) throws -> DocumentRecord {
    guard let record = closedRecords[id] else { throw NativeFailure("最近关闭的文档已不可用。") }
    let reopened = try record.path.map { try open(URL(fileURLWithPath: $0), id: id, encoding: record.encoding) } ?? draft(record)
    closedRecords.removeValue(forKey: id); closedOrder.removeAll { $0 == id }
    return reopened
  }
  func save(_ id: String, text: String, destination: URL? = nil, force: Bool = false, encoding: String? = nil, bom: Bool? = nil) throws
    -> DocumentRecord
  {
    var record = try require(id)
    guard text.utf8.count <= Self.maxBytes else { throw NativeFailure("内容超过支持的 20 MB。") }
    guard let target = destination ?? record.path.map({ URL(fileURLWithPath: $0) }) else {
      throw NativeFailure("请先为草稿选择保存位置。")
    }
    let same = record.path == target.path
    if same && record.conflict == true && !force { throw NativeFailure("磁盘冲突尚未解决，请另存副本或确认覆盖。", "EXTERNAL_CHANGE") }
    let verify = {
      if same && !force {
        guard let bytes = try? Data(contentsOf: target), hashData(bytes) == record.diskHash else {
          throw NativeFailure("磁盘文件已被其他程序修改，草稿已保留。", "EXTERNAL_CHANGE")
        }
      }
    }
    try verify()
    let selectedEncoding = encoding ?? record.encoding ?? "utf-8"
    let selectedBOM = bom ?? record.bom ?? false
    let bytes = try Self.encode(text, encoding: selectedEncoding, bom: selectedBOM)
    try atomicWrite(target, bytes, beforeCommit: verify)
    record.encoding = selectedEncoding
    record.bom = selectedBOM && selectedEncoding.hasPrefix("utf-")
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
      let (text, bom, detected) = try decode(bytes, encoding: bytes.starts(with: [0xef, 0xbb, 0xbf]) || bytes.starts(with: [0xff, 0xfe]) || bytes.starts(with: [0xfe, 0xff]) ? nil : record.encoding)
      return ["content": text, "diskHash": digest, "bom": bom, "encoding": detected]
    } catch {
      return ["missing": !FileManager.default.fileExists(atPath: path), "error": "磁盘文件暂时无法读取。"]
    }
  }
  func accept(_ id: String, content: String, digest: String) throws -> DocumentRecord {
    let record = try require(id)
    guard let path = record.path else { throw NativeFailure("草稿没有磁盘路径。") }
    let bytes = try Data(contentsOf: URL(fileURLWithPath: path))
    let (text, bom, detected) = try decode(bytes, encoding: bytes.starts(with: [0xef, 0xbb, 0xbf]) || bytes.starts(with: [0xff, 0xfe]) || bytes.starts(with: [0xfe, 0xff]) ? nil : record.encoding)
    guard hashData(bytes) == digest, text == content else {
      throw NativeFailure("磁盘文件又发生了变化。", "EXTERNAL_CHANGE")
    }
    var updated = record
    updated.content = text
    updated.savedContent = text
    updated.bom = bom
    updated.encoding = detected
    updated.diskHash = digest
    updated.lineEnding = text.contains("\r\n") ? "\r\n" : "\n"
    updated.conflict = false
    records[id] = updated
    return updated
  }
  func scan(_ directory: URL? = nil) throws -> [String: Any] {
    if let directory { folder = canonicalFileURL(directory) }
    guard let root = folder else { return ["folder": NSNull(), "files": [], "truncated": false] }
    tokens = [:]
    var files = [[String: String]]()
    var truncated = false
    func walk(_ parent: URL, _ depth: Int) throws {
      let children = try FileManager.default.contentsOfDirectory(
        at: parent, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey, .contentModificationDateKey, .creationDateKey],
        options: [.skipsHiddenFiles]
      ).sorted {
        $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending
      }
      for file in children {
        let values = try file.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .contentModificationDateKey, .creationDateKey])
        if values.isSymbolicLink == true || file.lastPathComponent == "node_modules" { continue }
        if files.count >= 1000 {
          truncated = true
          return
        }
        if values.isDirectory == true || ["md", "markdown", "mdown"].contains(file.pathExtension.lowercased()) {
          let token = hashData(Data(file.path.utf8))
          tokens[token] = file
          files.append([
            "token": token, "name": file.lastPathComponent,
            "relative": String(file.path.dropFirst(root.path.count + 1)), "path": file.path,
            "isDirectory": values.isDirectory == true ? "true" : "false",
            "modified": String(values.contentModificationDate?.timeIntervalSince1970 ?? 0),
            "created": String(values.creationDate?.timeIntervalSince1970 ?? 0),
          ])
          if values.isDirectory == true {
            if depth < 8 { try walk(file, depth + 1) } else { truncated = true }
          }
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
    let openIDs = Set(documents.map { $0.id })
    for (id, record) in records where !openIDs.contains(id) {
      var clean = record
      clean.content = record.savedContent
      if clean.path != nil { clean.content = ""; clean.savedContent = "" }
      closedRecords[id] = clean; closedOrder.removeAll { $0 == id }; closedOrder.append(id)
    }
    while closedOrder.count > 20 { closedRecords.removeValue(forKey: closedOrder.removeFirst()) }
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
  func yamlValue(_ key: String, source: String) -> String? {
    let normalized = source.replacingOccurrences(of: "\r\n", with: "\n")
    guard normalized.hasPrefix("---\n"), let end = normalized.dropFirst(4).range(of: "\n---") else { return nil }
    let metadata = String(normalized[normalized.index(normalized.startIndex, offsetBy: 4)..<end.lowerBound])
    for line in metadata.components(separatedBy: "\n") where line.hasPrefix(key + ":") {
      let value = line.dropFirst(key.count + 1).trimmingCharacters(in: .whitespaces)
      return value.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
    }
    return nil
  }
  func asset(_ id: String, relative: String) throws -> URL {
    let record = try require(id)
    let reference = URL(string: relative).flatMap { $0.isFileURL ? $0.path : nil } ?? relative.removingPercentEncoding ?? relative
    guard ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "mp4", "webm", "ogg", "mp3", "wav", "m4a"].contains((reference as NSString).pathExtension.lowercased()), !reference.contains("\0") else { throw NativeFailure("图片路径不可用。") }
    let parent = record.path.map { URL(fileURLWithPath: $0).deletingLastPathComponent() } ?? dataDirectory
    let target: URL
    if let root = yamlValue("typora-root-url", source: record.content), !root.contains("://") {
      let base = root.hasPrefix("/") ? URL(fileURLWithPath: root) : parent.appendingPathComponent(root)
      target = base.appendingPathComponent(reference.trimmingCharacters(in: CharacterSet(charactersIn: "/"))).standardizedFileURL
    } else { target = (reference.hasPrefix("/") ? URL(fileURLWithPath: reference) : parent.appendingPathComponent(reference)).standardizedFileURL }
    guard target.path == target.resolvingSymlinksInPath().path,
      (try target.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])).isRegularFile == true,
      (try target.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Self.maxBytes + 1) <= Self.maxBytes else { throw NativeFailure("图片路径指向目录之外的符号链接，或超过 20 MB。") }
    return target
  }
  func importImage(_ id: String, bytes: Data, name: String, options: [String: Any] = [:]) throws -> String {
    let record = try require(id)
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
    if ext == nil, let text = String(data: bytes.prefix(1024), encoding: .utf8), text.contains("<svg") { ext = "svg" }
    guard let ext else { throw NativeFailure("支持 PNG、JPEG、GIF、WebP 和 SVG 图片。") }
    let parent = record.path.map { URL(fileURLWithPath: $0).deletingLastPathComponent().resolvingSymlinksInPath() } ?? canonicalFileURL(dataDirectory.appendingPathComponent("DraftAssets/" + hashData(Data(record.id.utf8))))
    let source = options["source"] as? String ?? record.content
    let configured = yamlValue("typora-copy-images-to", source: source) ?? options["imageFolder"] as? String ?? ".assets"
    let folderName = configured.replacingOccurrences(of: "${filename}", with: (record.name as NSString).deletingPathExtension)
    guard !folderName.contains("://"), !folderName.contains("\0") else { throw NativeFailure("图片复制目录无效。") }
    let assets = (folderName.hasPrefix("/") ? URL(fileURLWithPath: folderName) : parent.appendingPathComponent(folderName.isEmpty ? ".assets" : folderName)).standardizedFileURL
    guard assets.path == assets.resolvingSymlinksInPath().path else { throw NativeFailure("图片目录指向文档目录之外的符号链接。") }
    try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
    let stem = (name as NSString).deletingPathExtension.unicodeScalars.map {
      CharacterSet.alphanumerics.contains($0) || $0 == "_" || $0 == "-" ? String($0) : "-"
    }.prefix(60).joined()
    let destination = assets.appendingPathComponent("\(stem.isEmpty ? "image" : stem)-\(UUID().uuidString.prefix(8)).\(ext)")
    try atomicWrite(destination, bytes)
    let parentParts = parent.pathComponents, targetParts = destination.pathComponents
    var common = 0; while common < min(parentParts.count, targetParts.count) && parentParts[common] == targetParts[common] { common += 1 }
    var relative = (Array(repeating: "..", count: parentParts.count - common) + targetParts.dropFirst(common)).joined(separator: "/")
    if options["imagePrefix"] as? Bool == true, !relative.hasPrefix(".") { relative = "./" + relative }
    if options["imageEscape"] as? Bool != false { relative = relative.addingPercentEncoding(withAllowedCharacters: CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: " ()#?"))) ?? relative }
    return record.path == nil ? destination.path.addingPercentEncoding(withAllowedCharacters: CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: " ()#?"))) ?? destination.path : relative
  }
}
