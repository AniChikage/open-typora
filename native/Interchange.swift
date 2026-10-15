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
      let conversion = temporaryDirectory.appendingPathComponent("export-" + UUID().uuidString)
      try FileManager.default.createDirectory(at: conversion, withIntermediateDirectories: true)
      defer { try? FileManager.default.removeItem(at: conversion) }
      let temp = conversion.appendingPathComponent("result." + (format == "revealjs" ? "html" : format))
      let filter = conversion.appendingPathComponent("html.lua")
      let lua = """
      function RawBlock(el)
        if el.format == 'html' then return pandoc.read(el.text, 'html').blocks end
      end
      function RawInline(el)
        if el.format == 'html' and el.text:match('^<img') then
          local blocks = pandoc.read(el.text, 'html').blocks
          if #blocks > 0 then return blocks[1].content end
        end
      end
      """
      try Data(lua.utf8).write(to: filter)
      var prepared = source
      // Text formats refer to a sibling asset folder so exported documents survive moving together.
      if ["latex", "rst", "mediawiki", "textile"].contains(format) {
        let expression = try NSRegularExpression(pattern: "data:image/(png|jpeg|gif|webp|svg\\+xml);base64,([A-Za-z0-9+/=]+)")
        let matches = expression.matches(in: source, range: NSRange(source.startIndex..., in: source))
        if !matches.isEmpty {
          let assets = canonicalFileURL(destination.deletingLastPathComponent()).appendingPathComponent(destination.deletingPathExtension().lastPathComponent + ".assets")
          try FileManager.default.createDirectory(at: assets, withIntermediateDirectories: true)
          guard try assets.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw NativeFailure("导出资源目录不能是符号链接。") }
          for match in matches.reversed() {
            let mime = (source as NSString).substring(with: match.range(at: 1)), encoded = (source as NSString).substring(with: match.range(at: 2))
            guard let bytes = Data(base64Encoded: encoded), bytes.count <= DocumentStore.maxBytes else { throw NativeFailure("导出图片数据无效。") }
            let image = assets.appendingPathComponent(String(hashData(bytes).prefix(20)) + "." + (mime == "svg+xml" ? "svg" : mime))
            try atomicWrite(image, bytes)
            let relative = assets.lastPathComponent + "/" + image.lastPathComponent
            prepared = (prepared as NSString).replacingCharacters(in: match.range, with: relative.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? relative)
          }
        }
      }
      _ = try run(converter, arguments: ["--from=markdown+tex_math_dollars+raw_html+mark", "--to=" + format, "--standalone", "--lua-filter=" + filter.path, "--resource-path=" + destination.deletingLastPathComponent().path + ":" + workingDirectory.path, "--output=" + temp.path], input: Data(prepared.utf8), directory: workingDirectory)
      data = try Data(contentsOf: temp)
    } else if ["docx", "rtf", "odt"].contains(format) {
      data = try run(URL(fileURLWithPath: "/usr/bin/textutil"), arguments: ["-convert", format, "-format", "html", "-stdin", "-stdout"], input: Data((html.contains("charset=") ? html : "<meta charset=\"utf-8\">" + html).utf8), directory: temporaryDirectory)
    } else { throw NativeFailure("此格式需要 Pandoc。请在导入导出设置中选择已安装的 Pandoc。") }
    guard !data.isEmpty, data.count <= 100 * 1024 * 1024 else { throw NativeFailure("转换器没有生成有效文件。") }
    try atomicWrite(destination, data)
  }
  // Cocoa reads RTF tables that Pandoc's RTF reader currently omits. Preserve
  // pictures, notes, outline paragraphs and code before passing the body through Cocoa.
  static func importRTF(_ file: URL, directory: URL, converter: URL) throws -> [String: String] {
    let data = try Data(contentsOf: file), bytes = [UInt8](data), fm = FileManager.default
    let media = directory.appendingPathComponent("Imported/" + UUID().uuidString)
    try fm.createDirectory(at: media, withIntermediateDirectories: true)
    var complete = false
    defer { if !complete { try? fm.removeItem(at: media) } }
    var stack = [Int](), groups = [Range<Int>](), index = 0
    while index < bytes.count {
      if bytes[index] == 92 {
        if index + 1 < bytes.count && [92, 123, 125].contains(bytes[index + 1]) { index += 2; continue }
        if index + 4 < bytes.count && Array(bytes[index..<index + 4]) == [92, 98, 105, 110] {
          var cursor = index + 4, count = 0
          while cursor < bytes.count && bytes[cursor] >= 48 && bytes[cursor] <= 57 { count = min(DocumentStore.maxBytes + 1, count * 10 + Int(bytes[cursor] - 48)); cursor += 1 }
          if cursor < bytes.count && bytes[cursor] == 32 { cursor += 1 }
          guard count <= DocumentStore.maxBytes, cursor + count <= bytes.count else { throw NativeFailure("RTF 二进制数据损坏。") }
          index = cursor + count; continue
        }
      }
      if bytes[index] == 123 { guard stack.count < 128 else { throw NativeFailure("RTF 嵌套过深。") }; stack.append(index) }
      if bytes[index] == 125 { guard let start = stack.popLast(), groups.count < 100_000 else { throw NativeFailure("RTF 分组无效或过多。") }; groups.append(start..<index + 1) }
      index += 1
    }
    guard stack.isEmpty else { throw NativeFailure("RTF 分组没有闭合。") }
    func raw(_ range: Range<Int>) -> String { String(data: Data(bytes[range]), encoding: .isoLatin1) ?? "" }
    func matches(_ pattern: String, _ text: String) -> Bool { text.range(of: pattern, options: .regularExpression) != nil }
    let fontTable = groups.first { raw($0).hasPrefix("{\\fonttbl") }.map(raw) ?? ""
    let header = String(data: data.prefix(1024), encoding: .isoLatin1) ?? ""
    let codepage = header.range(of: #"\\ansicpg\d+"#, options: .regularExpression).map { String(header[$0]) } ?? ""
    let unicodeFallback = header.range(of: #"\\uc\d+"#, options: .regularExpression).map { String(header[$0]) } ?? "\\uc1"
    let prefix = "{\\rtf1\\ansi" + codepage + unicodeFallback + fontTable
    func fragment(_ value: String, plain: Bool = false) throws -> String {
      let input = (prefix + value + "}").data(using: .isoLatin1)!
      let output = try run(URL(fileURLWithPath: "/usr/bin/textutil"), arguments: ["-convert", plain ? "txt" : "html", "-format", "rtf", "-stdin", "-stdout"], input: input, directory: directory)
      if plain { return String(data: output, encoding: .utf8) ?? "" }
      return String(data: try run(converter, arguments: ["--from=html", "--to=gfm+tex_math_dollars+footnotes", "--wrap=none"], input: output, directory: directory), encoding: .utf8) ?? ""
    }
    let modernFonts = groups.filter { raw($0).contains("\\fmodern") && matches(#"^\{\\f\d+"#, raw($0)) }.compactMap { group -> String? in let text = raw(group); return text.range(of: #"\\f\d+"#, options: .regularExpression).map { String(text[$0]) } }
    var edits = [(Range<Int>, String)](), replacements = [(String, String)](), notes = [String](), end = -1
    let deadline = Date().addingTimeInterval(30)
    for range in groups.sorted(by: { $0.lowerBound == $1.lowerBound ? $0.upperBound > $1.upperBound : $0.lowerBound < $1.lowerBound }) {
      if Date() > deadline { throw NativeFailure("RTF 导入超时，请拆分文档后重试。") }
      if range.lowerBound < end { continue }
      let value = raw(range), start = String(value.prefix(200)), token = "OTIMPORT" + UUID().uuidString.replacingOccurrences(of: "-", with: "")
      var replacement: String?
      if matches(#"^\{\s*\\(?:\*\s*\\)?footnote\b"#, start) {
        guard !value.contains("\\pict") else { throw NativeFailure("RTF 脚注内含图片，请先转换为 DOCX。原文件未修改。") }
        let cleaned = value.replacingOccurrences(of: #"\\\*\s*\\footnote|\\footnote|\\chftn|\\ftnalt"#, with: "", options: .regularExpression)
        let content = try fragment(cleaned).trimmingCharacters(in: .whitespacesAndNewlines), id = "rtf-note-" + String(notes.count + 1)
        notes.append("[^" + id + "]: " + content.replacingOccurrences(of: "\n", with: "\n    ")); replacement = "[^" + id + "]"
      } else if matches(#"^\{\s*\\pict\b"#, start) {
        let ext = value.contains("\\pngblip") ? "png" : value.contains("\\jpegblip") ? "jpg" : ""
        let signature = ext == "png" ? "89504e470d0a1a0a" : "ffd8ff"
        guard !ext.isEmpty, let beginning = value.lowercased().range(of: signature) else { throw NativeFailure("RTF 含未支持的图片类型，请先转换为 DOCX。原文件未修改。") }
        let hex = value[beginning.lowerBound...].filter { $0.isHexDigit }
        guard hex.count % 2 == 0 else { throw NativeFailure("RTF 图片数据损坏。") }
        let chars = Array(hex), decoded = Data(stride(from: 0, to: chars.count, by: 2).compactMap { UInt8(String(chars[$0...$0 + 1]), radix: 16) })
        let image = media.appendingPathComponent(String(hashData(decoded).prefix(20)) + "." + ext); try atomicWrite(image, decoded)
        replacement = "![导入图片](<" + image.path + ">)"
      } else if matches(#"^\{\\pard\b"#, start), let outline = start.range(of: #"\\outlinelevel[0-5]"#, options: .regularExpression) {
        let level = Int(String(start[outline].last!))! + 1
        let content = try fragment(value, plain: true).trimmingCharacters(in: .whitespacesAndNewlines)
        replacement = String(repeating: "#", count: level) + " " + content
      } else if matches(#"^\{\\pard\b"#, start), modernFonts.contains(where: { start.contains($0 + " ") || start.contains($0 + "\\") }) {
        let content = try fragment(value, plain: true).trimmingCharacters(in: .newlines)
        let longest = content.components(separatedBy: CharacterSet(charactersIn: "`\n").inverted).map { $0.count }.max() ?? 0
        let fence = String(repeating: "`", count: max(3, longest + 1)); replacement = fence + "\n" + content + "\n" + fence
      }
      if let replacement { let block = matches(#"^\{\\pard\b"#, start); edits.append((range, block ? "{\\pard\\plain " + token + "\\par}" : "{\\plain " + token + "}")); replacements.append((token, replacement)); end = range.upperBound }
    }
    var modified = data
    for (range, value) in edits.reversed() { modified.replaceSubrange(range, with: value.data(using: .isoLatin1)!) }
    var html = String(data: try run(URL(fileURLWithPath: "/usr/bin/textutil"), arguments: ["-convert", "html", "-format", "rtf", "-stdin", "-stdout"], input: modified, directory: directory), encoding: .utf8) ?? ""
    html = html.replacingOccurrences(of: #"<p\b[^>]*>\s*<br\s*/?>\s*</p>"#, with: "", options: .regularExpression)
    // Markdown tables require a header row; promote the first source row.
    let rows = try NSRegularExpression(pattern: #"(?s)(<table\b[^>]*>\s*(?:<tbody>\s*)?<tr>)(.*?)(</tr>)"#)
    for match in rows.matches(in: html, range: NSRange(html.startIndex..., in: html)).reversed() {
      let row = (html as NSString).substring(with: match.range(at: 2)).replacingOccurrences(of: "<td", with: "<th").replacingOccurrences(of: "</td>", with: "</th>")
      html = (html as NSString).replacingCharacters(in: match.range(at: 2), with: row)
    }
    var markdown = String(data: try run(converter, arguments: ["--from=html", "--to=gfm+tex_math_dollars+footnotes", "--wrap=none"], input: Data(html.utf8), directory: directory), encoding: .utf8) ?? ""
    for (token, value) in replacements { markdown = markdown.replacingOccurrences(of: token, with: value) }
    if !notes.isEmpty { markdown += "\n\n" + notes.joined(separator: "\n\n") + "\n" }
    complete = true
    return ["markdown": markdown, "name": file.deletingPathExtension().lastPathComponent + ".md"]
  }
  static func importFile(_ file: URL, directory: URL) throws -> [String: String] {
    let fm = FileManager.default
    guard (try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? DocumentStore.maxBytes + 1) <= DocumentStore.maxBytes else { throw NativeFailure("导入文件超过 20 MB。") }
    if let converter = pandoc(), file.pathExtension.lowercased() == "rtf" { return try importRTF(file, directory: directory, converter: converter) }
    if let converter = pandoc(), file.pathExtension.lowercased() != "doc" {
      // Imported media has an owned persistent location; no resource is written beside the original.
      let media = directory.appendingPathComponent("Imported/" + UUID().uuidString)
      try fm.createDirectory(at: media, withIntermediateDirectories: true)
      var complete = false
      defer { if !complete { try? fm.removeItem(at: media) } }
      let output = try run(converter, arguments: [file.path, "--from=" + (["tex": "latex", "html": "html", "htm": "html", "txt": "markdown"][file.pathExtension.lowercased()] ?? file.pathExtension.lowercased()), "--to=gfm+tex_math_dollars+footnotes", "--markdown-headings=atx", "--wrap=none", "--extract-media=" + media.path], input: nil, directory: directory)
      guard let text = String(data: output, encoding: .utf8) else { throw NativeFailure("导入结果不是 UTF-8。") }
      complete = true
      return ["markdown": text, "name": file.deletingPathExtension().lastPathComponent + ".md"]
    }
    let data = try run(URL(fileURLWithPath: "/usr/bin/textutil"), arguments: ["-convert", "html", "-stdout", file.path], input: nil, directory: directory)
    guard let html = String(data: data, encoding: .utf8) else { throw NativeFailure("导入结果不是 UTF-8。") }
    return ["html": html, "name": file.deletingPathExtension().lastPathComponent + ".md"]
  }
  static func plugins(_ directory: URL) throws -> [[String: String]] {
    let root = directory.appendingPathComponent("plugins")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    guard contained(canonicalFileURL(directory), canonicalFileURL(root)) else { throw NativeFailure("插件目录无效。") }
    return try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }.compactMap { file in
      guard contained(root, canonicalFileURL(file)), let item = try? JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: String], let id = item["id"], id.range(of: "^local-[a-f0-9]{64}$", options: .regularExpression) != nil, file.lastPathComponent == id + ".json", FileManager.default.fileExists(atPath: root.appendingPathComponent(id + ".mjs").path) else { return nil }
      return ["id": id, "name": item["name"] ?? id, "url": "opentypora://app/_plugins/" + id + ".mjs"]
    }
  }
  static func installPlugin(_ file: URL, directory: URL) throws -> [String: String] {
    guard ["js", "cjs"].contains(file.pathExtension.lowercased()), (try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 1_000_001) <= 1_000_000 else { throw NativeFailure("请选择小于 1 MB 的 JavaScript 插件。") }
    let bytes = try Data(contentsOf: file)
    guard let source = String(data: bytes, encoding: .utf8), !source.contains("\0") else { throw NativeFailure("插件必须使用 UTF-8 编码。") }
    let id = "local-" + hashData(bytes), name = String(file.deletingPathExtension().lastPathComponent.prefix(96))
    let root = directory.appendingPathComponent("plugins")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    guard contained(canonicalFileURL(directory), canonicalFileURL(root)) else { throw NativeFailure("插件目录无效。") }
    let module = """
    export default function(context) {
    const {BasePlugin,BaseCustomPlugin,utils,File,$,document,window} = context;
    const require=context.require; const module={exports:{}}; const exports=module.exports;
    \(source)
    ;return module.exports.plugin || module.exports.default || module.exports;
    }
    """
    try atomicWrite(root.appendingPathComponent(id + ".mjs"), Data(module.utf8))
    try atomicWrite(root.appendingPathComponent(id + ".json"), JSONSerialization.data(withJSONObject: ["id": id, "name": name]))
    return ["id": id, "name": name, "url": "opentypora://app/_plugins/" + id + ".mjs"]
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
