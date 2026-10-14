# 0.2.0 验收记录

2026-10-14，在本机 macOS arm64 检查。研究基准为安装的 Typora 1.14.10。证据附件根目录为本次 Codex 本地附件 `open-typora/architecture-rebuild`；用户会话备份和官方分析原始片段只保存在项目之外。

| 检查 | 结果 | 证据与范围 |
| --- | --- | --- |
| 构建与类型检查 | pass | `build-results.txt`；Vite 对大型离线依赖块发出体积提示 |
| 文档内核与开发宿主文件层 | 32 pass | `unit-tests.txt`；包括合成组合输入、无损序列化、选区、历史、任务和表格 |
| Swift 文件存储 | 11 pass | `native-tests.txt`；真实临时文件、编码、原子写入、冲突、恢复与图片授权 |
| 隔离 WebKit | 14 pass | `webkit-results.txt`；同一宿主/桥/前端，另检查生成 PDF 有效且为 A4，以及精确保存字节 |
| Chromium 编辑器回归 | 9 pass | `desktop/kernel-desktop-results.json`；真实键盘输入代码/公式、嵌套代码、源码隔离、查找、快捷键优先级 |
| Electron 开发宿主 | 13 pass | `desktop-results.txt`；打开、输入、撤销、图片、图表、导出、外部冲突及恢复，不作为原生窗口证据 |
| 原生预览窗口关闭 | pass | `native-close-confirm.png`、`native-close-save.md`；取消保留内容，保存写盘后关闭，不保存移除自有测试草稿并标记会话关闭 |
| 已安装应用 | pass | `installed-verification.json`；版本 0.2.0，原生 Mach-O 链接 AppKit/WebKit，签名验证通过 |
| 原有数据保留 | pass | 升级前备份会话；三份原有文件 SHA-256 与文档 content/savedContent 均保持一致 |
| 安装版真实正文输入 | pass | 在自有 fixture 粗体内输入 ASCII 字符，确认自动保存后 Markdown 仍含正确 `**`；撤销并还原 fixture |
| 安装版模式与恢复 | pass | 源码新会话撤销/重做菜单禁用；⌘/ 双向切换不注释正文，切回后继续键入；正常退出重启恢复窗口和内容 |
| 安装版真实 PDF | pass | `installed-native-v020.pdf`、`installed-pdf-page.png`；系统保存面板输出一页 A4，PDFKit 渲染核对正文/任务/表格/代码/公式，编辑器继续响应 |

官方真窗口只直接确认了粗体光标展开/编辑、列表 Enter、刚进入源码的空历史等子集。原始自有 fixture 在观察后恢复并关闭；官方用户草稿未改动。REA 静态覆盖有 partial/unknown，不能把自动化通过解释成全部官方行为一致。

真窗口验收发现并修复了源码 CodeMirror 的 ⌘/ 注释快捷键抢占模式切换，以及同步原生打印异常分页/阻塞的问题。当前使用优先的模式快捷键处理与独立异步 WebKit PDF 导出。截图 `installed-native-v020.png` 来自安装路径中的真实应用，不是浏览器预览。

仍未完成：实体中文输入法候选窗与跨块组合输入、全部复杂选区/表格/TeX/HTML/脚注行为、全部快捷键和长文分页与官方逐项对照。独立解析器、块树和快照事务不是官方内部实现的复制。本机构建采用 ad hoc 签名，未完成 Apple 公证。
