<p align="center">
  <img src="design/icon.svg" alt="Open Typora" width="88" height="88">
</p>

<h1 align="center">Open Typora</h1>

<p align="center">直接在正文中写 Markdown，让文件始终属于你。</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文<br>
  <a href="https://open-typora.comicyueyu.chatgpt.site">在线试玩</a> · <a href="https://github.com/AniChikage/open-typora/releases/latest">下载安装包</a> · <a href="#功能">功能</a> · <a href="CONTRIBUTING.md">参与贡献</a> · <a href="LICENSE">MIT 许可证</a>
</p>

![Open Typora 产品展示：macOS 原生窗口中的 Markdown 编辑界面](docs/images/hero.png)

Open Typora 是一款开源 Markdown 编辑器，受 Typora 的行内编辑体验启发。直接修改排版后的正文，需要时切换源码，文档以普通 `.md` 文件保存在自己的文件夹中。

**项目状态：**当前为早期开发版本 **0.5.2**，发布目标为 **macOS 14+、Apple Silicon** 和 **Windows 10/11 x64**，界面目前为简体中文。本项目独立实现，与 Typora 无隶属关系；功能和交互仍在持续完善。

## 功能

- **即时渲染编辑**：标题、行内格式、列表、任务、表格、链接、脚注和 YAML 前言；代码与公式支持局部编辑，也可切换完整源码。
- **专注写作**：大纲导航、专注和打字机模式、字数统计、查找替换，以及本地 CSS 主题。
- **本地文件管理**：文件树、全文搜索、快速打开、最近文件、自动保存、会话恢复和外部修改冲突检测。
- **图片、公式与图表**：本地图片与粘贴插图、路径和尺寸设置、离线 MathJax、Mermaid；可选配置 PicGo Server 上传图片。
- **多种文本编码**：UTF-8、UTF-16 LE/BE、GB18030、GBK、Big5、Shift JIS 和 Windows-1252；保留 BOM 与换行，阻止会丢失字符的保存。
- **导入与导出**：内置 HTML、PDF 导出；通过 [Pandoc](https://pandoc.org/) 支持 DOCX、ODT、RTF、EPUB 等格式。

具体覆盖范围与已知差异见[功能清单](docs/feature-parity.md)。

[观看实际编辑演示](docs/images/editing-demo.gif) · [阅读项目介绍与操作过程](docs/introducing-open-typora.zh-CN.md)

试用中遇到问题，可以[报告问题](https://github.com/AniChikage/open-typora/issues/new?template=bug_report.yml)或[提出功能建议](https://github.com/AniChikage/open-typora/issues/new?template=feature_request.yml)。请附上系统、应用版本和最小复现示例。

## 开始使用

### 免安装试玩

**[打开网页试玩](https://open-typora.comicyueyu.chatgpt.site)**，直接编辑示例、切换正文与源码、打开 UTF-8 Markdown 文件，并下载修改结果。试玩与桌面版复用同一套编辑内核。

文档只保留在当前标签页内存中，不上传或持久保存内容；刷新会清空修改，请先下载保留。试玩导入上限为 1 MB，阻止加载外部嵌入媒体。文件夹、自动恢复、其他编码和 PDF／HTML 导出请使用桌面版。

### 下载

| 平台 | 安装包 | 其他方式 |
| --- | --- | --- |
| Windows 10/11 · x64 | **[下载 Setup.exe](https://github.com/AniChikage/open-typora/releases/download/v0.5.2/Open-Typora-0.5.2-windows-x64-Setup.exe)** | [ZIP](https://github.com/AniChikage/open-typora/releases/download/v0.5.2/Open-Typora-0.5.2-windows-x64.zip) |
| macOS 14+ · Apple Silicon | **[下载 DMG](https://github.com/AniChikage/open-typora/releases/download/v0.5.2/Open-Typora-0.5.2-arm64.dmg)** | [ZIP](https://github.com/AniChikage/open-typora/releases/download/v0.5.2/Open-Typora-0.5.2-arm64.zip) |

[SHA-256 校验文件](https://github.com/AniChikage/open-typora/releases/download/v0.5.2/SHA256SUMS.txt) · [所有版本](https://github.com/AniChikage/open-typora/releases)

### 安装 Windows 版

运行 **Setup.exe**，选择安装位置后，从开始菜单启动 Open Typora。安装程序同时提供桌面快捷方式和 Markdown 文件关联。更新使用同一应用目录，卸载保留恢复数据。

Windows 版目前**没有代码签名证书**，系统可能显示未知发布者或 SmartScreen 提示。请从本仓库的 Releases 页面下载，必要时比对校验文件。

### 安装 macOS 版

1. 从 [Releases](https://github.com/AniChikage/open-typora/releases/latest) 下载 **[Open-Typora-0.5.2-arm64.dmg](https://github.com/AniChikage/open-typora/releases/download/v0.5.2/Open-Typora-0.5.2-arm64.dmg)**。
2. 打开 DMG，把 **Open Typora** 拖入 **Applications（应用程序）**。
3. 从应用程序中启动 Open Typora。

需要 **macOS 14 或更高版本、Apple Silicon 芯片**。Release 同时提供 ZIP 和 SHA-256 校验文件；使用应用不需要安装 Node.js、Xcode 或 Typora。

应用采用本地签名，**尚未经过 Apple 公证**。macOS 可能要求在 **系统设置 → 隐私与安全性** 中批准打开，具体操作见 [Apple 官方说明](https://support.apple.com/zh-cn/102445)。请勿为安装而关闭 Gatekeeper。

### 从源码构建

两个平台均需 **Node.js 26** 和 npm。macOS 还需 **Xcode Command Line Tools**（`xcode-select --install`），无需安装 Typora。

```sh
git clone https://github.com/AniChikage/open-typora.git
cd open-typora
npm ci
npm run package:mac
```

打开 `release/native/Open Typora.app`，或安装到 `~/Applications`：

```sh
node scripts/install.mjs
```

替换前请先退出正在运行的 Open Typora。安装器保留应用数据，验证新应用后删除旧应用；构建同时在 `release/native/` 生成 ZIP 包；`npm run package:release` 另外生成 DMG 和校验文件。

在 Windows x64 上完成同样的克隆和依赖安装后，执行：

```sh
npm run package:win
```

安装 EXE 和 ZIP 输出至 `release/windows/`。Windows 发布包需在 Windows x64 上构建；Intel Mac、Windows ARM 和 Linux 暂无经过验收的发布构建。

需要额外文档格式时，请安装 [Pandoc](https://pandoc.org/installing.html)。若未自动识别，可在偏好设置中指定可执行文件。Markdown 写作与 HTML/PDF 导出不依赖 Pandoc。

### 基本操作

打开 Markdown 文件或文件夹，也可以试用[示例文档](examples/welcome.md)。点击正文开始编辑；Enter 继续列表或创建段落，Tab 在表格单元格间移动。

| 操作 | macOS | Windows |
| --- | --- | --- |
| 新建文档 | `⌘N` | `Ctrl+N` |
| 打开文件 | `⌘O` | `Ctrl+O` |
| 保存 | `⌘S` | `Ctrl+S` |
| 切换源码 | `⌘/` | `Ctrl+/` |
| 文档内查找 | `⌘F` | `Ctrl+F` |
| 搜索文件夹 | `⌘⇧F` | `Ctrl+Shift+F` |
| 快速打开 | `⌘⇧O` | `Ctrl+Shift+O` |

## 开发

```sh
npm ci
npm run dev:app
```

运行 `npm run dev:demo` 开发独立网页试玩，`npm run build:demo` 将静态站点输出到 `dist-demo/`。入口在 `src/demo/`，独立内容安全策略位于 `web/index.html`。

Windows 发布应用和开发宿主采用 **Electron/Chromium**；macOS 发布应用采用 **Swift/AppKit + WKWebView**。二者共用 TypeScript/React 界面及独立实现的编辑模型。

```sh
npm test                  # 编辑内核与文件层单元测试
npm run build             # 类型检查与前端生产构建
npm run test:native       # macOS 文件系统测试
npm run test:webkit       # 原生 WebKit 集成测试，需要 Pandoc
```

其他桌面测试、数据隔离与构建说明见[贡献指南](CONTRIBUTING.md)；文档模型、撤销历史和原生桥见[架构文档](docs/architecture.md)。

## 当前限制

- 文件上限为 20 MB；超过 300,000 字符的文档进入源码模式。
- 没有 BOM 的传统编码需要手动选择。
- 正文和源码具有独立撤销历史；返回正文时，源码修改合并为一次事务。
- 格式转换可能改变排版或不支持的文档结构；部分 RTF 图片格式会明确拒绝。导入时请保留原文件。
- Windows 暂不支持旧 DOC/RTF 导入及图片批量文件操作；Windows 输入法候选交互仍需人工验收，自动输入文本不能替代该检查。
- 第三方主题、嵌入媒体、输入法和图床服务存在兼容性差异，具体工作流请先查阅[功能清单](docs/feature-parity.md)。

## 参与贡献

欢迎提交可复现的问题、范围明确的修复、文档和兼容性样本。请先阅读[贡献指南](CONTRIBUTING.md)，再提交 [Issue](https://github.com/AniChikage/open-typora/issues) 或 Pull Request。

## 许可证

项目采用 [MIT 许可证](LICENSE)。第三方依赖保留各自许可证，应用包内包含相关声明；Open Sans 使用 OFL，MathJax 及其打包字体使用 Apache-2.0。
