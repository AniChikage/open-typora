# Typora 与 REA 研究边界

2026-10-14，本机 Typora 1.14.10 的安装位置是 `/Applications/Typora.app`。静态检查发现 TypeMark JavaScript/HTML/CSS 资源以及原生程序对 WebKit 的链接。这些事实描述打包结构，并不证明编辑流程实际执行了某条调用。

使用 npm 发布的 REA 6.4.0 对两份局部资源的副本进行惰性静态分析（frame.js 和 content.html），没有执行 Typora 的 bundle，也没有修改安装包。分析参数为 768 MiB worker heap、45 秒单源超时。该发布版不支持当前 main 文档中的 source-path 参数，因此输入是明确的局部副本目录。

结果 Evidence ID：`ev_0e32e3f54d2975af70b884d79ed5cd5c85c45569bab6d94bef14e861c4e9ffc5`。

- 2 个相关文件、1 个已解析 JavaScript、495051 个已访问 AST 节点、1174 个 findings。
- 图覆盖不完整；frame.js 的语义阶段耗尽 worker heap。
- 结果是派生静态证据，不能据此宣称完整还原编辑内核或证明运行调用。
- REA 已完成的提取与限制都保存在本次本地 QA 输出中，未把第三方源码或大体积 Evidence 放进项目。

实现选择：使用公开的 Markdown 标准、可观察交互、原创示例和开源组件，自行编写应用。Markdown 原文作为唯一内容数据；渲染层不反向序列化富文本树。这保证切换显示模式不会重写源文件，但初版活动块显示原文，与 Typora 的交互并不完全相同。

来源：[REA JavaScript 分析](https://github.com/morluto/rea/blob/main/docs/javascript-artifact-reconstruction.md)、[Typora 功能](https://typora.io/)、[CodeMirror](https://codemirror.net/)。
