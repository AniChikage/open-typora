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
    try check(!saved.contains(secret), "native session-only settings file never contains the API key")
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
    let fileDirectory = directory.appendingPathComponent("file-store")
    var forbiddenLegacyCalls = 0
    let noLegacy: (String, Bool) throws -> String? = { _, _ in forbiddenLegacyCalls += 1; throw NSError(domain: "UnexpectedLegacyAccess", code: 1) }
    let fileService = NativeAIService(fileDirectory, legacyReader: noLegacy)
    let fileUpdate: [String: Any] = ["protocol": "openai", "baseUrl": base + "/vendor/v1", "model": "native-qa", "apiKey": secret, "rememberKey": true]
    let persistent = try fileService.settings(fileUpdate)
    try check(persistent["keyStorage"] as? String == "file" && persistent["persistentStorage"] as? String == "file", "native remembered key uses the local configuration file")
    let fileURL = fileDirectory.appendingPathComponent("ai-settings.json")
    let fileJSON = try JSONSerialization.jsonObject(with: Data(contentsOf: fileURL)) as! [String: Any]
    try check(fileJSON["apiKey"] as? String == secret && fileJSON["version"] as? Int == 2, "native configuration persists the exact owned key in version 2")
    let metadata = String(data: try JSONSerialization.data(withJSONObject: persistent), encoding: .utf8)!
    try check(!metadata.contains(secret) && persistent["apiKey"] == nil, "native plaintext credentials never return through settings metadata")
    var editedConfig = fileJSON; editedConfig["apiKey"] = secret + "-edited"; editedConfig["model"] = "edited-credential";
    try atomicWrite(fileURL, JSONSerialization.data(withJSONObject: editedConfig))
    let editedResult = try await fileService.rewrite(["id": "native-file-edited", "instruction": "润色", "text": "公开选区"])
    try check(editedResult["text"] == "你好，中国", "native external configuration edits take effect without stale in-memory credentials")
    try atomicWrite(fileURL, JSONSerialization.data(withJSONObject: fileJSON))
    try FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: fileURL.path)
    _ = try fileService.settings(["protocol": "openai", "baseUrl": base + "/vendor/v1", "model": "native-qa", "rememberKey": true])
    let permissions = (try FileManager.default.attributesOfItem(atPath: fileURL.path)[.posixPermissions] as! NSNumber).intValue
    try check(permissions == 0o600, "native file updates enforce owner-only permissions even when the old file was broader")
    let reopened = NativeAIService(fileDirectory, legacyReader: noLegacy)
    let reopenedResult = try await reopened.rewrite(["id": "native-file-reopened", "instruction": "润色", "text": "公开选区"])
    try check(reopenedResult["text"] == "你好，中国" && forbiddenLegacyCalls == 0, "native restart and rewrite use the persisted key without touching Keychain")
    _ = try fileService.settings(["protocol": "openai", "baseUrl": base + "/vendor/v1", "model": "native-qa", "rememberKey": false])
    let sessionOnlyFile = try String(contentsOf: fileURL, encoding: .utf8)
    let afterExit = try NativeAIService(fileDirectory, legacyReader: noLegacy).settings()
    try check(!sessionOnlyFile.contains(secret) && afterExit["hasKey"] as? Bool == false, "native session-only option removes the persisted key and does not survive restart")

    func legacyFixture(_ name: String) throws -> URL {
      let folder = directory.appendingPathComponent(name)
      try atomicWrite(folder.appendingPathComponent("ai-settings.json"), JSONSerialization.data(withJSONObject: ["version": 1, "protocol": "openai", "baseUrl": base + "/vendor/v1", "model": "native-qa"]))
      return folder
    }
    let silentDirectory = try legacyFixture("legacy-silent")
    var silentCalls = [Bool]()
    let migratedSilently = try NativeAIService(silentDirectory, legacyReader: { _, interactive in silentCalls.append(interactive); return secret }).settings()
    _ = try NativeAIService(silentDirectory, legacyReader: noLegacy).settings()
    try check(migratedSilently["keyStorage"] as? String == "file" && silentCalls == [false] && forbiddenLegacyCalls == 0, "authorized legacy key migrates silently once; subsequent launches never query Keychain")
    let deniedDirectory = try legacyFixture("legacy-denied")
    var deniedCalls = [Bool]()
    let denied = NativeAIService(deniedDirectory, legacyReader: { _, interactive in deniedCalls.append(interactive); if !interactive { throw NSError(domain: "InteractionRequired", code: 1) }; return secret })
    let firstRead = try denied.settings(); _ = try denied.settings()
    try check(firstRead["needsKeyMigration"] as? Bool == true && deniedCalls == [false], "denied legacy access is noninteractive and is not retried on each settings read")
    do { _ = try await denied.rewrite(["id": "legacy-needs-migration", "instruction": "润色", "text": "公开选区"]); throw NSError(domain: "UnexpectedSuccess", code: 5) }
    catch { try check(error.localizedDescription.contains("迁移旧密钥") && deniedCalls == [false], "normal rewrite cannot trigger an interactive legacy Keychain request") }
    let explicit = try denied.settings(["protocol": "openai", "baseUrl": base + "/vendor/v1", "model": "native-qa", "rememberKey": true, "migrateLegacyKey": true])
    _ = try NativeAIService(deniedDirectory, legacyReader: noLegacy).settings()
    try check(explicit["keyStorage"] as? String == "file" && deniedCalls == [false, true] && forbiddenLegacyCalls == 0, "explicit one-time migration persists the key and removes future Keychain dependency")
    let missingDirectory = try legacyFixture("legacy-no-key")
    let missing = try NativeAIService(missingDirectory, legacyReader: { _, interactive in if interactive { throw NSError(domain: "UnexpectedInteraction", code: 1) }; return nil }).settings()
    try check(missing["hasKey"] as? Bool == false && missing["needsKeyMigration"] as? Bool == false, "legacy local servers without a key migrate without an authorization prompt")

    print("PASS: native AI transport acceptance complete")
  }
}
