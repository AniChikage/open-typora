import AppKit
import Foundation
import UniformTypeIdentifiers

final class Interchange {
  static func run(_ executable: URL, arguments: [String], input: Data?, directory: URL) throws -> Data {
    let fm = FileManager.default, taskDirectory = directory.appendingPathComponent("conversion-" + UUID().uuidString)
    try fm.createDirectory(at: taskDirectory, withIntermediateDirectories: true)
    defer { try? fm.removeItem(at: taskDirectory) }
    let inputURL = taskDirectory.appendingPathComponent("input"), outputURL = taskDirectory.appendingPathComponent("output"), errorURL = taskDirectory.appendingPathComponent("error")
    try (input ?? Data()).write(to: inputURL); fm.createFile(atPath: outputURL.path, contents: nil); fm.createFile(atPath: errorURL.path, contents: nil)
    let stdin = try FileHandle(forReadingFrom: inputURL), stdout = try FileHandle(forWritingTo: outputURL), stderr = try FileHandle(forWritingTo: errorURL)
    defer { try? stdin.close(); try? stdout.close(); try? stderr.close() }
    let process = Process(); process.executableURL = executable; process.arguments = arguments; process.currentDirectoryURL = directory
    process.standardInput = stdin; process.standardOutput = stdout; process.standardError = stderr
    try process.run()
    let deadline = Date().addingTimeInterval(30)
    while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.03) }
    if process.isRunning { process.terminate(); throw NativeFailure("文档转换超时。") }
    process.waitUntilExit()
    guard process.terminationStatus == 0 else { let detail = (try? String(contentsOf: errorURL, encoding: .utf8)) ?? "文档格式不受支持。"; throw NativeFailure("转换失败：" + String(detail.prefix(2000))) }
    let data = try Data(contentsOf: outputURL)
    guard data.count <= 50 * 1024 * 1024 else { throw NativeFailure("转换结果超过 50 MB。") }
    return data
  }
  static func pandoc() -> URL? {
    let configured = UserDefaults.standard.string(forKey: "pandocPath")
    let candidates = [configured, Bundle.main.resourceURL?.appendingPathComponent("pandoc").path, "/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/usr/bin/pandoc"].compactMap { $0 }
    return candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }).map { URL(fileURLWithPath: $0) }
  }
  static func export(_ format: String, source: String, html: String, destination: URL, workingDirectory: URL, temporaryDirectory: URL) throws {
    let formats = ["docx", "rtf", "odt", "epub", "latex", "rst", "mediawiki", "textile", "opml", "revealjs"]
    guard formats.contains(format), source.utf8.count <= DocumentStore.maxBytes, html.utf8.count <= 50 * 1024 * 1024 else { throw NativeFailure("导出格式或内容无效。") }
    let data: Data
    if let converter = pandoc() {
      let temp = temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + (format == "revealjs" ? "html" : format))
      defer { try? FileManager.default.removeItem(at: temp) }
      _ = try run(converter, arguments: ["--from=markdown+tex_math_dollars+raw_html", "--to=" + format, "--standalone", "--resource-path=" + workingDirectory.path, "--output=" + temp.path], input: Data(source.utf8), directory: workingDirectory)
      data = try Data(contentsOf: temp)
    } else if ["docx", "rtf", "odt"].contains(format) {
      data = try run(URL(fileURLWithPath: "/usr/bin/textutil"), arguments: ["-convert", format, "-format", "html", "-stdin", "-stdout"], input: Data((html.contains("charset=") ? html : "<meta charset=\"utf-8\">" + html).utf8), directory: temporaryDirectory)
    } else { throw NativeFailure("此格式需要 Pandoc。请在导入导出设置中选择已安装的 Pandoc。") }
    guard !data.isEmpty, data.count <= 100 * 1024 * 1024 else { throw NativeFailure("转换器没有生成有效文件。") }
    try atomicWrite(destination, data)
  }
  static func importFile(_ file: URL, directory: URL) throws -> [String: String] {
    let fm = FileManager.default
    guard (try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? DocumentStore.maxBytes + 1) <= DocumentStore.maxBytes else { throw NativeFailure("导入文件超过 20 MB。") }
    if let converter = pandoc(), !["html", "htm", "txt"].contains(file.pathExtension.lowercased()) {
      // Imported media has an owned persistent location; no resource is written beside the original.
      let media = directory.appendingPathComponent("Imported/" + UUID().uuidString)
      try fm.createDirectory(at: media, withIntermediateDirectories: true)
      let output = try run(converter, arguments: [file.path, "--to=gfm+tex_math_dollars", "--wrap=none", "--extract-media=" + media.path], input: nil, directory: directory)
      guard let text = String(data: output, encoding: .utf8) else { throw NativeFailure("导入结果不是 UTF-8。") }
      return ["markdown": text, "name": file.deletingPathExtension().lastPathComponent + ".md"]
    }
    let data = try run(URL(fileURLWithPath: "/usr/bin/textutil"), arguments: ["-convert", "html", "-stdout", file.path], input: nil, directory: directory)
    guard let html = String(data: data, encoding: .utf8) else { throw NativeFailure("导入结果不是 UTF-8。") }
    return ["html": html, "name": file.deletingPathExtension().lastPathComponent + ".md"]
  }
  static func themes(_ directory: URL) throws -> [[String: String]] {
    let root = directory.appendingPathComponent("themes")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.pathExtension == "css" }.sorted { $0.lastPathComponent < $1.lastPathComponent }.map { ["id": $0.lastPathComponent, "name": $0.deletingPathExtension().lastPathComponent, "css": try String(contentsOf: $0, encoding: .utf8)] }
  }
  static func installTheme(_ file: URL, directory: URL) throws -> String {
    guard file.pathExtension.lowercased() == "css", (try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 1_000_001) <= 1_000_000 else { throw NativeFailure("请选择小于 1 MB 的 CSS 主题。") }
    var seen = Set<String>(), total = 0
    func embed(_ url: URL, depth: Int = 0) throws -> String {
      guard depth <= 4, !seen.contains(url.path), contained(canonicalFileURL(file.deletingLastPathComponent()), canonicalFileURL(url)) else { throw NativeFailure("主题资源包含循环引用或位于主题目录之外。") }
      seen.insert(url.path)
      var css = try String(contentsOf: url, encoding: .utf8)
      let imports = try NSRegularExpression(pattern: "@import\\s+(?:url\\()?['\"]([^'\"]+)['\"]\\)?\\s*;")
      for match in imports.matches(in: css, range: NSRange(css.startIndex..., in: css)).reversed() {
        let reference = (css as NSString).substring(with: match.range(at: 1))
        guard !reference.contains(":") else { throw NativeFailure("请下载主题资源到本地后安装。") }
        let nested = try embed(url.deletingLastPathComponent().appendingPathComponent(reference), depth: depth + 1)
        css = (css as NSString).replacingCharacters(in: match.range, with: nested)
      }
      let urls = try NSRegularExpression(pattern: "url\\(\\s*['\"]?([^)'\"]+)['\"]?\\s*\\)")
      for match in urls.matches(in: css, range: NSRange(css.startIndex..., in: css)).reversed() {
        let reference = (css as NSString).substring(with: match.range(at: 1)).trimmingCharacters(in: .whitespaces)
        if reference.hasPrefix("data:") || reference.hasPrefix("#") { continue }
        guard !reference.contains(":") else { throw NativeFailure("主题需要本地字体和图片。") }
        let asset = canonicalFileURL(url.deletingLastPathComponent().appendingPathComponent(reference.removingPercentEncoding ?? reference))
        guard contained(canonicalFileURL(file.deletingLastPathComponent()), asset) else { throw NativeFailure("主题资源位于主题目录之外。") }
        let bytes = try Data(contentsOf: asset); total += bytes.count
        guard total <= 20 * 1024 * 1024 else { throw NativeFailure("主题资源超过 20 MB。") }
        let mime = ["woff2":"font/woff2", "woff":"font/woff", "ttf":"font/ttf", "png":"image/png", "svg":"image/svg+xml", "jpg":"image/jpeg"][asset.pathExtension] ?? "application/octet-stream"
        css = (css as NSString).replacingCharacters(in: match.range, with: "url(data:\(mime);base64,\(bytes.base64EncodedString()))")
      }
      return css
    }
    let css = try embed(canonicalFileURL(file))
    let name = file.deletingPathExtension().lastPathComponent.replacingOccurrences(of: "/", with: "-") + ".css"
    try atomicWrite(directory.appendingPathComponent("themes/" + name), Data(css.utf8))
    return name
  }
}
