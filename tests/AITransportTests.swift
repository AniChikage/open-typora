import Foundation
@main struct AITransportTests {
  static func check(_ condition: @autoclosure () -> Bool, _ name: String) throws { if !condition() { throw NSError(domain: "AITest", code: 1, userInfo: [NSLocalizedDescriptionKey: name]) }; print("PASS: " + name) }
  static func main() async throws {
    let directory = URL(fileURLWithPath: CommandLine.arguments[1]), base = CommandLine.arguments[2]
    let service = NativeAIService(directory), secret = "owned-native-fixture-not-a-real-key"
    let input: [String: Any] = ["id": "native-compatible", "instruction": "更简洁", "text": "你好，中国。这是原始选区。"]
    let settings = try service.settings(["protocol": "openai", "baseUrl": base + "/vendor/v1", "model": "native-qa", "apiKey": secret, "rememberKey": false])
    try check(settings["hasKey"] as? Bool == true && settings["keyStorage"] as? String == "session", "native session credential works without writing a key to settings")
    let result = try await service.rewrite(input)
    try check(result["text"] == "你好，中国", "native URLSession reaches the compatible endpoint and parses the real JSON response")
    let saved = try String(contentsOf: directory.appendingPathComponent("ai-settings.json"), encoding: .utf8)
    try check(!saved.contains(secret), "native settings file never contains the API key")
    _ = try service.settings(["protocol": "ollama", "baseUrl": base + "/api", "model": "native-local-qa", "rememberKey": false])
    let localResult = try await service.rewrite(["id": "native-ollama", "instruction": "改写", "text": "本地原文"])
    try check(localResult["text"] == "你好，中国", "native Ollama endpoint and response shape are supported without an API key")
    for (route, message) in [("unauthorized", "HTTP 401"), ("redirect", "重定向"), ("large", "输出过大")] {
      _ = try service.settings(["protocol": "openai", "baseUrl": base + "/" + route, "model": "native-qa", "apiKey": secret, "rememberKey": false])
      do { _ = try await service.rewrite(["id": route, "instruction": "改写", "text": "原文"]); throw NSError(domain: "UnexpectedSuccess", code: 2) }
      catch { try check(error.localizedDescription.contains(message) && !error.localizedDescription.contains(secret), "native " + route + " response is refused without exposing credentials") }
    }
    service.cancel("early-cancel")
    do { _ = try await service.rewrite(["id": "early-cancel", "instruction": "改写", "text": "原文"]); throw NSError(domain: "UnexpectedSuccess", code: 3) }
    catch { try check(error.localizedDescription.contains("已取消"), "native cancellation before request registration sends no network request") }
    _ = try service.settings(["protocol": "openai", "baseUrl": base + "/slow", "model": "native-qa", "rememberKey": false])
    let pending = Task { try await service.rewrite(["id": "native-cancel", "instruction": "改写", "text": "原文"]) }
    try await Task.sleep(nanoseconds: 100_000_000); service.cancel("native-cancel")
    do { _ = try await pending.value; throw NSError(domain: "UnexpectedSuccess", code: 4) }
    catch { try check(error.localizedDescription.contains("已取消"), "native in-flight cancellation aborts URLSession") }
    print("PASS: native AI transport acceptance complete")
  }
}
