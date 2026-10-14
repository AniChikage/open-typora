# Typora、REA 与实现依据

研究对象是本机 `/Applications/Typora.app` 的 macOS 1.14.10 版本，研究日期为 2026-10-14。本项目独立编写实现，第三方资源只用于本机静态分析和行为观察，没有运行复制的官方脚本，没有将官方源码、主题、图标或字体打进应用。

## 静态证据与提取方法

REA 6.4.0 的 `inspect-macho` 确认官方可执行文件为原生 Mach-O，链接 AppKit/Cocoa/WebKit。Evidence ID 为 `ev_16723575aee3abb5f28ed572fbfc1a76e2fbdc4181f6a2f3f867f2640806ed9b`；Mach-O SHA-256 为 `71aebecaac7b21965c541113b6e0d9b792a095f44aa487a0a6366f224fcbb83a`。这确认原生宿主的打包和链接结构，不能证明某条编辑调用曾实际执行。

官方 TypeMark 的 `appsrc/main.js` SHA-256 为 `8e716a084097a976ab9ed8ea06d8f0b505f14a8dc0c022b3dc1a09a741225e16`。使用 Babel AST 提取 SystemJS 注册调用的原始 UTF-16 区间，得到 88 个 SystemJS 模块。初次宽匹配还识别到 4 个 Rangy `createModule` 调用，共 92 个候选；它们不应统称为 SystemJS 模块。REA 本次实际分析的九份核心片段可由项目脚本复现。

独立片段在原始调用后追加一个惰性的分号，以便作为独立 JS 文件解析。初次 manifest 的 `start/end` 是原始 CallExpression 的区间，其 `sha256` 是追加分号后的片段哈希；本次 [rea-provenance.json](rea-provenance.json) 补充了 `sourceSpanSHA256` 和 `appendedTerminator`，明确区分源区间与分析输入。复现脚本已核对九份片段的哈希与封存输入完全相同。

```sh
node scripts/extract-typora-modules.mjs \
  /Applications/Typora.app/Contents/Resources/TypeMark/appsrc/main.js \
  /tmp/typora-rea-excerpts
npx --yes rea-agents@6.4.0 analyze-javascript-application \
  /tmp/typora-rea-excerpts/modules/48 \
  --max-heap-mb 1024 --analysis-timeout-ms 60000 --format json
```

提取脚本不执行官方代码，并要求输出目录位于项目之外。研究结果、原始输入和截图保存在本次本地附件 `open-typora/architecture-rebuild` 中；项目只保存元数据与独立实现。

| 模块 ID | 静态识别的职责 | 对应独立实现 |
| --- | --- | --- |
| `10` | nodeMap、`toMark` 与 Markdown 序列化 | `MarkdownDocument` 的块节点、源间隔和序列化 |
| `13` | HTML 渲染 | `renderNode` 与 DOM 更新 |
| `18` | 文档/块节点解析 | markdown-it 与源位置映射 |
| `1a` | commandStack、撤销/重做与光标快照 | 正文事务历史和选区书签 |
| `31` | 选区、offset、书签和恢复 | DOM Range ↔ Markdown 位置映射 |
| `48` | 独立 CodeMirror 源码视图 | 单独挂载的源码编辑器 |
| `61` | 核心编辑器、输入事件、DOM/model 同步 | `RichEditor` 与原生桥 |
| `3f` | 查找 | 正文查找/替换面板 |
| `60` | 格式工具栏 | 格式命令与事务 |

封存文件中的 `input.js` 是 `3f` 的早期别名，实际职责是查找；`composition.js` 是 `60` 的早期别名，实际职责是格式工具栏。组合输入线索来自 `61`，不能仅按文件别名解释模块。

## REA 覆盖与限制

九份核心输入全部成功解析，访问 76,450 个 AST 节点，产生 401 个 findings。联合分析的 Evidence ID 为 `ev_89a665c483b8a2a0371ccadfa02190cf3de1fa9dde70fb8939fda359504dfc54`，语义图保留 28,666 个节点、32,074 条关系；其覆盖为 partial，受父进程结果预算约束。

对 node-map、parser、selection、source-view 以及 `3f` 别名输入分别重跑，五份独立分析均没有资源约束事件，Evidence ID 见 provenance 文件。没有资源约束不等于语义完整：动态调用、运行状态与跨模块关系仍存在 unknown，独立结果的 coverage 仍为 unknown。

对 `getMarkdown` 的静态函数体可以直接确认：源码模式读取 CodeMirror 内容，正文模式走 nodeMap 的 `toMark`。REA 的 trace Evidence `ev_fc3a3ade9abb5deca4ebf42d17f93a2544bf6464f4f87c10f8c12ada61a865d9` 只找到一个种子节点、没有遍历到关系且保留三个 unknown，不能作为完整调用链或运行执行证据。

早先 0.1.x 对 frame.js 的宽分析耗尽 worker heap，未还原核心。此次改用按模块划分的输入，解决了局部分析的资源问题；不据此宣称逆向还原了整个 Typora。

