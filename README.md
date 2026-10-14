# Open Typora

本地 Markdown 编辑器。0.2.0 重构了 macOS 宿主和正文内核：原生 AppKit/WebKit 窗口、直接编辑排版正文、独立源码视图，以及文档模型、光标书签和分模式撤销历史。

## 使用

- 直接在排版后的正文输入；光标进入粗体、链接等行内格式时展开对应符号。
- Enter 创建段落或继续列表，Shift-Enter 换行；表格单元格可以直接输入和用 Tab 导航。
- 键入代码围栏或 `$$` 后回车进入局部编辑器。⌘/ 切换完整源码，正文与代码块共用历史；源码模式独立撤销，返回正文时作为一次事务提交。
- ⌘F 查找替换，⌘S 保存，⌘N/⌘O 原生菜单创建或打开独立窗口。
- 已有文件停止输入 1.2 秒后自动保存；草稿先选择保存位置。外部修改触发冲突并保留草稿。
- 支持任务列表、代码高亮、MathJax 4 SVG、Mermaid、粘贴/拖入图片、大纲、主题、专注模式与 PDF。

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
npm run package:mac
npm run install:app
```

原生包输出到 `release/native/Open Typora.app`；安装脚本备份现有应用后替换 `~/Applications/Open Typora.app`，不改动 Application Support 文档数据。安装前应正常退出旧应用。`npm run package:preview` 使用独立应用标识和 `Open Typora Preview` 数据目录。

`npm run dev:app` 与 `npm start` 使用 Electron 开发/回归宿主；`npm run dev` 是浏览器预览，其保存会下载文件。它们不代表 macOS 原生包已经通过窗口验收。

## 实现与研究

[架构](docs/architecture.md)说明原生桥、文档树、DOM 正文、源码/代码块视图与事务层。[REA 研究](docs/research.md)和[来源元数据](docs/rea-provenance.json)保留官方静态证据、运行观察与 unknown。

[0.2.0 验收记录](docs/verification.md)区分自动化检查、官方行为观察与安装版真窗口结果。

实现使用独立代码及开源依赖，没有包含 Typora 的代码或素材。已按确认的架构分层重做，尚不能宣称内部实现或全部交互与官方完全一致。

## 当前边界

- macOS arm64 是当前构建目标；Windows/Linux 没有原生发布验收。
- 实体中文输入法、复杂跨块选区、全部快捷键和官方完整编辑行为仍需逐项对照。
- 20 MB 文件上限；超过 300,000 字符使用源码模式，正文解析仍有优化空间。
- 本地图片限文档目录及子目录；远程图片默认显示引用。另存到其他目录不自动搬移相对路径图片。
- 原始 HTML 作为文字；支持 UTF-8、BOM、LF/CRLF，不支持其他编码。
- 源码保留规则、块解析器、快照式历史与官方内部节点/命令实现有差异。
- 本机构建为 ad hoc 签名开发版，没有完成 Apple 公证。

项目采用 MIT；Open Sans 保留 OFL，MathJax 与字体保留 Apache-2.0 声明。
