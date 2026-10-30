<p align="center">
  <img src="design/icon.svg" alt="Open Typora" width="88" height="88">
</p>

<h1 align="center">Open Typora</h1>

<p align="center">直接在正文中写 Markdown，让文件始终属于你。</p>

<p align="center">
  <a href="README.md">English</a> · 简体中文<br>
  <a href="https://open-typora.comicyueyu.chatgpt.site">在线试玩</a> · <a href="https://github.com/AniChikage/open-typora/releases/latest">下载安装包</a> · <a href="#功能">功能</a> · <a href="#使用文档">使用文档</a> · <a href="CONTRIBUTING.md">参与贡献</a> · <a href="LICENSE">MIT 许可证</a>
</p>

> [!IMPORTANT]
> **Open Typora 是独立、非官方项目，与 Typora 官方无隶属关系，未经官方背书，也不是官方免费版。**
>
> **有能力的朋友，请优先[购买正版 Typora](https://store.typora.io/)，支持官方开发者。** 官方产品与支持请认准 **[typora.io](https://typora.io/)**。

![Open Typora 产品展示：macOS 原生窗口中的 Markdown 编辑界面](docs/images/hero.png)

Open Typora 是一款开源 Markdown 编辑器，受 Typora 的行内编辑体验启发。直接修改排版后的正文，需要时切换源码，文档以普通 `.md` 文件保存在自己的文件夹中。

**项目状态：**当前为早期开发版本 **0.21.0**，发布目标为 **macOS 14+、Apple Silicon**、**Windows 10/11 x64** 和 **Linux x64**，支持简体中文和英文界面，可在偏好设置中切换。本项目独立实现，与 Typora 无隶属关系；功能和交互仍在持续完善。

## 功能

- **可选 AI 编辑**：接入自定义 OpenAI 兼容 API、OpenRouter、LM Studio 或 Ollama，改写选区、逐项审阅差异，并作为一次修改应用与撤销；[配置、隐私与边界](docs/ai.zh-CN.md)。
- **参考资料与目录问答**：通过 `@文件` 添加上下文，本机检索后选择发送的片段，回答引用核对原文；插入 Markdown 脚注并支持一次撤销。[使用方式与限制](docs/workspace.zh-CN.md)。
- **版本历史**：跨重启查看本地快照，修改前手动留存，恢复旧版本时也保留当前内容，支持撤销。
- **即时渲染编辑**：标题、行内格式、列表、任务、表格、链接、脚注和 YAML 前言；代码与公式支持局部编辑，也可切换完整源码。
- **电子表格粘贴**：从 Excel/WPS 复制选区，在正文或源码中生成 Markdown 表格，保留空单元格、带引号的换行和一次撤销。见 [剪贴板说明](docs/clipboard.md)。
- **多标签与分屏**：重排和键盘切换文档标签，两篇文档左右／上下对照编辑，两侧独立使用源码或即时渲染模式；重启后恢复布局；标签页右键提供批量关闭、路径复制、重命名和分屏，正文与表格也可通过右键编辑。
- **编辑性能**：按首次查看初始化，输入时复用未改变的文档块；大文件保留所见即所得编辑，正文、代码块和大表格按视口渲染，使用增量解析、差量撤销和后台大纲统计；[查看实测与边界](docs/performance.md)。
- **专注写作**：大纲导航、专注和打字机模式、字数统计、查找替换，六套内置主题与本地 CSS 主题。
- **主题定制**：每套主题单独设置字体、行距、宽度与颜色，实时 CSS、打印专用 CSS 和主题导出；[使用说明](docs/themes.md)。
- **自定义背景**：选择本地图片，预览不透明度、模糊、显示方式和位置；重启后保留，正文与源码模式共用，导出不带个人背景。
- **社区插件**：内置六款已适配的 typora_plugin 原版插件，支持本地单文件及文件夹安装、相对 JS/JSON/CSS 模块、设置、快捷键和禁用清理；[查看兼容范围](docs/plugins.md)。
- **本地文件管理**：文件树、全文搜索、快速打开、最近文件、自动保存、会话恢复和外部修改冲突检测。
- **图片、公式与图表**：本地图片与粘贴插图、路径和尺寸设置、离线 MathJax、Mermaid 和 [sequence/flow 常用语法](docs/diagrams.md)；可选配置 PicGo Server 上传图片。
- **多种文本编码**：UTF-8、UTF-16 LE/BE、GB18030、GBK、Big5、Shift JIS 和 Windows-1252；保留 BOM 与换行，阻止会丢失字符的保存。
- **导入与导出**：内置 HTML、PDF 导出，支持手动分页、标题另起一页、续页表头与孤行控制；[分页说明](docs/printing.md)。通过 [Pandoc](https://pandoc.org/) 支持 DOCX、ODT、RTF、EPUB 等格式。
- **Windows Markdown 预览**：可选启用原生预览处理器，在 Everything 和资源管理器中预览，需要 Microsoft Edge WebView2 Runtime；[设置与限制](docs/windows-preview.md)。

具体覆盖范围与已知差异见[功能清单](docs/feature-parity.md)。

[观看实际编辑演示](docs/images/editing-demo.gif) · [阅读项目介绍与操作过程](docs/introducing-open-typora.zh-CN.md)

试用中遇到问题，可以[报告问题](https://github.com/AniChikage/open-typora/issues/new?template=bug_report.yml)或[提出功能建议](https://github.com/AniChikage/open-typora/issues/new?template=feature_request.yml)。请附上系统、应用版本和最小复现示例。

## 开始使用

### 免安装试玩

**[打开网页试玩](https://open-typora.comicyueyu.chatgpt.site)**，直接编辑示例、切换正文与源码、打开 UTF-8 Markdown 文件，并下载修改结果。试玩与桌面版复用同一套编辑内核。

文档只保留在当前标签页内存中，不上传或持久保存内容；刷新会清空修改，请先下载保留。试玩导入上限为 1 MB，阻止加载外部嵌入媒体。文件夹、自动恢复、其他编码、PDF／HTML 导出、插件与 AI 编辑请使用桌面版。试玩不接收模型密钥，也不请求模型服务。

### 下载

| 平台 | 安装包 | 其他方式 |
| --- | --- | --- |
| Windows 10/11 · x64 | **[下载 Setup.exe](https://github.com/AniChikage/open-typora/releases/download/v0.21.0/Open-Typora-0.21.0-windows-x64-Setup.exe)** | [ZIP](https://github.com/AniChikage/open-typora/releases/download/v0.21.0/Open-Typora-0.21.0-windows-x64.zip) |
| macOS 14+ · Apple Silicon | **[下载 DMG](https://github.com/AniChikage/open-typora/releases/download/v0.21.0/Open-Typora-0.21.0-arm64.dmg)** | [ZIP](https://github.com/AniChikage/open-typora/releases/download/v0.21.0/Open-Typora-0.21.0-arm64.zip) |
| Linux · x64 | **[下载 DEB](https://github.com/AniChikage/open-typora/releases/download/v0.21.0/Open-Typora-0.21.0-linux-x64.deb)** | [AppImage](https://github.com/AniChikage/open-typora/releases/download/v0.21.0/Open-Typora-0.21.0-linux-x64.AppImage) |

[SHA-256 校验文件](https://github.com/AniChikage/open-typora/releases/download/v0.21.0/SHA256SUMS.txt) · [所有版本](https://github.com/AniChikage/open-typora/releases)

### 安装 Linux 版

以 Ubuntu 22.04 x64 为验收基线，下载 DEB 后运行：

```sh
sudo apt install ./Open-Typora-0.21.0-linux-x64.deb
```

安装后可从桌面启动器打开，并关联 Markdown 文件。`sudo apt remove open-typora` 卸载保留文档和恢复数据。

其他兼容发行版可将 AppImage 设为可执行后运行。Ubuntu 22.04、24.04 的真实 FUSE 挂载、编辑与卸载纳入发布验收；Ubuntu 24.04 使用明确的应用级用户命名空间规则，系统全局限制保持开启。启动器保留 Chromium 沙箱，不再静默关闭。依赖与验收边界见 [AppImage 指南](docs/linux-appimage.md)。

Windows/Linux 的更多文档转换需安装 [Pandoc](https://pandoc.org/installing.html)；旧版 Pandoc 2.x 导入 ODT 也需 LibreOffice，以保留公式和表头；旧 DOC/RTF 导入还需安装 [LibreOffice](https://www.libreoffice.org/download/download-libreoffice/)，应用会从标准安装位置或 PATH 自动检测。三个平台均支持图片复制、移动、重命名、下载和废纸篓操作。

### 安装 Windows 版

运行 **Setup.exe**，选择安装位置后，从开始菜单启动 Open Typora。安装程序同时提供桌面快捷方式和 Markdown 文件关联。更新使用同一应用目录，卸载保留恢复数据。

需要 Everything／资源管理器预览时，在偏好设置启用 **系统 Markdown 预览**，再打开相应程序的预览窗格。关闭预览会恢复原来的处理器；详见[预览说明](docs/windows-preview.md)。

Windows 版目前**没有代码签名证书**，系统可能显示未知发布者或 SmartScreen 提示。请从本仓库的 Releases 页面下载，必要时比对校验文件。

### 安装 macOS 版

1. 从 [Releases](https://github.com/AniChikage/open-typora/releases/latest) 下载 **[Open-Typora-0.21.0-arm64.dmg](https://github.com/AniChikage/open-typora/releases/download/v0.21.0/Open-Typora-0.21.0-arm64.dmg)**。
2. 打开 DMG，把 **Open Typora** 拖入 **Applications（应用程序）**。
3. 从应用程序中启动 Open Typora。

需要 **macOS 14 或更高版本、Apple Silicon 芯片**。Release 同时提供 ZIP 和 SHA-256 校验文件；使用应用不需要安装 Node.js、Xcode 或 Typora。

应用采用本地签名，**尚未经过 Apple 公证**。macOS 可能要求在 **系统设置 → 隐私与安全性** 中批准打开，具体操作见 [Apple 官方说明](https://support.apple.com/zh-cn/102445)。请勿为安装而关闭 Gatekeeper。

### 从源码构建

所有平台均需 **Node.js 26** 和 npm。macOS 还需 **Xcode Command Line Tools**（`xcode-select --install`），无需安装 Typora。

```sh
git clone https://github.com/AniChikage/open-typora.git
cd open-typora
npm ci
npm run package:mac
```

打开 `release/native/Open Typora.app`，或安装到 `~/Applications`：

```sh
node scripts/install.mts
```

替换前请先退出正在运行的 Open Typora。安装器保留应用数据，验证新应用后删除旧应用；构建同时在 `release/native/` 生成 ZIP 包；`npm run package:release` 另外生成 DMG 和校验文件。

Windows x64 还需安装 **Visual Studio 2022 Build Tools**（选择 **使用 C++ 的桌面开发** 工作负载）和 **PowerShell 7**（`pwsh`）。构建会使用固定版本的 WebView2 SDK 编译原生预览处理器。完成同样的克隆和依赖安装后，执行：

```sh
npm run package:win
```

安装 EXE 和 ZIP 输出至 `release/windows/`。Windows 发布包需在 Windows x64 上构建；Intel Mac 和 Windows/Linux ARM 暂无经过验收的发布构建。

Linux x64 上运行 `npm run package:linux`，DEB 与 AppImage 输出至 `release/linux/`，由 Ubuntu 22.04 构建和验收。

需要额外文档格式时，请安装 [Pandoc](https://pandoc.org/installing.html)。若未自动识别，可在偏好设置中指定可执行文件。Markdown 写作与 HTML/PDF 导出不依赖 Pandoc。Windows/Linux 导入旧 DOC/RTF 还需 LibreOffice；嵌入图片提取至本机持久目录，转换可能改变原排版。

### 基本操作

打开 Markdown 文件或文件夹，也可以试用[示例文档](examples/welcome.md)。点击正文开始编辑；Enter 继续列表或创建段落，Tab 在表格单元格间移动。

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 新建文档 | `⌘N` | `Ctrl+N` |
| 打开文件 | `⌘O` | `Ctrl+O` |
| 保存 | `⌘S` | `Ctrl+S` |
| 撤销 / 重做 | `⌘Z` / `⌘⇧Z` | `Ctrl+Z` / `Ctrl+Shift+Z` |
| AI 改写选区 | `⌘⇧R` | `Ctrl+Shift+R` |
| 切换源码 | `⌘/` | `Ctrl+/` |
| 文档内查找 | `⌘F` | `Ctrl+F` |
| 搜索文件夹 | `⌘⇧F` | `Ctrl+Shift+F` |
| 快速打开 | `⌘⇧O` | `Ctrl+P` |
| 选词 / 删词 | `⌘D` / `⌘⇧D` | `Ctrl+D` / `Ctrl+Shift+D` |
| 选行 / 表格行 | `⌘L` | `Ctrl+L` |
| 格式范围 / 单元格 | `⌘E` | `Ctrl+E` |
| 跳回选区 | `⌘J` | `Ctrl+J` |

### 配置 AI 编辑（可选）

1. 打开 **编辑 → 模型设置…**，或 **偏好设置 → AI 改写 → 模型设置…**。
2. 自定义兼容 API、OpenRouter 或 LM Studio 选择 **OpenAI 兼容 API / LM Studio**；Ollama 选择 **Ollama 原生接口**。填写服务地址、准确的模型名称，以及服务要求的 API 密钥。本地模型服务需要自行启动。
3. 点击 **保存并测试连接**。测试只发送公开文本 `你好` 和固定测试要求，不发送当前文档；也可以只保存设置。
4. 选中文字，按 **⌘⇧R**／**Ctrl+Shift+R**，填写要求并点击 **生成改写**。逐项核对差异，再点击 **应用 … 处修改**。生成不会改动或保存文档，应用后可以一次撤销。采纳后侧栏保留，可以继续改写或读取新选区。

应用不附带模型或 API 订阅，只把选区、要求和固定的保留原意指令发送给你配置的服务。macOS 将记住的密钥明文保存在本机配置文件中，仅当前用户可读写；Windows/Linux 仍使用系统加密存储。也可以选择仅本次会话使用。地址示例、本地模型、密钥、报错和限制见 [AI 使用指南](docs/ai.zh-CN.md)。

## 开发

使用 Node.js 26（见 `.nvmrc`）。

```sh
npm ci
npm run dev:app
```

运行 `npm run dev:demo` 开发独立网页试玩，`npm run build:demo` 将静态站点输出到 `dist-demo/`。入口在 `src/demo/`，独立内容安全策略位于 `web/index.html`。

Windows/Linux 发布应用和开发宿主采用 **Electron/Chromium**；macOS 发布应用采用 **Swift/AppKit + WKWebView**。二者共用 TypeScript/React 界面及独立实现的编辑模型。自有编辑器、桌面桥、构建脚本和测试均采用 TypeScript，安装包运行编译后的 JavaScript；第三方插件保留原始 JavaScript 源码和许可证。

```sh
npm run typecheck         # 界面、桌面桥、脚本和测试的严格类型检查
npm test                  # 编辑内核与文件层单元测试
npm run build             # 类型检查与前端生产构建
npm run test:native       # macOS 文件系统测试
npm run test:webkit       # 原生 WebKit 集成测试，需要 Pandoc
npm run test:ai           # Electron AI 界面与本地 HTTP 夹具，不需 API 密钥
npm run test:ai-native    # macOS 模型传输与凭据测试
npm run test:ai-webkit    # 原生 WebKit AI 审阅与历史测试
```

其他桌面测试、数据隔离与构建说明见[贡献指南](CONTRIBUTING.md)；文档模型、撤销历史和原生桥见[架构文档](docs/architecture.md)。

## 使用文档

| 指南 | 内容 |
| --- | --- |
| [AI 编辑](docs/ai.zh-CN.md) | 自定义 API、本地模型、差异审阅和发送的数据 |
| [插件](docs/plugins.md) · [主题](docs/themes.md) | 插件接口、CSS、背景和兼容范围 |
| [电子表格粘贴](docs/clipboard.md) | Excel/WPS 表格、纯文本和剪贴板限制 |
| [编辑性能](docs/performance.md) | 大文件、代码块、表格和实测边界 |
| [打印分页](docs/printing.md) · [Windows 预览](docs/windows-preview.md) · [Linux AppImage](docs/linux-appimage.md) | 分页、Everything／资源管理器及 FUSE 配置 |
| [功能清单](docs/feature-parity.md) · [验收记录](docs/verification.md) | 已实现流程、问题回归和各版本测试范围 |
| [编辑架构](docs/architecture.md) · [贡献指南](CONTRIBUTING.md) | 编辑模型、原生宿主、开发和发布检查 |

## 当前限制

- Markdown 打开、保存和恢复已无固定 20 MiB 限制；大文档按视口渲染，大代码块和表格也采用局部视口。可用内存、初始解析和运行时字符串上限仍然适用，见[性能说明](docs/performance.md)。复杂转换和媒体另有资源预算。
- 没有 BOM 的传统编码需要手动选择。
- 正文和源码具有独立撤销历史；返回正文时，源码修改合并为一次事务。
- 格式转换可能改变排版或不支持的文档结构；部分 RTF 图片格式会明确拒绝。导入时请保留原文件。
- Windows/Linux 的旧 DOC/RTF 导入依赖 Pandoc 和 LibreOffice；嵌入的 WMF/EMF 图片需先转换为 PNG/JPEG。
- 0.20.0 的实体输入法实测覆盖 macOS 搜狗拼音，包括 AI 要求、正文各编辑位置及撤销重做；其他实体输入法与 Windows/Linux 候选窗仍需人工验收。自动化组合输入单独记录，见[版本化验收记录](docs/verification.md)。
- AI 需要自行配置模型服务，输出需要人工审阅；本版仅处理选区，未提供全文件夹代理、联网浏览或工具调用。Ollama 使用可控服务完成协议测试，真实模型验收使用自定义 API，未运行本地模型权重。
- 第三方主题、嵌入媒体、输入法和图床服务存在兼容性差异，具体工作流请先查阅[功能清单](docs/feature-parity.md)。

## 参与贡献

欢迎提交可复现的问题、范围明确的修复、文档和兼容性样本。请先阅读[贡献指南](CONTRIBUTING.md)，再提交 [Issue](https://github.com/AniChikage/open-typora/issues) 或 Pull Request。

## 许可证

项目采用 [MIT 许可证](LICENSE)。第三方依赖保留各自许可证，应用包内包含相关声明；Open Sans 使用 OFL，MathJax 及其打包字体使用 Apache-2.0。
