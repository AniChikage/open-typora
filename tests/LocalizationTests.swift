import AppKit
import WebKit

final class LocalizationTests: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  let owner = NativeApplication()
  var host: NativeWindowHost!
  func applicationDidFinishLaunching(_ notification: Notification) {
    do {
      let env = ProcessInfo.processInfo.environment
      let expected = env["LANE_LOCALE_EXPECTED"]!
      guard UILanguage.system == env["LANE_SYSTEM_EXPECTED"] else { throw NativeFailure("Incorrect macOS system language") }
      if expected == "en" {
        try atomicWrite(owner.directory.appendingPathComponent("Sample Notes/Welcome.md"), Data("# Preserved welcome note\n\nMy existing words.\n".utf8))
      }
      host = NativeWindowHost(owner: owner, directory: owner.directory)
      owner.hosts.append(host)
      host.show(hidden: true)
      host.buildMenu()
      if let saved = env["LANE_SAVED_LANGUAGE"] {
        let json = String(data: try JSONSerialization.data(withJSONObject: ["language": saved, "fontSize": 21]), encoding: .utf8)!
        let literal = String(data: try JSONSerialization.data(withJSONObject: [json]), encoding: .utf8)!
        host.webView.configuration.userContentController.addUserScript(WKUserScript(source: "localStorage.setItem('open-typora-preferences', \(literal)[0]);", injectionTime: .atDocumentStart, forMainFrameOnly: true))
      }
      host.webView.navigationDelegate = self
      DispatchQueue.main.asyncAfter(deadline: .now() + 30) { fputs("Native localization timed out\n", stderr); exit(1) }
    } catch { fail(error) }
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    let script = """
      const deadline = Date.now() + 15000;
      while (!document.querySelector('.rich-document p') || document.documentElement.lang !== expected) {
        if (Date.now() > deadline) throw Error('First-run UI did not initialize in '+expected);
        await new Promise(r=>setTimeout(r,30));
      }
      const names = [...document.querySelectorAll('[role=tab]')].map(n=>n.textContent.replace('×','').trim());
      const wanted = expected === 'en' ? ['Welcome.md','Writing Example.md','Markdown Guide.md'] : ['欢迎.md','写作示例.md','Markdown 语法.md'];
      if (!wanted.every(name=>names.some(n=>n.includes(name)))) throw Error('Wrong sample tabs: '+names);
      if (expected === 'en' && /[\\u3400-\\u9fff]/u.test(document.body.innerText)) throw Error('Chinese text in English first-run UI');
      const reply = await window.desktop.restore(expected);
      if (!reply.ok) throw Error(reply.error);
      const session = reply.value;
      const persisted = await window.desktop.persist(session);
      if (!persisted.ok) throw Error(persisted.error);
      const again = await window.desktop.restore(expected === 'en' ? 'zh-CN' : 'en');
      if (!again.ok || JSON.stringify(again.value.documents.map(d=>[d.id,d.path,d.content])) !== JSON.stringify(session.documents.map(d=>[d.id,d.path,d.content]))) throw Error('Restored session was translated or replaced');
      const saved = JSON.parse(localStorage.getItem('open-markdown-lane-preferences'));
      if (saved.language !== expected || (hasSaved && saved.fontSize !== 21)) throw Error('Saved preferences lost');
      return {locale:document.documentElement.lang, names, restored:true};
      """
    let env = ProcessInfo.processInfo.environment
    webView.callAsyncJavaScript(script, arguments: ["expected": env["LANE_LOCALE_EXPECTED"]!, "hasSaved": env["LANE_SAVED_LANGUAGE"] != nil], in: nil, in: .page) { result in
      do {
        _ = try result.get()
        if env["LANE_LOCALE_EXPECTED"] == "en" {
          guard try String(contentsOf: self.owner.directory.appendingPathComponent("Sample Notes/Welcome.md"), encoding: .utf8) == "# Preserved welcome note\n\nMy existing words.\n" else { throw NativeFailure("Existing welcome note was overwritten") }
          guard NSApp.mainMenu?.items.contains(where: { $0.title == "File" }) == true else { throw NativeFailure("Native menus did not switch to English") }
        }
        print("PASS: native first-run UI, samples, menu and preserved session: " + env["LANE_LOCALE_CASE"]!)
        exit(0)
      } catch { self.fail(error) }
    }
  }
  func fail(_ error: Error) { fputs("Native localization failure: \(error)\n", stderr); exit(1) }
}
@main struct LocalizationTestMain {
  static func main() {
    let app = NSApplication.shared, delegate = LocalizationTests()
    app.delegate = delegate; app.setActivationPolicy(.prohibited); app.run(); withExtendedLifetime(delegate) {}
  }
}
