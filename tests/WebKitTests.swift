import AppKit
import CoreGraphics
import PDFKit
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
      let plugin = directory.appendingPathComponent("Native-plugin-fixture.js")
      try atomicWrite(plugin, Data("class NativePlugin extends BasePlugin { style() { return '#write { --plugin-fixture: loaded; }' }; call() { this.utils.insertText('插件') } }; module.exports = {plugin: NativePlugin};".utf8))
      _ = try Interchange.installPlugin(plugin, directory: directory)
      let record = try store.open(file, id: "webkit-fixture")
      host = NativeWindowHost(
        owner: owner, directory: directory,
        seed: SessionRecord(documents: [record], activeId: record.id))
      owner.hosts.append(host)
      host.show(hidden: true)
      host.webView.navigationDelegate = self
      DispatchQueue.main.asyncAfter(deadline: .now() + 180) {
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
      webView.callAsyncJavaScript(script, arguments: ["uploaderURL": ProcessInfo.processInfo.environment["OPEN_TYPORA_TEST_UPLOADER"] ?? ""], in: nil, in: .page) { result in
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
          guard let pdf = CGPDFDocument(pdfURL as CFURL), pdf.numberOfPages == 1,
            try Data(contentsOf: pdfURL).count < 1_000_000
          else { throw NativeFailure("Native PDF pagination or size is invalid.") }
          print("PASS: native PDF is valid A4 with \(pdf.numberOfPages) pages and bounded size")
          let longURL = self.owner.directory.appendingPathComponent("native-test-long.pdf")
          guard let longPDF = PDFDocument(url: longURL), longPDF.pageCount > 5 else { throw NativeFailure("Long PDF did not paginate.") }
          let longText = longPDF.string ?? ""
          for number in 1...90 { let marker = String(format: "Paragraph-%03d", number); guard longText.components(separatedBy: marker).count == 2 else { throw NativeFailure("PDF lost or duplicated " + marker + " count=" + String(longText.components(separatedBy: marker).count - 1)) } }
          for number in 1...30 { let marker = String(format: "Row-%03d", number); guard longText.components(separatedBy: marker).count == 2 else { throw NativeFailure("PDF lost or duplicated " + marker + " count=" + String(longText.components(separatedBy: marker).count - 1)) } }
          for number in 0..<longPDF.pageCount {
            guard let page = longPDF.page(at: number), abs(page.bounds(for: .mediaBox).width - 612) < 1, page.string?.contains("\(number + 1) / \(longPDF.pageCount)") == true else { throw NativeFailure("PDF paper or page counter is wrong.") }
          }
          print("PASS: long PDF has \(longPDF.pageCount) Letter pages, every paragraph and row once, and correct page counters")
          let complexURL = self.owner.directory.appendingPathComponent("native-complex.pdf")
          guard let complexPDF = PDFDocument(url: complexURL), complexPDF.pageCount >= 1,
            let complexText = complexPDF.string?.precomposedStringWithCompatibilityMapping, complexText.contains("复杂中文文档"), complexText.contains("中文甲"), complexText.contains("中文脚注内容") else { throw NativeFailure("Complex native PDF lost Chinese content or table/footnote text.") }
          print("PASS: complex PDF contains Chinese headings, table cells and footnotes across \(complexPDF.pageCount) pages")
          let html = try String(contentsOf: self.owner.directory.appendingPathComponent("native-test.html"), encoding: .utf8)
          guard html.contains("data:image/"), html.contains("data:font/"), !html.contains("<link rel=\"stylesheet\"") else { throw NativeFailure("HTML export retained live app assets.") }
          print("PASS: HTML export contains embedded fonts and the owned local image")
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
