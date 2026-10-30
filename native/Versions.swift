import Foundation

struct DocumentVersion: Codable {
  var id: String, createdAt: Double, name: String, reason: String, hash: String
  var bytes: Int
  var json: [String: Any] { ["id": id, "createdAt": createdAt, "name": name, "reason": reason, "hash": hash, "bytes": bytes] }
}
private struct VersionIndex: Codable { var version = 1; var entries = [DocumentVersion](); var file: String? }
final class VersionStore {
  private static let lock = NSLock()
  let root: URL
  let countLimit = 50, documentBudget = 128 * 1024 * 1024, totalBudget = 512 * 1024 * 1024
  init(_ directory: URL) { root = directory.appendingPathComponent("versions-v1") }
  private func locked<T>(_ body: () throws -> T) rethrows -> T { Self.lock.lock(); defer { Self.lock.unlock() }; return try body() }
  private func key(_ record: DocumentRecord) -> String { hashData(Data((record.path.map { "file:" + $0 } ?? "draft:" + record.id).utf8)) }
  private func validHash(_ value: String) -> Bool { value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil }
  private func index(_ key: String) throws -> VersionIndex {
    let file = root.appendingPathComponent(key).appendingPathComponent("index.json")
    if !FileManager.default.fileExists(atPath: file.path) { return VersionIndex() }
    do {
      let data = try Data(contentsOf: file)
      guard data.count <= 1024 * 1024 else { throw NativeFailure("history size") }
      let index = try JSONDecoder().decode(VersionIndex.self, from: data)
      guard index.version == 1, index.entries.count <= 1000,
        index.entries.allSatisfy({ $0.id.range(of: "^[a-zA-Z0-9-]{1,100}$", options: .regularExpression) != nil && validHash($0.hash) && $0.createdAt.isFinite && $0.bytes >= 0 }) else { throw NativeFailure("history format") }
      return index
    } catch { throw NativeFailure("版本索引无法读取，原始历史记录已保留。") }
  }
  private func size(_ entries: [DocumentVersion]) -> Int { Dictionary(entries.map { ($0.hash, $0.bytes) }, uniquingKeysWith: { first, _ in first }).values.reduce(0, +) }
  private func commit(_ key: String, _ entries: [DocumentVersion], file: String? = nil) throws {
    let directory = root.appendingPathComponent(key)
    try atomicWrite(directory.appendingPathComponent("index.json"), JSONEncoder().encode(VersionIndex(entries: entries, file: file ?? (try index(key)).file)), permissions: 0o600)
    let retained = Set(entries.map { $0.hash + ".txt" })
    for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) where file.pathExtension == "txt" && validHash(file.deletingPathExtension().lastPathComponent) && !retained.contains(file.lastPathComponent) { try FileManager.default.removeItem(at: file) }
  }
  private func trimGlobal() throws {
    let fm = FileManager.default
    var collections = [String: [DocumentVersion]](), changed = Set<String>()
    for file in try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey]) where validHash(file.lastPathComponent) && (try? file.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true { if let stored = try? index(file.lastPathComponent) { collections[file.lastPathComponent] = stored.entries } }
    var total = collections.values.reduce(0) { $0 + size($1) }
    let candidates = collections.flatMap { key, entries in entries.map { (key, $0) } }.sorted { $0.1.createdAt < $1.1.createdAt }
    for (key, item) in candidates {
      if total <= totalBudget { break }
      let before = size(collections[key]!)
      collections[key]!.removeAll { $0.id == item.id }; changed.insert(key)
      total -= before - size(collections[key]!)
    }
    for key in changed { try commit(key, collections[key]!) }
  }
  func list(_ record: DocumentRecord) throws -> [String: Any] { try locked { ["versions": try index(key(record)).entries.map(\.json)] } }
  func capture(_ record: DocumentRecord, content: String, reason: String) throws -> [String: Any] {
    guard ["opened", "saved", "automatic", "manual", "before-ai", "ai", "before-restore", "restore"].contains(reason) else { throw NativeFailure("版本请求无效。") }
    return try locked {
      let key = key(record), previous = try index(key), data = Data(content.utf8), hash = hashData(data)
      if data.count > documentBudget { return ["versions": previous.entries.map(\.json), "warning": "文档超过单份版本历史的 128 MiB 预算，编辑和保存不受影响。"] }
      if previous.entries.first?.hash == hash { return ["versions": previous.entries.map(\.json)] }
      let now = Date().timeIntervalSince1970 * 1000
      let item = DocumentVersion(id: UUID().uuidString, createdAt: now, name: record.name, reason: reason, hash: hash, bytes: data.count)
      var entries = previous.entries
      if ["saved", "automatic"].contains(reason), entries.count > 1, ["saved", "automatic"].contains(entries[0].reason), now - entries[0].createdAt < 30000 { entries.removeFirst() }
      entries.insert(item, at: 0); entries = Array(entries.prefix(countLimit))
      while entries.count > 1 && size(entries) > documentBudget { entries.removeLast() }
      try atomicWrite(root.appendingPathComponent(key).appendingPathComponent(hash + ".txt"), data, permissions: 0o600)
      try commit(key, entries, file: record.path); try trimGlobal()
      return ["versions": entries.map(\.json)]
    }
  }
  func read(_ record: DocumentRecord, id: String) throws -> [String: Any] {
    try locked {
      let key = key(record)
      guard let entry = try index(key).entries.first(where: { $0.id == id }) else { throw NativeFailure("此版本已过期或不可用，请刷新版本列表。") }
      let data = try Data(contentsOf: root.appendingPathComponent(key).appendingPathComponent(entry.hash + ".txt"))
      guard data.count == entry.bytes, hashData(data) == entry.hash, let text = String(data: data, encoding: .utf8) else { throw NativeFailure("版本内容校验失败，当前文档未修改。") }
      return ["version": entry.json, "content": text]
    }
  }
  private func transfer(_ oldKey: String, _ newKey: String, file: String?, remove: Bool) throws {
    guard oldKey != newKey else { return }
    let previous = try index(oldKey), next = try index(newKey)
    guard !previous.entries.isEmpty else { return }
    let old = root.appendingPathComponent(oldKey), new = root.appendingPathComponent(newKey), fm = FileManager.default
    for entry in previous.entries {
      let bytes = try Data(contentsOf: old.appendingPathComponent(entry.hash + ".txt"))
      guard bytes.count == entry.bytes, hashData(bytes) == entry.hash else { throw NativeFailure("旧版本内容校验失败。") }
      try atomicWrite(new.appendingPathComponent(entry.hash + ".txt"), bytes, permissions: 0o600)
    }
    var entries = Array(Dictionary((next.entries + previous.entries).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }).values.sorted { $0.createdAt > $1.createdAt }.prefix(countLimit))
    while entries.count > 1 && size(entries) > documentBudget { entries.removeLast() }
    try commit(newKey, entries, file: file)
    if remove { try fm.removeItem(at: old) }
  }
  func adopt(_ previous: DocumentRecord, _ next: DocumentRecord) throws {
    try locked { try transfer(key(previous), key(next), file: next.path, remove: previous.path == nil) }
  }
  func remap(_ fromPath: String, _ toPath: String) throws {
    try locked {
      let fm = FileManager.default
      guard fm.fileExists(atPath: root.path) else { return }
      for folder in try fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey]) where validHash(folder.lastPathComponent) {
        guard let file = try index(folder.lastPathComponent).file, file == fromPath || file.hasPrefix(fromPath + "/") else { continue }
        let target = toPath + file.dropFirst(fromPath.count)
        try transfer(folder.lastPathComponent, hashData(Data(("file:" + target).utf8)), file: target, remove: true)
      }
    }
  }
}
