# Open Typora

本地 Markdown 编辑器。0.3.0 在原生 AppKit/WebKit 和直接编辑正文的内核上，继续补齐 Typora 的段落/格式命令、Markdown 扩展、表格操作、文件导航和导出。

当前版本为 0.3.1，更新了[应用图标](design/brand.md)，并让安装与打包流程只保留当前版本。

## 使用

- 直接在排版后的正文输入；光标进入粗体、链接等行内格式时展开对应符号。
- Enter 创建段落或继续列表，Shift-Enter 换行；表格单元格可以直接输入和用 Tab 导航。
- 键入代码围栏或 `$$` 后回车进入局部编辑器。⌘/ 切换完整源码，正文与代码块共用历史；源码模式独立撤销，返回正文时作为一次事务提交。
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
npm run package:mac
npm run install:app
```

原生包输出到 `release/native/Open Typora.app`；打包只保留最新版本归档。安装脚本以临时回滚副本替换 `~/Applications/Open Typora.app`，签名验证成功后移除旧应用；失败则恢复原应用，不累积历史安装备份，也不改动 Application Support 文档数据。安装前应正常退出旧应用。`npm run package:preview` 使用独立应用标识和 `Open Typora Preview` 数据目录，仅用于需要隔离数据的验收。

`npm run dev:app` 与 `npm start` 使用 Electron 开发/回归宿主；`npm run dev` 是浏览器预览，其保存会下载文件。它们不代表 macOS 原生包已经通过窗口验收。

## 实现与研究

[架构](docs/architecture.md)说明原生桥、文档树、DOM 正文、源码/代码块视图与事务层。[REA 研究](docs/research.md)和[来源元数据](docs/rea-provenance.json)保留官方静态证据、运行观察与 unknown。

[0.2.0 验收记录](docs/verification.md)区分自动化检查、官方行为观察与安装版真窗口结果。

[功能对齐清单](docs/feature-parity.md)记录 0.3.0 的实现范围、验证方式和剩余差异；它是后续功能工作的依据。

实现使用独立代码及开源依赖，没有包含 Typora 的代码或素材。已按确认的架构分层重做，尚不能宣称内部实现或全部交互与官方完全一致。

## 当前边界

- macOS arm64 是当前构建目标；Windows/Linux 没有原生发布验收。
- 实体中文输入法、复杂跨块选区、全部快捷键和官方完整编辑行为仍需逐项对照。
- 20 MB 文件上限；超过 300,000 字符使用源码模式，正文解析仍有优化空间。
- 本地图片限文档目录及子目录；远程图片默认显示引用。另存到其他目录不自动搬移相对路径图片。
- 仅渲染受限的行内 HTML；完整 HTML、媒体和警告块尚未实现。支持 UTF-8、BOM、LF/CRLF，不支持其他编码。
- 文件重命名/移动/删除、全局搜索、图片上传与缩放、Word/Pandoc 导入导出尚未对齐；长文 PDF 分页也需要继续完善。
- 源码保留规则、块解析器、快照式历史与官方内部节点/命令实现有差异。
- 本机构建为 ad hoc 签名开发版，没有完成 Apple 公证。

项目采用 MIT；Open Sans 保留 OFL，MathJax 与字体保留 Apache-2.0 声明。
