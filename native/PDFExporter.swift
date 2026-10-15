import AppKit
import CoreGraphics
import WebKit

final class PDFExporter: NSObject, WKNavigationDelegate {
  private let view: WKWebView
  private let window: NSWindow
  private var completion: ((Result<Data, Error>) -> Void)?
  private var options = [String: Any]()
  init(resources: URL, store: DocumentStore) {
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
      // The final block's bottom margin has no painted content. Counting it can
      // create an otherwise empty last page when text fits within the page.
      const range = document.createRange(); range.selectNodeContents(root);
      const height = Math.ceil(Math.max(1, range.getBoundingClientRect().bottom));
      const keep = [];
      for (const block of root.querySelectorAll('p,pre,blockquote,tr,img,svg,figure,video,h1,h2,h3,h4,h5,h6')) {
        const rect = block.getBoundingClientRect();
        let bottom = rect.bottom;
        if (/^H[1-6]$/.test(block.tagName)) { const next = block.nextElementSibling; if (next) bottom = Math.max(bottom, Math.min(next.getBoundingClientRect().bottom, next.getBoundingClientRect().top + 22)); }
        if (bottom - rect.top < pageHeight && bottom > rect.top) keep.push([rect.top, bottom]);
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node;
      while ((node = walker.nextNode())) { const line = document.createRange(); line.selectNodeContents(node); for (const rect of line.getClientRects()) if (rect.height > 0 && rect.height < pageHeight) keep.push([rect.top, rect.bottom]); }
      const forced = [...root.querySelectorAll('*')].filter(element => ['always','page'].includes(getComputedStyle(element).breakBefore) || getComputedStyle(element).pageBreakBefore === 'always').map(element => element.getBoundingClientRect().top);
      const breaks = [0]; let start = 0;
      while (start < height && breaks.length <= 2000) {
        let end = Math.min(height, start + pageHeight);
        const explicit = forced.find(at => at > start + 1 && at < end); if (explicit) end = explicit;
        for (let i = 0; i < 20; i++) { const crossing = keep.filter(([top,bottom]) => top > start + 1 && top < end - .1 && bottom > end + .1); if (!crossing.length) break; end = Math.min(...crossing.map(item => item[0])); }
        if (end <= start + 1) end = Math.min(height, start + pageHeight);
        breaks.push(end); start = end;
      }
      return {height, breaks};
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
        self.capture(breaks, at: 0, pages: [])
      } catch { self.finish(.failure(error)) }
    }
  }
  private func capture(_ breaks: [Double], at index: Int, pages: [Data]) {
    guard completion != nil else { return }
    if index + 1 >= breaks.count {
      let options = self.options
      DispatchQueue.global(qos: .userInitiated).async {
        let output = Result { try Self.compose(pages, options: options) }
        DispatchQueue.main.async { self.finish(output) }
      }
      return
    }
    let configuration = WKPDFConfiguration()
    configuration.rect = CGRect(x: 0, y: breaks[index], width: view.frame.width, height: max(1, breaks[index + 1] - breaks[index]))
    view.createPDF(configuration: configuration) { result in
      do { self.capture(breaks, at: index + 1, pages: pages + [try result.get()]) }
      catch { self.finish(.failure(error)) }
    }
  }
  static func compose(_ pages: [Data], options: [String: Any]) throws -> Data {
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
      context.saveGState()
      let target = CGRect(x: margin, y: height - margin - headerSpace - source.height * scale, width: width - margin * 2, height: source.height * scale)
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
