import AppKit
import CoreGraphics
import Darwin
import WebKit

final class WebKitTests: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  let owner = NativeApplication()
  var host: NativeWindowHost!
  func applicationDidFinishLaunching(_ notification: Notification) {
    do {
      let directory = owner.directory
      let file = directory.appendingPathComponent("WebKit-fixture.md")
      let source =
        "# WebKit 验收\n\n普通 **粗体** 与 *斜体*。\n\n- [ ] 任务\n\n| 名称 | 内容 |\n| --- | --- |\n| A | B |\n\n```javascript\nconst count = 1;\n```\n\n$$\n\\newcommand{\\myvalue}{x+1}\n$$\n\n$$\n\\myvalue + \\mathbb{R}\n$$\n"
      try atomicWrite(file, Data(source.utf8))
      let store = DocumentStore(directory)
      let record = try store.open(file, id: "webkit-fixture")
      host = NativeWindowHost(
        owner: owner, directory: directory,
        seed: SessionRecord(documents: [record], activeId: record.id))
      host.show(hidden: true)
      host.webView.navigationDelegate = self
      DispatchQueue.main.asyncAfter(deadline: .now() + 45) {
        fputs("WebKit test timed out\n", stderr)
        exit(1)
      }
    } catch { fail(error) }
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    do {
      let script = try String(
        contentsOf: Bundle.main.resourceURL!.appendingPathComponent("web-tests.js"), encoding: .utf8
      )
      webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { result in
        do {
          let value = try result.get()
          guard let output = value as? [String: Any], output["error"] == nil else {
            throw NativeFailure(String(describing: value))
          }
          let saved = try String(
            contentsOf: self.owner.directory.appendingPathComponent("WebKit-fixture.md"),
            encoding: .utf8)
          guard saved == output["source"] as? String else {
            throw NativeFailure("Native saved bytes differ from the editor document.")
          }
          let pdfURL = self.owner.directory.appendingPathComponent("native-test.pdf")
          guard let pdf = CGPDFDocument(pdfURL as CFURL), pdf.numberOfPages >= 1,
            pdf.numberOfPages <= 3, try Data(contentsOf: pdfURL).count < 1_000_000
          else { throw NativeFailure("Native PDF pagination or size is invalid.") }
          print("PASS: native PDF is valid A4 with \(pdf.numberOfPages) pages and bounded size")
          let data = try JSONSerialization.data(
            withJSONObject: output, options: [.prettyPrinted, .sortedKeys])
          print(String(data: data, encoding: .utf8)!)
          print("PASS: native WebKit bridge persisted exact editor bytes")
          exit(0)
        } catch { self.fail(error) }
      }
    } catch { fail(error) }
  }
  func fail(_ error: Error) {
    fputs("\(error)\n", stderr)
    exit(1)
  }
}
@main struct WebKitTestMain {
  static func main() {
    setbuf(stdout, nil)
    let app = NSApplication.shared
    let delegate = WebKitTests()
    app.delegate = delegate
    app.setActivationPolicy(.prohibited)
    app.run()
    withExtendedLifetime(delegate) {}
  }
}
