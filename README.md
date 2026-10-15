# Open Typora

本地 Markdown 编辑器，macOS 发布版采用 AppKit/WebKit，正文直接编辑并保留 Markdown 源码与撤销历史。

当前版本 **0.5.0**。支持其他文本编码的打开、无损转换与恢复，未命名草稿图片，以及复杂文档导出/重新导入；继续保留文件管理、搜索、表格、图片、公式、图表和主题功能。[对齐清单与边界](docs/feature-parity.md)。安装流程只保留当前应用版本；M 图标保持不变。

## 使用

- 直接在排版后的正文输入；光标进入粗体、链接等行内格式时展开对应符号。
- Enter 创建段落或继续列表，Shift-Enter 换行；表格单元格可以直接输入和用 Tab 导航。
- 键入代码围栏或 `$$` 后回车进入局部编辑器。⌘/ 切换完整源码，正文与代码块共用历史；源码模式独立撤销，返回正文时作为一次事务提交。
- 文件树右键可新建、复制、重命名、移动或移到废纸篓，文件夹支持拖动移动和方向键导航；文件操作可撤销。⌘⇧F 搜索文件夹内容，⌘⇧O 快速打开，最近文件/置顶文件夹可跨重启使用。
- 图片右键打开编辑面板，可改路径、尺寸、移动、复制、下载或通过 PicGo Server 上传；YAML 支持 `typora-copy-images-to`、`typora-root-url`，偏好可设置复制目录和路径格式。
- 点击底部编码或“文件 → 文本编码”，重新打开或转换保存 UTF-8、UTF-16 LE/BE、GB18030、GBK/GB2312、Big5、Shift JIS、Windows-1252；保留 BOM 与换行，不可表示的字符会阻止保存。
- PDF 支持 A4/Letter、页边距、页眉页脚变量和按行/表格行分页。复杂 Word/ODT/RTF/EPUB 使用 Pandoc；图表与图片会内嵌，公式保留目标格式可支持的结构。没有 Pandoc 时只提供系统 Word/RTF/ODT 基础转换。
- 偏好中可安装本地 CSS 主题，主题字体/图片会一并内嵌保存。
- ⌘F 查找替换，⌘S 保存，⌘N/⌘O 原生菜单创建或打开独立窗口。
- 已有文件停止输入 1.2 秒后自动保存；草稿先选择保存位置。外部修改触发冲突并保留草稿。
- 支持任务列表、代码高亮、MathJax 4 SVG、Mermaid、粘贴/拖入图片、大纲、主题、专注模式与 PDF。
- ⌘1–6 设置标题，⌘0 恢复段落；引用、列表、任务、缩进、表格行列增删/移动共用文档事务和撤销。菜单和键盘使用同一份命令定义。
- 支持正文目录、脚注、YAML 前言、高亮、上下标、Emoji、下划线与注释；偏好设置可以调整字体、缩进、拼写检查、自动配对和扩展。
- F8 淡化非活动正文，F9 将输入位置保持在窗口中部；⌘⇧O 快速打开，⌘⌃3 显示文件树。
- ⌘T 创建原生标签页，⌘⇧T 重新打开关闭的文件；会话恢复保留标签组。可导出带内嵌字体和本地图片的独立 HTML。

保留 0.1.1 按本机 Typora GitHub 主题观察实现的 Open Sans、正文/标题尺寸、灰白侧栏与底部小图标入口。界面基准见 [design/spec.md](design/spec.md)。

## 构建与安装

macOS 14+ arm64，Node.js 22.12+，npm 和 Xcode Command Line Tools（Swift）；此次验证使用 Node 26.7 和 Swift 6.2。

```sh
npm ci
npm test
npm run test:native
npm run test:webkit
npm run test:desktop
npm run test:kernel-desktop
npm run test:features
npm run test:alignment
npm run test:encoding
npm run package:mac
npm run install:app
```

原生包输出到 `release/native/Open Typora.app`；打包只保留最新版本归档。安装脚本以临时回滚副本替换 `~/Applications/Open Typora.app`，签名验证成功后移除旧应用；失败则恢复原应用，不累积历史安装备份，也不改动 Application Support 文档数据。安装前应正常退出旧应用。`npm run package:preview` 使用独立应用标识和 `Open Typora Preview` 数据目录，仅用于需要隔离数据的验收。

`npm run dev:app` 与 `npm start` 使用 Electron 开发/回归宿主；`npm run dev` 是浏览器预览，其保存会下载文件。它们不代表 macOS 原生包已经通过窗口验收。

## 实现与研究

[架构](docs/architecture.md)说明原生桥、文档树、DOM 正文、源码/代码块视图与事务层。[REA 研究](docs/research.md)和[来源元数据](docs/rea-provenance.json)保留官方静态证据、运行观察与 unknown。

[0.2.0 验收记录](docs/verification.md)区分自动化检查、官方行为观察与安装版真窗口结果。

[功能对齐清单](docs/feature-parity.md)记录当前版本的实现范围、验证方式和剩余差异；它是后续功能工作的依据。

实现使用独立代码及开源依赖，没有包含 Typora 的代码或素材。已按确认的架构分层重做，尚不能宣称内部实现或全部交互与官方完全一致。

## 当前边界

- macOS arm64 是当前发布目标；Windows/Linux 没有发布验收，应用仍为 ad hoc 签名，未做 Apple 公证。
- 输入法组合、模式切换、外部修改与无损编码保存有回归检查；真实搜狗中文上屏仍需完成当前人工配合步骤。合成 composition 事件不算真实输入法验收。
- 20 MB 文件上限；超过 300,000 字符使用源码模式。未带 BOM 的传统编码不能可靠自动识别，需要手动选择。
- 本地图片支持相对/绝对路径与 YAML 根目录；另存到其他目录不自动搬移已有相对图片。草稿图片保存在应用数据中，导出时嵌入。
- 此机已安装 Pandoc 3.12.1。其他机器需按[官方说明](https://pandoc.org/installing.html)安装或在偏好里指定路径。复杂样本覆盖中文、标题、嵌套列表、表格、脚注、公式、图片与 Mermaid，不能据此承诺任意文档无损转换。RTF 的 WMF/EMF 图片或脚注内图片会明确拒绝，建议先转 DOCX。
- LaTeX/RST/MediaWiki/Textile 的图片放在同名 `.assets` 文件夹，移动时需一起保留。OPML 主要承载大纲；Reveal.js 播放依赖其网页运行库。
- HTML/媒体为清理后的预览，脚本不会执行；第三方图床需配置并另做真实上传。第三方主题选择器和所有扩展组合尚未穷尽。
- 内核为独立的源码块树与快照事务，不能宣称与 Typora 的内部实现或完整功能完全一致。

项目采用 MIT；Open Sans 保留 OFL，MathJax 与字体保留 Apache-2.0 声明。
