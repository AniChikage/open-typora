import AppKit
import CoreGraphics
import WebKit

final class PDFExporter: NSObject, WKNavigationDelegate {
  private let view: WKWebView
  private let window: NSWindow
  private let paginationScript: String
  private var completion: ((Result<Data, Error>) -> Void)?
  private var options = [String: Any]()
  init(resources: URL, store: DocumentStore) {
    paginationScript = (try? String(contentsOf: resources.appendingPathComponent("pagination.js"), encoding: .utf8)) ?? ""
    let configuration = WKWebViewConfiguration()
    let handler = Resources(resources, store: store)
    configuration.setURLSchemeHandler(handler, forURLScheme: "opentypora")
    configuration.setURLSchemeHandler(handler, forURLScheme: "open-typora-asset")
    view = WKWebView(
      frame: NSRect(x: 0, y: 0, width: 523.28, height: 769.89), configuration: configuration)
    window = NSWindow(contentRect: view.frame, styleMask: [], backing: .buffered, defer: false)
    window.contentView = view
    window.isReleasedWhenClosed = false
    super.init()
    view.navigationDelegate = self
  }
  func export(_ html: String, options: [String: Any] = [:], completion: @escaping (Result<Data, Error>) -> Void) {
    self.completion = completion
    self.options = options
    let width = options["paper"] as? String == "letter" ? 612.0 : 595.28
    let height = options["paper"] as? String == "letter" ? 792.0 : 841.89
    let margin = max(18, min(100, options["margin"] as? Double ?? 36))
    view.frame.size = NSSize(width: width - 2 * margin, height: height - 2 * margin)
    view.loadHTMLString(html, baseURL: URL(string: "opentypora://app/"))
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
      self?.finish(.failure(NativeFailure("PDF 导出超时，请缩小文档后重试。")))
    }
  }
  private func finish(_ result: Result<Data, Error>) {
    let callback = completion
    completion = nil
    window.close()
    callback?(result)
  }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    finish(.failure(error))
  }
  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) { finish(.failure(error)) }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    #if WEBTEST
      print("PDF: export document loaded")
    #endif
    let measurement = """
      const root = document.querySelector('.print-document'); root.getBoundingClientRect();
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = image.onerror = resolve; setTimeout(resolve, 5000); })));
      \(paginationScript)
      return openTyporaPagination(root, pageHeight);
      """
    let pageHeight = view.frame.height - ((options["header"] as? String ?? "").isEmpty ? 0 : 16) - ((options["footer"] as? String ?? "").isEmpty ? 0 : 16)
    view.callAsyncJavaScript(measurement, arguments: ["pageHeight": pageHeight], in: nil, in: .page) { result in
      do {
        guard let measurements = try result.get() as? [String: Any], let height = measurements["height"] as? Double, let breaks = measurements["breaks"] as? [Double], height > 0, height <= pageHeight * 2000 else {
          throw NativeFailure("文档大小超出 PDF 导出范围。")
        }
        #if WEBTEST
          print("PDF: measured height", height)
        #endif
        let headers = measurements["headers"] as? [[String: Double]] ?? []
        self.capture(breaks, headerRects: headers, at: 0, pages: [], headers: [])
      } catch { self.finish(.failure(error)) }
    }
  }
  private func capture(_ breaks: [Double], headerRects: [[String: Double]], at index: Int, pages: [Data], headers: [Data?]) {
    guard completion != nil else { return }
    if index + 1 >= breaks.count {
      let options = self.options
      DispatchQueue.global(qos: .userInitiated).async {
        let output = Result { try Self.compose(pages, options: options, headers: headers) }
        DispatchQueue.main.async { self.finish(output) }
      }; return
    }
    func body(_ header: Data?) {
      let configuration = WKPDFConfiguration()
      configuration.rect = CGRect(x: 0, y: breaks[index], width: self.view.frame.width, height: max(1, breaks[index + 1] - breaks[index]))
      self.view.createPDF(configuration: configuration) { result in
        do { self.capture(breaks, headerRects: headerRects, at: index + 1, pages: pages + [try result.get()], headers: headers + [header]) }
        catch { self.finish(.failure(error)) }
      }
    }
    if index < headerRects.count, let top = headerRects[index]["top"], let height = headerRects[index]["height"], top >= 0, height > 0 {
      let configuration = WKPDFConfiguration(); configuration.rect = CGRect(x: 0, y: top, width: view.frame.width, height: height)
      view.createPDF(configuration: configuration) { result in
        do { body(try result.get()) } catch { self.finish(.failure(error)) }
      }
    } else { body(nil) }
  }
  static func compose(_ pages: [Data], options: [String: Any], headers: [Data?] = []) throws -> Data {
    guard !pages.isEmpty, pages.count <= 2000 else { throw NativeFailure("导出页数超出支持范围。") }
    let width = options["paper"] as? String == "letter" ? 612.0 : 595.28
    let height = options["paper"] as? String == "letter" ? 792.0 : 841.89
    let margin = max(18, min(100, options["margin"] as? Double ?? 36))
    let header = options["header"] as? String ?? "", footer = options["footer"] as? String ?? ""
    let headerSpace = header.isEmpty ? 0.0 : 16.0
    let output = NSMutableData()
    guard let consumer = CGDataConsumer(data: output), let context = CGContext(consumer: consumer, mediaBox: nil, [kCGPDFContextTitle as String: options["title"] as? String ?? "", kCGPDFContextCreator as String: "Open Typora"] as CFDictionary) else { throw NativeFailure("无法创建 PDF。") }
    for (index, data) in pages.enumerated() {
      guard let provider = CGDataProvider(data: data as CFData), let document = CGPDFDocument(provider), let page = document.page(at: 1) else { throw NativeFailure("WebKit 未生成有效 PDF 页面。") }
      let source = page.getBoxRect(.mediaBox), scale = (width - margin * 2) / source.width
      context.beginPDFPage([kCGPDFContextMediaBox as String: CGRect(x: 0, y: 0, width: width, height: height).data] as CFDictionary)
      var repeatedHeaderHeight = 0.0
      if index < headers.count, let data = headers[index], let provider = CGDataProvider(data: data as CFData), let document = CGPDFDocument(provider), let headerPage = document.page(at: 1) {
        let bounds = headerPage.getBoxRect(.mediaBox); repeatedHeaderHeight = bounds.height * scale
        context.saveGState(); context.translateBy(x: margin, y: height - margin - headerSpace - repeatedHeaderHeight); context.scaleBy(x: scale, y: scale); context.translateBy(x: -bounds.minX, y: -bounds.minY); context.drawPDFPage(headerPage); context.restoreGState()
      }
      context.saveGState()
      let target = CGRect(x: margin, y: height - margin - headerSpace - repeatedHeaderHeight - source.height * scale, width: width - margin * 2, height: source.height * scale)
      context.clip(to: target)
      context.translateBy(x: target.minX, y: target.minY)
      context.scaleBy(x: scale, y: scale)
      context.translateBy(x: -source.minX, y: -source.minY)
      context.drawPDFPage(page)
      context.restoreGState()
      let variables = ["${title}": options["title"] as? String ?? "", "${pageNo}": String(index + 1), "${totalPages}": String(pages.count), "${date}": DateFormatter.localizedString(from: Date(), dateStyle: .short, timeStyle: .none)]
      NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
      for (template, y) in [(header, height - margin + 4), (footer, max(8, margin - 17))] where !template.isEmpty {
        let text = variables.reduce(template) { $0.replacingOccurrences(of: $1.key, with: $1.value) }
        (text as NSString).draw(in: NSRect(x: margin, y: y, width: width - margin * 2, height: 13), withAttributes: [.font: NSFont.systemFont(ofSize: 9), .foregroundColor: NSColor.gray])
      }
      NSGraphicsContext.restoreGraphicsState(); context.endPDFPage()
    }
    context.closePDF(); return output as Data
  }
}

extension CGRect {
  fileprivate var data: Data {
    var rect = self
    return Data(bytes: &rect, count: MemoryLayout<CGRect>.size)
  }
}