## 运行观察与独立验证

在官方应用中打开项目自有 fixture，观察到光标折叠在粗体内部时，仅该行内节点的 `**` 展开为灰色，其余段落继续排版；选中文字时的显示与折叠光标不同。`official-inline-caret.png` 保存该实屏证据。

独立实现的内核测试验证正文编辑、嵌套格式、Enter/Shift-Enter、列表、空任务、跨块选区、表格、组合输入事务、撤销与源码保留。组合输入采用合成事件，只证明事件处理和事务逻辑，不证明实体中文输入法候选窗表现。

原生 WebKit 测试在独立数据目录中加载同一套 Swift 宿主、资源协议、桥和前端，检查行内展开、源码历史隔离与正文历史恢复、未改动块的 DOM 身份、任务继续输入、离线 MathJax 宏/字体、本地图片协议及保存字节。它不显示或操纵用户窗口，不能替代安装后真窗口验收。

在官方窗口继续回放列表 Enter 与源码切换时，确认刚进入源码视图的撤销菜单为 disabled，正文历史不能在源码里直接撤销。此前独立实现的跨模式共享撤销与该观察不符，现已改为模式隔离，并在回到正文时提交一份源码事务。这是运行观察驱动的修正，不能仅从静态架构类推所有交互。

## 仍有差异和 unknown

本项目使用 source-backed 块节点树与保存原始间隔的序列化；官方节点类、内部增量解析和规范化规则没有全部还原。撤销使用有界的文档快照事务，官方存在自己的命令对象和 DOM 操作集合。表格命令与脚注在 0.3.0 已有独立实现，但复杂选区、全部 TeX 扩展、完整 HTML、跨块输入法、拖选/键盘边界和全部快捷键仍未获得逐项官方回放证据。

当前结论是：独立实现已按可确认的 macOS 原生宿主、DOM 正文、节点模型、选区/事务、独立源码和代码块的分层重构。不能声称内部代码或全部编辑行为与官方 100% 一致。

官方公开材料：[主题与 DOM 约定](https://theme.typora.io/doc/Write-Custom-Theme/)、[Markdown 交互说明](https://support.typora.io/Markdown-Reference/)、[REA 项目](https://github.com/morluto/rea)、[MathJax 本地托管](https://docs.mathjax.org/en/latest/web/hosting.html)。公开约定与本机静态/运行证据分别使用，不能互相替代。

PDF 导出使用 Apple 的 [WKPDFConfiguration](https://developer.apple.com/documentation/webkit/wkpdfconfiguration) 与异步 createPDF API，再独立分页。这是为修复本项目真窗口打印问题所作的实现选择，不是关于 Typora 官方 PDF 内部实现的结论。已在隔离 WebKit 验证有效 PDF、A4 页数与保存内容；长文分页的全部版面细节仍未与官方逐项对照。

0.2.0 已替换本机安装版，并在真窗口验证正文格式内输入、自动保存、源码模式的撤销菜单禁用、⌘/ 双向切换和重启恢复。实际导出的 PDF 经 PDFKit 检查为一页 A4，并渲染核对正文、表格、代码和公式。旧会话三份文件的字节哈希与编辑内容保留。预览版关闭流程的保存／取消／不保存也已逐项回放，见 [verification.md](verification.md)。

源码返回正文时合并为一次事务是本项目的设计选择；官方 hide 函数中可静态观察到 renderedHTML/syncChange、reloadContent 和 tryEnterBusyMode 等路径，其全部历史粒度仍有 unknown。刚进入源码的空历史已通过官方真窗口确认。

## 0.3.0 功能研究

再次用 REA 6.4.0 单独分析模块 `60`，Evidence ID 为 `ev_3cbe5b0d3d4fc3c5978597665c86a61d895c015f59608677d3754a4fe90162c3`。输入共 23,381 字节，解析一份 JS、访问 5,307 个 AST 节点，保留 2,817 个语义节点、2,279 条关系和 1,217 个 unknown；未截断，未报告省略节点/关系或 limits，但总体 coverage 仍为 unknown。这是静态格式工具线索，不是功能等价证明。根容器摘要哈希不同于单份模块哈希，模块源区间和片段哈希仍按 provenance 记录核对。

在官方用户窗口只读查看段落与格式菜单，确认标题、表格工具、列表/任务、脚注、目录、YAML、注释及图片工具入口；没有修改其中的用户草稿。功能优先级同时参考官方 [快捷键](https://support.typora.io/Shortcut-Keys/)、[文件管理](https://support.typora.io/File-Management/)、[专注/打字机](https://support.typora.io/Focus-and-Typewriter-Mode/) 和 [统计说明](https://support.typora.io/Word-Count/)。菜单存在、文档承诺、独立实现通过测试和官方行为一致是四种不同证据；当前 [功能清单](feature-parity.md) 保留这些边界。
