import AppKit
import Foundation

func imageRelativePath(_ destination: URL, record: DocumentRecord, options: [String: Any]) -> String {
  guard let path = record.path else { return destination.path }
  let parent = URL(fileURLWithPath: path).deletingLastPathComponent().pathComponents, target = destination.pathComponents
  var common = 0; while common < min(parent.count, target.count) && parent[common] == target[common] { common += 1 }
  var relative = (Array(repeating: "..", count: parent.count - common) + target.dropFirst(common)).joined(separator: "/")
  if options["imagePrefix"] as? Bool == true, !relative.hasPrefix(".") { relative = "./" + relative }
  return options["imageEscape"] as? Bool == false ? relative : relative.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: " ()#?"))) ?? relative
}
extension NativeWindowHost {
  func imageAction(_ args: [Any]) async throws -> [String: String]? {
    let record = try store.require(arg(args, 0, String.self)), sources = try arg(args, 1, [String].self), action = try arg(args, 2, String.self), options = args.count > 3 ? args[3] as? [String: Any] ?? [:] : [:]
    guard sources.count <= 200, ["copy", "move", "delete", "upload"].contains(action) else { throw NativeFailure("图片操作无效。") }
    var directory: URL?, destination: URL?
    if ["copy", "move"].contains(action) {
      if sources.count > 1 { let panel = NSOpenPanel(); panel.title = "选择图片目标文件夹"; panel.canChooseDirectories = true; panel.canChooseFiles = false; guard panel.runModal() == .OK else { return nil }; directory = panel.url }
      else { let panel = NSSavePanel(); panel.title = action == "move" ? "移动或重命名图片" : "复制图片"; panel.nameFieldStringValue = URL(string: sources.first ?? "")?.lastPathComponent ?? "image.png"; guard panel.runModal() == .OK else { return nil }; destination = panel.url }
    }
    if action == "delete", !confirm("删除图片文件？", detail: "图片文件会移到废纸篓，文档中的引用也会移除。", yes: "移到废纸篓") { return nil }
    let fm = FileManager.default
    var mapping = [String: String](), pendingMoves = [URL]()
    for source in sources {
      let remote = URL(string: source).flatMap { ["http", "https"].contains($0.scheme ?? "") ? $0 : nil }
      let local = remote == nil ? try store.asset(record.id, relative: source) : nil
      if action == "delete" { guard let local else { throw NativeFailure("远程图片只能移除文档引用，不能删除服务器文件。") }; try fm.trashItem(at: local, resultingItemURL: nil); mapping[source] = ""; continue }
      var bytes: Data?
      if let remote {
        var request = URLRequest(url: remote); request.timeoutInterval = 20
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode), response.mimeType?.hasPrefix("image/") == true, data.count <= DocumentStore.maxBytes else { throw NativeFailure("远程图片读取失败或超过 20 MB。") }; bytes = data
      }
      if action == "upload" {
        let endpoint = options["imageUploader"] as? String ?? "http://127.0.0.1:36677/upload"
        guard let url = URL(string: endpoint), ["http", "https"].contains(url.scheme ?? "") else { throw NativeFailure("PicGo Server 地址无效。") }
        let uploadFile: URL
        if let local { uploadFile = local }
        else { uploadFile = store.dataDirectory.appendingPathComponent("Uploads/" + UUID().uuidString + ".png"); try atomicWrite(uploadFile, bytes!) }
        defer { if local == nil { try? fm.removeItem(at: uploadFile) } }
        var request = URLRequest(url: url); request.httpMethod = "POST"; request.timeoutInterval = 30; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONSerialization.data(withJSONObject: ["list": [uploadFile.path]])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode), let json = try JSONSerialization.jsonObject(with: data) as? [String: Any], json["success"] as? Bool == true, let uploaded = (json["result"] as? [String])?.first, let parsed = URL(string: uploaded), ["http", "https"].contains(parsed.scheme ?? "") else { throw NativeFailure("PicGo 未返回有效图片地址。请确认图床已配置。") }
        mapping[source] = uploaded; continue
      }
      guard let target = destination ?? directory?.appendingPathComponent(local?.lastPathComponent ?? remote?.lastPathComponent ?? "image.png") else { throw NativeFailure("目标位置无效。") }
      if target.path == local?.path { mapping[source] = source; continue }
      guard !fm.fileExists(atPath: target.path) else { throw NativeFailure("目标图片已存在，未覆盖。") }
      if let local { try fm.copyItem(at: local, to: target) } else { try atomicWrite(target, bytes!) }
      if action == "move", let local { pendingMoves.append(local) }
      mapping[source] = imageRelativePath(target, record: record, options: options)
    }
    var retained = 0
    for original in pendingMoves { do { try fm.trashItem(at: original, resultingItemURL: nil) } catch { retained += 1 } }
    if retained > 0 { deliver(["action": "notice", "message": "图片已复制到目标位置，但部分原图片未能移到废纸篓。"] ) }
    return mapping
  }
}
