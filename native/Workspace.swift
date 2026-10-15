import AppKit
import Foundation
import Darwin

struct RecentEntry: Codable {
  var path: String
  var name: String
  var folder: Bool
  var pinned: Bool
}
struct FileUndo {
  let from: URL
  let to: URL
}
final class Workspace {
  let directory: URL
  var undo: FileUndo?
  init(_ directory: URL) { self.directory = directory }
  var recentURL: URL { directory.appendingPathComponent("recent.json") }
  func recent() -> [RecentEntry] {
    (try? JSONDecoder().decode([RecentEntry].self, from: Data(contentsOf: recentURL))) ?? []
  }
  func remember(_ url: URL, folder: Bool) throws {
    let path = url.resolvingSymlinksInPath().standardizedFileURL.path
    var items = recent()
    let pinned = items.first { $0.path == path }?.pinned ?? false
    items.removeAll { $0.path == path }
    items.insert(RecentEntry(path: path, name: url.lastPathComponent, folder: folder, pinned: pinned), at: 0)
    try writeRecent(items)
  }
  func writeRecent(_ items: [RecentEntry]) throws {
    let retained = items.filter(\.pinned) + Array(items.filter { !$0.pinned }.prefix(50))
    try atomicWrite(recentURL, JSONEncoder().encode(retained))
  }
  func recentAction(_ action: String, path: String) throws -> [RecentEntry] {
    var items = recent()
    if action == "clear" { items.removeAll { !$0.pinned } }
    else if action == "remove" { items.removeAll { $0.path == path } }
    else if action == "pin" {
      guard let index = items.firstIndex(where: { $0.path == path && $0.folder }) else { throw NativeFailure("只能置顶最近打开的文件夹。") }
      items[index].pinned.toggle()
    } else { throw NativeFailure("最近项目操作无效。") }
    try writeRecent(items)
    return items
  }
  func authorize(_ path: String, store: DocumentStore, directory: Bool = false) throws -> URL {
    let target = URL(fileURLWithPath: path).standardizedFileURL
    let resolved = canonicalFileURL(target)
    let systemAlias = ["/var/", "/tmp/"].contains { target.path.hasPrefix($0) } && resolved.path == "/private" + target.path
    guard target.path == resolved.path || systemAlias else { throw NativeFailure("文件操作不支持符号链接。") }
    let inFolder = store.folder.map { $0.path == resolved.path || contained($0, resolved) } ?? false
    let opened = store.records.values.contains { $0.path == resolved.path }
    guard inFolder || (!directory && opened) else { throw NativeFailure("请先打开目标文件夹。") }
    return resolved
  }
  func child(_ parent: URL, name: String) throws -> URL {
    guard !name.isEmpty, name != ".", name != "..", !name.hasPrefix("."), name.utf8.count <= 240,
      !name.contains("/"), !name.contains(":"), !name.contains("\\"), !name.contains("\0") else { throw NativeFailure("名称无效，请使用普通文件名。") }
    return parent.appendingPathComponent(name)
  }
  func execute(_ operation: [String: String], store: DocumentStore) throws -> [String: String] {
    let fm = FileManager.default
    let action = operation["action"] ?? ""
    if action == "undo" {
      guard let item = undo else { throw NativeFailure("没有可撤销的文件操作。") }
      guard !fm.fileExists(atPath: item.to.path) else { throw NativeFailure("原位置已被占用，未覆盖任何文件。") }
      // Only restore the exact item retained by the last successful move or Trash operation.
      try fm.moveItem(at: item.from, to: item.to)
      undo = nil
      return ["fromPath": item.from.path, "toPath": item.to.path]
    }
    let source = try authorize(operation["path"] ?? store.folder?.path ?? "", store: store,
      directory: ["new-file", "new-folder"].contains(action))
    if source.path == store.folder?.path && ["rename", "move", "trash"].contains(action) { throw NativeFailure("不能在当前文件树中移动或删除根文件夹。") }
    if action == "trash" {
      var trashed: NSURL?
      try fm.trashItem(at: source, resultingItemURL: &trashed)
      if let trashed { undo = FileUndo(from: trashed as URL, to: source) }
      return ["removedPath": source.path]
    }
    let destination: URL
    if ["new-file", "new-folder"].contains(action) {
      guard (try source.resourceValues(forKeys: [.isDirectoryKey])).isDirectory == true else { throw NativeFailure("请选择文件夹。") }
      destination = try child(source, name: operation["name"] ?? "")
    } else if action == "move" {
      let parent = try authorize(operation["target"] ?? "", store: store, directory: true)
      guard (try parent.resourceValues(forKeys: [.isDirectoryKey])).isDirectory == true else { throw NativeFailure("移动目标不是文件夹。") }
      destination = parent.appendingPathComponent(source.lastPathComponent)
    } else if ["rename", "duplicate"].contains(action) {
      destination = try child(source.deletingLastPathComponent(), name: operation["name"] ?? "")
    } else { throw NativeFailure("文件操作无效。") }
    guard !fm.fileExists(atPath: destination.path), (["new-file", "new-folder"].contains(action) || !contained(source, destination)) else { throw NativeFailure("目标已存在，或目标位于自身内部。") }
    if action == "new-folder" { try fm.createDirectory(at: destination, withIntermediateDirectories: false) }
    else if action == "new-file" {
      guard ["md", "markdown", "mdown"].contains(destination.pathExtension.lowercased()) else { throw NativeFailure("新建文档需要 Markdown 扩展名。") }
      // O_EXCL prevents an external creator from being overwritten between validation and creation.
      let descriptor = Darwin.open(destination.path, O_CREAT | O_EXCL | O_WRONLY, 0o600)
      guard descriptor >= 0 else { throw NativeFailure("无法创建文档。") }; Darwin.close(descriptor)
    } else if action == "duplicate" {
      guard (try source.resourceValues(forKeys: [.isRegularFileKey])).isRegularFile == true else { throw NativeFailure("请选择 Markdown 文件。") }
      let owned = store.records.values.first(where: { $0.path == source.path })
      let encoded = try owned.map { try DocumentStore.encode($0.content, encoding: $0.encoding ?? "utf-8", bom: $0.bom ?? false) }
      try fm.copyItem(at: source, to: destination)
      // The latest in-memory draft is the duplicate's content, without saving over the original.
      if let encoded { try atomicWrite(destination, encoded) }
    } else {
      try fm.moveItem(at: source, to: destination)
      undo = FileUndo(from: destination, to: source)
      return ["fromPath": source.path, "toPath": destination.path]
    }
    return ["newPath": destination.path]
  }
  func updateRecent(_ change: [String: String]) throws {
    guard let from = change["fromPath"], let to = change["toPath"] else { return }
    let items = recent().map { item -> RecentEntry in
      var next = item
      if item.path == from || item.path.hasPrefix(from + "/") {
        next.path = to + item.path.dropFirst(from.count); next.name = URL(fileURLWithPath: next.path).lastPathComponent
      }
      return next
    }
    try writeRecent(items)
  }
  static func search(_ files: [[String: String]], query: String, regex: Bool, caseSensitive: Bool, encodings: [String: String] = [:]) throws -> [String: Any] {
    guard !query.isEmpty, query.utf8.count <= 1000 else { return ["matches": [], "truncated": false, "skipped": 0] }
    let expression = try NSRegularExpression(pattern: regex ? query : NSRegularExpression.escapedPattern(for: query), options: caseSensitive ? [] : [.caseInsensitive])
    var matches = [[String: Any]](), truncated = false, skipped = 0, totalBytes = 0
    for file in files where file["isDirectory"] != "true" {
      guard let path = file["path"], let size = try? URL(fileURLWithPath: path).resourceValues(forKeys: [.fileSizeKey]).fileSize,
        size <= 2 * 1024 * 1024, totalBytes + size <= 30 * 1024 * 1024,
        let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
        let decoded = try? DocumentStore(URL(fileURLWithPath: "/")).decode(data, encoding: data.starts(with: [0xef, 0xbb, 0xbf]) || data.starts(with: [0xff, 0xfe]) || data.starts(with: [0xfe, 0xff]) ? nil : encodings[path]) else { skipped += 1; continue }
      totalBytes += size
      for (index, line) in decoded.0.components(separatedBy: "\n").enumerated() {
        let value = line as NSString
        for match in expression.matches(in: line, range: NSRange(location: 0, length: value.length)) {
          if matches.count >= 500 { truncated = true; break }
          let start = max(0, match.range.location - 70), end = min(value.length, max(match.range.location + match.range.length, start + 180))
          matches.append(["token": file["token"] ?? "", "path": path, "name": file["relative"] ?? file["name"] ?? "", "line": index + 1, "column": match.range.location + 1, "length": match.range.length, "preview": value.substring(with: NSRange(location: start, length: end - start))])
        }
        if truncated { break }
      }
      if truncated { break }
    }
    return ["matches": matches, "truncated": truncated, "skipped": skipped]
  }
}
extension DocumentStore {
  func applyPathChange(_ change: [String: String]) {
    func updated(_ record: DocumentRecord) -> DocumentRecord? {
      var record = record
      guard let path = record.path else { return record }
      if let removed = change["removedPath"], path == removed || path.hasPrefix(removed + "/") { return nil }
      if let from = change["fromPath"], let to = change["toPath"], path == from || path.hasPrefix(from + "/") {
        record.path = to + path.dropFirst(from.count); record.name = URL(fileURLWithPath: record.path!).lastPathComponent
      }
      return record
    }
    records = records.compactMapValues(updated)
    closedRecords = closedRecords.compactMapValues(updated)
  }
}
