import AppKit
import CoreGraphics
import WebKit

final class PDFExporter: NSObject, WKNavigationDelegate {
  private let view: WKWebView
  private let window: NSWindow
  private var completion: ((Result<Data, Error>) -> Void)?
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
  func export(_ html: String, completion: @escaping (Result<Data, Error>) -> Void) {
    self.completion = completion
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
      return Math.ceil(root.getBoundingClientRect().height);
      """
    view.callAsyncJavaScript(measurement, arguments: [:], in: nil, in: .page) { result in
      do {
        guard let height = try result.get() as? Double, height > 0, height <= 769.89 * 2000 else {
          throw NativeFailure("文档大小超出 PDF 导出范围。")
        }
        #if WEBTEST
          print("PDF: measured height", height)
        #endif
        let settings = WKPDFConfiguration()
        settings.rect = CGRect(x: 0, y: 0, width: 523.28, height: height)
        self.view.createPDF(configuration: settings) { result in
          #if WEBTEST
            print("PDF: snapshot completed")
          #endif
          DispatchQueue.global(qos: .userInitiated).async {
            let output = Result { try Self.paginate(result.get()) }
            DispatchQueue.main.async { self.finish(output) }
          }
        }
      } catch { self.finish(.failure(error)) }
    }
  }
  static func paginate(_ data: Data) throws -> Data {
    guard let provider = CGDataProvider(data: data as CFData),
      let document = CGPDFDocument(provider), let page = document.page(at: 1)
    else { throw NativeFailure("WebKit 未生成有效 PDF。") }
    let source = page.getBoxRect(.mediaBox)
    let width = 595.28
    let height = 841.89
    let margin = 36.0
    let scale = (width - margin * 2) / source.width
    let contentHeight = source.height * scale
    let count = max(1, Int(ceil(contentHeight / (height - margin * 2))))
    guard count <= 2000 else { throw NativeFailure("导出页数超过支持范围。") }
    let output = NSMutableData()
    guard let consumer = CGDataConsumer(data: output),
      let context = CGContext(consumer: consumer, mediaBox: nil, nil)
    else { throw NativeFailure("无法创建 PDF。") }
    for index in 0..<count {
      context.beginPDFPage(
        [kCGPDFContextMediaBox as String: CGRect(x: 0, y: 0, width: width, height: height).data]
          as CFDictionary)
      context.saveGState()
      context.clip(
        to: CGRect(x: margin, y: margin, width: width - margin * 2, height: height - margin * 2))
      context.translateBy(
        x: margin, y: height - margin - contentHeight + Double(index) * (height - margin * 2))
      context.scaleBy(x: scale, y: scale)
      context.drawPDFPage(page)
      context.restoreGState()
      context.endPDFPage()
    }
    context.closePDF()
    return output as Data
  }
}
extension CGRect {
  fileprivate var data: Data {
    var rect = self
    return Data(bytes: &rect, count: MemoryLayout<CGRect>.size)
  }
}
