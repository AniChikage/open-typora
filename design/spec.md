# Open Typora 设计规范

参考 editor-concept.png，完整编辑器主屏，1536×1024。

- 52px 标题栏、232px 侧栏、28px 状态栏。
- 纸张 #FFFFFF；侧栏 #F7F7F5；文字 #252A28；线条 #E7E8E5；强调色 #2F6D62。
- 界面系统无衬线字体 13px；正文 Songti SC / Noto Serif SC / serif。
- 文件与大纲共用侧栏；文件名顶部中间；即时渲染、源码、保存、更多位于右侧。
- 默认中文；完整工作界面，不加入营销页或装饰卡片。
- 首屏文案：让文字，回到文字。 / 从第一行开始 / 写作，不必分心。
- Lucide 线性图标；底部包含主题、保存状态、字数、Markdown、UTF-8。
- 所需新建、打开文件、查找、聚焦和导出操作放在更多菜单及原生菜单。
- Markdown 原文是唯一内容数据。即时渲染只改变显示，活动块显示可编辑原文。
- 窄窗口可折叠侧栏，正文保持可读边距。

UI/UX Pro Max 的两次搜索均返回落地页布局，未采用其页面结构。使用其最简风格、键盘和对比度建议，并以本项目编辑器概念图确定结构与配色。

## 概念生成

使用内置 Image Gen，生成完整桌面屏幕参考。最终提示词包含：

> Create one complete high fidelity desktop application screenshot concept, landscape 1440x960, for Open Typora, an open source local Markdown writing app. Full primary screen edge to edge, not a presentation board or laptop photo. macOS traffic lights upper left. Native minimal titlebar; centered filename 欢迎.md; left sidebar with 文件 / 大纲, 打开文件夹 and three sample documents. Main white writing canvas, Chinese Songti serif document, system sans UI chrome, restrained teal #2F6D62. Header right 即时渲染 / 源码, 保存, more menu. Document title 让文字，回到文字。 Sections 从第一行开始 / 写作，不必分心, prose, three Markdown bullets, blockquote and two-column shortcut table. Bottom save status and word count / Markdown / UTF-8. Sidebar #F7F7F5, paper #FFFFFF, ink #252A28, border #E7E8E5. No marketing hero, badges, illustrations, cards, gradients or shadows. All text, controls and icons code-native. Restrained, editorial, precise layout.

实际实现保留文档结构、白色纸张、衬线正文、青绿色选中态、顶部模式切换和底部状态栏。为真实文件工作流添加了文件夹名称、新建、刷新与关闭控件。侧栏使用规范指定的 232px，正文密度根据真实编辑器的段落与行高调整。
