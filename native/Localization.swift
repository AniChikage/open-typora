import Foundation

enum UILanguage {
  static var current = "zh-CN"
  static let english: [String: String] = {
    let candidates = [Bundle.main.url(forResource: "en", withExtension: "json"), Bundle.main.executableURL?.deletingLastPathComponent().appendingPathComponent("en.json")].compactMap { $0 }
    for file in candidates { if let data = try? Data(contentsOf: file), let value = try? JSONDecoder().decode([String: String].self, from: data) { return value } }
    return [:]
  }()
  static let templates: [(NSRegularExpression, String)] = english.keys.filter { $0.contains("{0}") }.sorted { $0.count > $1.count }.compactMap { key in
    let parts = key.components(separatedBy: try! NSRegularExpression(pattern: "\\{\\d+\\}"))
    let pattern = "^" + parts.map(NSRegularExpression.escapedPattern(for:)).joined(separator: "([\\s\\S]*?)") + "$"
    return (try? NSRegularExpression(pattern: pattern)).map { ($0, english[key]!) }
  }
}
private extension String {
  func components(separatedBy regex: NSRegularExpression) -> [String] {
    let value = self as NSString; var from = 0; var parts = [String]()
    for match in regex.matches(in: self, range: NSRange(location: 0, length: value.length)) { parts.append(value.substring(with: NSRange(location: from, length: match.range.location - from))); from = NSMaxRange(match.range) }
    parts.append(value.substring(from: from)); return parts
  }
}
func l(_ source: String, _ arguments: Any...) -> String {
  guard UILanguage.current == "en" else {
    return arguments.enumerated().reduce(source) { $0.replacingOccurrences(of: "{\($1.offset)}", with: String(describing: $1.element)) }
  }
  var value = UILanguage.english[source] ?? source
  if value == source && UILanguage.english[source] == nil {
    let text = source as NSString
    for (pattern, template) in UILanguage.templates {
      guard let match = pattern.firstMatch(in: source, range: NSRange(location: 0, length: text.length)) else { continue }
      value = template
      for index in 1..<match.numberOfRanges { let part = text.substring(with: match.range(at: index)); value = value.replacingOccurrences(of: "{\(index - 1)}", with: UILanguage.english[part] ?? part) }
      break
    }
  }
  return arguments.enumerated().reduce(value) { $0.replacingOccurrences(of: "{\($1.offset)}", with: String(describing: $1.element)) }
}
