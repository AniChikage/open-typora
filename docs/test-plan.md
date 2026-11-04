# 现有功能测试清单

适用版本：已发布 **0.22.0**；审计基线 `ea04d3b`（应用代码与发布标签 `a013b6e` 相同，后续仅文档更新）。本分支修复查找替换的一个边界问题，并新增回归；**0.22.0 安装包尚未包含该修复**。

日期：2026-11-03。清单覆盖 24 个模块、152 条功能用例，附共享命令表中的全部 128 个菜单命令。每条列出操作、期望和执行入口；这是可维护的测试设计与执行索引，登记不等于已通过，更不代表所有平台、插件、文件与输入法组合已穷尽。

本机环境：macOS 26.5.2 / arm64、Node 26.7.0、Electron 44.7.2、实际 WKWebView；网页补测使用独立无头 Chrome 156、1280×900 和 400×850。Browser plugin not available，使用项目 Playwright 套件。Pandoc、LibreOffice 与 bundled pypdf 用于实际转换及 PDF 内容核验。桌面测试使用隔离资料，不发送用户文档或修改用户模型配置。

## 本轮发现与处理

| 编号 | 复现与结果 | 当前状态 |
| --- | --- | --- |
| BUG-001 | 正文正则查找 `alpha`，替换为 `$<name>`，原文 `alpha alpha` 被错误保存成一个空格。正则没有命名组时，这段应为字面替换文字 | 源码已修复；完整单元、Electron 全文/撤销重做及原生对应断言回归。0.22.0 公开安装包仍有此问题 |
| OBS-001 | 首轮完整原生回归在 32+ MiB 代码块编辑后，12 秒内未读到新的恢复内容；没有出现“错误内容”断言。独立诊断保留原时限和全文断言后通过，诊断中的一次持久写入约 0.19 秒；可见窗口对照和正常可见完整回归也通过，计时器探针 1200 ms 实际 1202 ms | 原生验收默认改为可见，隐藏模式仍显式可选；隐藏条件的触发时序未完全定位，不宣称修复了产品数据丢失。关注 PERF-02 |
| OBS-002 | 另一轮完整原生回归在 Spreadsheet-QA 的表格粘贴等待条件超时，正文为空；独立原生剪贴板及可见完整回归通过 | 隐藏宿主中的一次失败保留；不据此归咎于外部剪贴板或宣称产品无误。关注 CLP-02 |
| NOTE-001 | pypdf 6.10 对一个 Quartz 复杂 PDF 报告两个 offset=0 对象提示；strict 读取、Poppler 解析、内容与渲染均通过 | 作为解析器提示记录，未确认文件损坏；不算已修复 bug |

BUG-001 的最小复现、修复前后精确文件字节，以及 OBS 的原始日志保留在仓库外的本轮 QA 目录；公开文档不包含密钥、私有接口地址、用户原文或完整用户配置。

## 执行层次

- **日常回归**：构建、单元、编辑内核、保存恢复、编码、标签分屏、右键、剪贴板；改到 AI 时增加 AI、资料问答和批次流程。
- **发布回归**：完整桌面与原生套件、大文件、真实转换/PDF、插件和背景；Windows/Linux 安装载荷、系统预览、文件关联、AppImage 真实 FUSE 单独检查。
- **人工验收**：系统候选窗、真实 Office/WPS、指定用户插件、真实图床及完整桌面环境。自动化组合事件、HTTP 夹具和 Xvfb 不能代替这些结果。

P0：可能丢失/覆盖内容、错误目标或破坏保存恢复；P1：主要功能、互操作与可用性。P0 失败需保留样例、原始结果和失败阶段；复跑必须保留精确断言并说明环境变化。

## 可执行入口与本轮结果

先运行 `npm ci`、`npm run build`。设置 `OPEN_MARKDOWN_LANE_QA_DIR` 为仓库外的独立绝对目录，逐套运行以免多个剪贴板/窗口测试互相干扰；不同套件使用不同输出子目录。导入导出需 Pandoc，旧 DOC/RTF 路径还需 LibreOffice；PDF 文本检查需可导入 pypdf 的 Python，可用 `OPEN_MARKDOWN_LANE_PDF_PYTHON` 指定。原生套件需 macOS/Xcode Command Line Tools。

网页补测先运行 `npm run build:demo`，再运行 `npm run test:demo`。默认使用 Playwright 管理的 Chromium；已有 Chrome/Chromium 时可设置 `OPEN_MARKDOWN_LANE_BROWSER_EXECUTABLE`，使用全新的临时浏览器资料。套件不使用用户浏览器配置，不要求登录或模型密钥。

| 入口 ID | 命令 | 基线执行 | 修复分支复测 |
| --- | --- | --- | --- |
| `build` | `npm run build` | 通过 | 通过 |
| `unit` | `npm test` | 通过 | 通过 |
| `native-store` | `node scripts/test-native.mts` | 通过 | 未在该阶段重跑 |
| `native-ai-transport` | `node scripts/test-ai-native.mts` | 通过 | 未在该阶段重跑 |
| `kernel` | `node tests/kernel-desktop.mts` | 通过 | 未在该阶段重跑 |
| `desktop` | `node tests/desktop.mts` | 通过 | 未在该阶段重跑 |
| `features` | `node tests/features-desktop.mts` | 通过 | 未在该阶段重跑 |
| `alignment` | `node tests/alignment-desktop.mts` | 通过 | 通过 |
| `parity` | `node tests/parity-desktop.mts` | 通过 | 未在该阶段重跑 |
| `indentation` | `node tests/indentation-desktop.mts` | 通过 | 未在该阶段重跑 |
| `encoding` | `node tests/encoding-desktop.mts` | 通过 | 未在该阶段重跑 |
| `workspace` | `node tests/workspace-desktop.mts` | 通过 | 未在该阶段重跑 |
| `context-menu` | `node tests/context-menu-desktop.mts` | 通过 | 未在该阶段重跑 |
| `spreadsheet` | `node tests/spreadsheet-desktop.mts` | 通过 | 未在该阶段重跑 |
| `community-plugins` | `node tests/community-plugins-desktop.mts` | 通过 | 未在该阶段重跑 |
| `plugin-package` | `node tests/plugin-package-desktop.mts` | 通过 | 未在该阶段重跑 |
| `compatibility` | `node tests/compatibility-desktop.mts` | 通过 | 未在该阶段重跑 |
| `background` | `node tests/background-desktop.mts` | 通过 | 未在该阶段重跑 |
| `next` | `node tests/next-desktop.mts` | 通过 | 未在该阶段重跑 |
| `huge-blocks` | `node tests/huge-blocks-desktop.mts` | 通过 | 未在该阶段重跑 |
| `preview` | `node tests/preview-desktop.mts` | 通过 | 未在该阶段重跑 |
| `ime` | `node tests/ime-desktop.mts` | 通过 | 未在该阶段重跑 |
| `ai` | `node tests/ai-desktop.mts` | 通过 | 未在该阶段重跑 |
| `knowledge` | `node tests/knowledge-desktop.mts` | 通过 | 未在该阶段重跑 |
| `batch` | `node tests/batch-desktop.mts` | 通过 | 未在该阶段重跑 |
| `native-webkit` | `node scripts/test-webkit.mts` | 失败，保留记录；可见/隐藏条件及原始失败见 OBS-001/002 | 通过；可见/隐藏条件及原始失败见 OBS-001/002 |
| `native-clipboard` | `node scripts/test-webkit.mts --clipboard` | 通过 | 通过 |
| `native-ai-ui` | `node scripts/test-webkit.mts --ai` | 通过 | 通过 |
| `browser-demo` | `npm run build:demo` 后 `npm run test:demo` | 本轮新增，独立 Chrome 的 9 项检查通过 | 永久套件 9 项检查也通过 |

基线完整执行了 28 套入口：27 套通过、原生完整套件首次失败。修复分支重新检查构建、230 项单元测试及查找替换界面；原生完整套件在隐藏条件中出现过恢复/粘贴时限波动；改为可见窗口后，带原时限和精确断言的正常完整、剪贴板与 AI 界面套件通过。隐藏执行可用 `OPEN_MARKDOWN_LANE_TEST_HIDDEN=1` 显式开启，仍按 OBS 保留失败，不作为发布验收默认模式。Windows/Linux 与真实 FUSE 的当前公开安装包证据对应 [0.22.0 正式流程](https://github.com/AniChikage/open-markdown-lane/actions/runs/41639901120)，不是本轮在本机重新安装这些系统。真实模型沿用同日 0.22.0 的两宿主三次生成补测；本轮 AI 自动化使用自有 HTTP 夹具。

## 逐项用例

所有用例的公共前提：使用可公开的小样例或本地自建大样例，保留原始文件副本；修改后核对正文、保存字节及撤销重做。故障路径还要检查原文件、当前草稿和其他标签未被意外修改。入口列是已有自动化覆盖，不代表每条用例的全部平台和外部软件组合都已实测。

### FND 构建、宿主与资源

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| FND-01 · P0 | **严格编译与构建**<br>执行类型检查及正式前端构建 | 生产代码、桥、脚本和测试编译通过 | `build` | 自动覆盖，结果见入口表 |
| FND-02 · P0 | **编辑与文件单元测试**<br>运行完整单元套件，记录跳过原因 | 字节、选区、历史与权限断言通过 | `unit` | 自动覆盖，结果见入口表 |
| FND-03 · P1 | **宿主首次启动**<br>分别启动隔离 Electron 和 WKWebView | 非空正文、正确版本与资源，无运行错误 | `desktop`, `native-webkit` | 自动覆盖，结果见入口表 |

### DOC 文档、保存与恢复

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| DOC-01 · P0 | **新建与保存**<br>新建草稿，输入中文和 emoji，再保存 | 正文与磁盘相同，路径及保存状态准确 | `desktop`, `native-store` | 自动覆盖，结果见入口表 |
| DOC-02 · P0 | **自动保存**<br>连续编辑并等待保存，再重新打开 | 最后一次编辑不丢失，文件字节准确 | `desktop`, `kernel` | 自动覆盖，结果见入口表 |
| DOC-03 · P0 | **另存为及取消**<br>修改文件，取消另存，再另存新路径 | 取消保留原稿，新路径内容准确 | `context-menu`, `native-store` | 自动覆盖，结果见入口表 |
| DOC-04 · P0 | **关闭取消与批量关闭**<br>多份脏文档执行关闭，途中取消 | 整组标签与未保存内容保留 | `context-menu`, `workspace` | 自动覆盖，结果见入口表 |
| DOC-05 · P0 | **保存失败**<br>制造磁盘冲突、编码失败和写入失败 | 报错且保留草稿，不覆盖原文件 | `unit`, `native-store`, `encoding` | 自动覆盖，结果见入口表 |
| DOC-06 · P0 | **异常检查点恢复**<br>在保存已落盘但会话未更新时恢复 | 相同内容不误报冲突，不同内容保留冲突稿 | `unit`, `native-store`, `plugin-package` | 自动覆盖，结果见入口表 |
| DOC-07 · P0 | **重启恢复**<br>保存及未保存文档退出后重新启动 | 文档、活动标签和恢复数据准确 | `desktop`, `workspace`, `knowledge` | 自动覆盖，结果见入口表 |
| DOC-08 · P1 | **原生系统窗口操作**<br>实体鼠标拖动顶部、缩放、全屏与多窗口 | 窗口响应正确，文档与选择不丢 | `native-store` | 待人工/实际软件验收 |

### EDT 编辑内核与语法操作

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| EDT-01 · P0 | **普通输入与删除**<br>正文插入、选区替换、退格及 Delete | 仅目标范围变化，撤销恢复原文 | `unit`, `kernel` | 自动覆盖，结果见入口表 |
| EDT-02 · P0 | **跨块替换**<br>选择多个段落或列表后输入 | 边界与分隔正确，单步撤销恢复选区 | `unit`, `ime` | 自动覆盖，结果见入口表 |
| EDT-03 · P0 | **字素删除**<br>在中文、组合字符和 emoji 旁删除 | 不留下半个字素，撤销重做准确 | `unit`, `huge-blocks` | 自动覆盖，结果见入口表 |
| EDT-04 · P1 | **标题与段落**<br>切换六级标题、普通段落及升降级 | 块类型和两侧正文正确，操作可撤销 | `unit`, `features`, `native-webkit` | 自动覆盖，结果见入口表 |
| EDT-05 · P1 | **引用与嵌套列表**<br>续写、退出空项、多行缩进与反缩进 | 列表标记、引用前缀和选区保留 | `unit`, `parity`, `indentation` | 自动覆盖，结果见入口表 |
| EDT-06 · P1 | **任务列表**<br>点击和命令切换完成状态 | 只改对应任务，代码中的字面任务不变 | `unit`, `kernel` | 自动覆盖，结果见入口表 |
| EDT-07 · P1 | **行内样式**<br>应用粗斜体、下划线、删除线等及清除格式 | 嵌套标记平衡，选区外样式保留 | `unit`, `desktop`, `alignment` | 自动覆盖，结果见入口表 |
| EDT-08 · P1 | **代码与公式局部编辑**<br>进入局部编辑，输入、缩进，再返回正文 | 围栏及周围 Markdown 保留，历史独立 | `kernel`, `parity`, `native-webkit` | 自动覆盖，结果见入口表 |
| EDT-09 · P0 | **源码模式历史**<br>正文切源码，编辑并返回正文，撤销重做 | 源码内历史独立，返回正文合为一次事务 | `unit`, `kernel`, `parity` | 自动覆盖，结果见入口表 |
| EDT-10 · P1 | **选择与定位命令**<br>选词、选行、格式范围、跳回选区 | 中文、表格、源码与局部代码定位正确 | `unit`, `parity` | 自动覆盖，结果见入口表 |

### TBL 表格与网格

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| TBL-01 · P1 | **管道表头建表**<br>输入独立表头并回车 | 创建有效表格并定位首个正文单元格 | `unit`, `parity` | 自动覆盖，结果见入口表 |
| TBL-02 · P0 | **单元格文字与管道符**<br>输入中文、管道符与换行 | 内容留在原格，管道转义正确 | `unit`, `parity` | 自动覆盖，结果见入口表 |
| TBL-03 · P1 | **导航与新增行**<br>Tab 到末格，使用修改键 Enter、Shift-Enter | 导航、插行、格内换行各自正确 | `unit`, `parity` | 自动覆盖，结果见入口表 |
| TBL-04 · P1 | **行列结构操作**<br>右键插入、移动、删除行列并对齐 | 以点击位置为目标，每步可准确撤销 | `context-menu` | 自动覆盖，结果见入口表 |
| TBL-05 · P1 | **表头与整表删除**<br>右键表头及整表删除后撤销 | 禁止无效表头删除，整表可恢复 | `context-menu` | 自动覆盖，结果见入口表 |
| TBL-06 · P0 | **矩形粘贴与扩展**<br>粘贴含空格、引号、多行值的 TSV | 按矩形填充，必要时扩行列且不移位 | `unit`, `spreadsheet` | 自动覆盖，结果见入口表 |
| TBL-07 · P0 | **大型虚拟表格**<br>跳到八万行末尾，输入、增行并撤销 | 挂载单元格有界，完整源码不丢行 | `huge-blocks` | 自动覆盖，结果见入口表 |
| TBL-08 · P0 | **屏外行右键及粘贴**<br>滚到大表格中部或末尾操作 | 映射到正确源行列，其余行逐字不变 | `context-menu`, `spreadsheet` | 自动覆盖，结果见入口表 |

### IME 中文输入与组合状态

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| IME-01 · P0 | **正文列表表格组合提交**<br>以输入协议更新候选并提交中文 | 临时拼音不落盘，一次提交可单步撤销 | `ime`, `native-webkit` | 自动覆盖，结果见入口表 |
| IME-02 · P0 | **源码及代码组合输入**<br>组合输入期间切模式，再提交或取消 | 延后切换，提交保留，取消不清重做 | `ime`, `ai`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| IME-03 · P0 | **空段落与重复文字**<br>在空元素和重复中文跨段选区提交 | 无丢字或错位，中文 emoji 精确撤销 | `unit`, `ime`, `native-webkit` | 自动覆盖，结果见入口表 |
| IME-04 · P0 | **组合期间后台动作**<br>候选未提交时触发保存、刷新、插件及切标签 | 不覆盖标记文字，不抢选区，安全延后或拒绝 | `encoding`, `ime`, `workspace` | 自动覆盖，结果见入口表 |
| IME-05 · P0 | **AI 输入框候选保护**<br>候选期间按 Enter、Esc 与提交快捷键 | 不误发请求，不误关设置，不采纳过期结果 | `ai`, `batch`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| IME-06 · P0 | **macOS 实体搜狗**<br>正文、粗体、列表、表格、代码输入并撤销重做 | 候选正常，无残留拼音或丢字，保存准确 | `ime`, `native-ai-ui` | 待人工/实际软件验收 |
| IME-07 · P1 | **其他实体输入法**<br>苹果拼音、微软拼音及 Linux IBus/Fcitx 逐位置测试 | 分别记录输入法与桌面，不沿用合成事件结果 | — | 待人工/实际软件验收 |

### CLP 剪贴板与办公软件

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| CLP-01 · P0 | **HTML 与纯文本**<br>正文粘贴格式化段落、列表与表格 | 清理后转为可编辑 Markdown，一次撤销 | `unit`, `context-menu` | 自动覆盖，结果见入口表 |
| CLP-02 · P0 | **表格优先于截图**<br>同时提供 HTML、TSV 与 PNG | 采用真实网格，保留空单元格及多行值 | `spreadsheet`, `native-clipboard` | 自动覆盖，结果见入口表 |
| CLP-03 · P0 | **源码及纯文本粘贴**<br>源码普通粘贴、纯文本粘贴分别执行 | 普通粘贴转表格，纯文本保留字面 TSV | `spreadsheet`, `native-clipboard` | 自动覆盖，结果见入口表 |
| CLP-04 · P0 | **代码及异步粘贴**<br>代码围栏内粘贴，延迟期间修改选区 | 代码保留 TSV，迟到结果不能覆盖新输入 | `spreadsheet` | 自动覆盖，结果见入口表 |
| CLP-05 · P1 | **Excel 实体互操作**<br>从受支持 Office 版本复制真实选区 | 与剪贴板夹具分别记录来源、内容和撤销 | — | 待人工/实际软件验收 |
| CLP-06 · P1 | **WPS 实体互操作**<br>从受支持 WPS 版本复制真实选区 | 矩形、中文、空值、多行与撤销均实测 | — | 待人工/实际软件验收 |

### FLS 文件与文件夹

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| FLS-01 · P1 | **列表树及空目录**<br>打开含空目录、中文和空格文件名的目录 | 列表树完整，排序和键盘导航正确 | `features`, `alignment`, `native-store` | 自动覆盖，结果见入口表 |
| FLS-02 · P0 | **新建重命名移动**<br>创建文件夹、复制、重命名及拖动移动 | 路径与各窗口记录同步，文件字节保留 | `unit`, `alignment`, `native-store` | 自动覆盖，结果见入口表 |
| FLS-03 · P0 | **废纸篓与文件撤销**<br>移除文件后撤销文件操作 | 可恢复原位置，和正文撤销互不混用 | `unit`, `native-store` | 自动覆盖，结果见入口表 |
| FLS-04 · P1 | **最近与置顶**<br>置顶、移除、清除最近记录并重启 | 状态持久，清记录不删除原文件 | `unit`, `features`, `native-store` | 自动覆盖，结果见入口表 |
| FLS-05 · P0 | **授权与符号链接**<br>扫描后把条目替换为越界链接再打开 | 拒绝越界，不注册或泄露新文档 | `unit`, `native-store` | 自动覆盖，结果见入口表 |
| FLS-06 · P1 | **目录异常与预算**<br>不可读、消失子项以及扫描层数数量超限 | 明确报告跳过，根目录失败保留原树 | `unit`, `native-store` | 自动覆盖，结果见入口表 |

### SRH 查找替换与目录搜索

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| SRH-01 · P1 | **查找及环绕**<br>在正文源码按前后查找并测试大小写、全词 | 正确定位及环绕，不改变文档 | `unit`, `alignment` | 自动覆盖，结果见入口表 |
| SRH-02 · P0 | **捕获组替换**<br>测试数字及命名组、字面美元和未定义命名语法 | 遵循标准替换规则，无静默吞字 | `unit`, `alignment` | BUG-001：源码修复，公开包尚未更新 |
| SRH-03 · P0 | **全部替换历史**<br>在含中文及 CRLF 文档全部替换 | 只替换匹配项，单步撤销重做恢复完整字节 | `unit`, `alignment` | 自动覆盖，结果见入口表 |
| SRH-04 · P1 | **无效及零宽正则**<br>输入无效表达式及零宽匹配 | 明确错误，不死循环，不改原文 | `unit`, `alignment` | 自动覆盖，结果见入口表 |
| SRH-05 · P1 | **目录全文搜索**<br>搜索中文、正则与大小写，再打开匹配项 | 跳到正确文件和行，最多五百匹配并提示 | `unit`, `alignment`, `native-store` | 自动覆盖，结果见入口表 |
| SRH-06 · P1 | **快速打开与链接定位**<br>快速打开，点击标题脚注及跨文件链接 | 目标就绪后定位；越界文件需授权 | `features`, `alignment`, `native-store` | 自动覆盖，结果见入口表 |

### ENC 编码、BOM 与换行

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| ENC-01 · P0 | **UTF 编码读写**<br>UTF-8、UTF-16 LE/BE 与 BOM 文件往返 | 字节序、BOM、正文与元数据一致 | `unit`, `native-store`, `encoding` | 自动覆盖，结果见入口表 |
| ENC-02 · P0 | **传统编码**<br>GBK、GB18030、Big5、Shift JIS、1252 显式重开保存 | 中文及扩展字符无损往返或明确拒绝 | `unit`, `native-store`, `encoding` | 自动覆盖，结果见入口表 |
| ENC-03 · P0 | **不可表示字符**<br>在 GBK 文件插入 emoji 并保存 | 拒绝有损写入，原文件不变，草稿保留 | `unit`, `encoding` | 自动覆盖，结果见入口表 |
| ENC-04 · P0 | **脏文档转换编码**<br>转换为可表示编码，再撤销重做内容 | 编码转换不破坏正文历史 | `encoding`, `native-store` | 自动覆盖，结果见入口表 |
| ENC-05 · P0 | **LF 与 CRLF**<br>源码、富文本和 AI 编辑后保存并重启 | 保持选定换行，无重复 CR 或混用 | `unit`, `batch`, `ai`, `native-store` | 自动覆盖，结果见入口表 |
| ENC-06 · P0 | **外部编码变化**<br>磁盘变更 BOM 或编码时刷新清洁及脏文件 | 清洁文档更新，脏文档不被覆盖 | `encoding`, `native-store` | 自动覆盖，结果见入口表 |
| ENC-07 · P0 | **失败与取消转换**<br>取消对话框及故意失败后重试 | 文件和内容不变，对话框可继续操作 | `encoding` | 自动覆盖，结果见入口表 |

### WSP 标签、分屏与右键

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| WSP-01 · P0 | **标签独立历史**<br>依次编辑多标签、切回并撤销 | 只影响当前文档，保留滚动和编辑实例 | `workspace` | 自动覆盖，结果见入口表 |
| WSP-02 · P0 | **双文档分屏**<br>左右及上下分屏，各自编辑与切源码 | 窗格、模式和历史独立，目标正确 | `workspace`, `context-menu` | 自动覆盖，结果见入口表 |
| WSP-03 · P1 | **比例与排序恢复**<br>调整比例、交换窗格、重排标签并重启 | 方向、比例、活动文档和顺序恢复 | `workspace` | 自动覆盖，结果见入口表 |
| WSP-04 · P0 | **关闭窗格与重开**<br>关闭窗格、标签及批量保存关闭后重开 | 文档保留，草稿和脏文档策略正确 | `workspace`, `context-menu` | 自动覆盖，结果见入口表 |
| WSP-05 · P1 | **后台标签右键**<br>复制路径、定位、重命名非活动标签 | 以被点击标签为目标，不误改活动文档 | `context-menu` | 自动覆盖，结果见入口表 |
| WSP-06 · P1 | **正文与表格右键**<br>鼠标和 Shift-F10 打开，键盘选择并 Esc | 选区和焦点保留，小窗口内菜单可达 | `context-menu` | 自动覆盖，结果见入口表 |
| WSP-07 · P1 | **只读及组合状态**<br>只读或输入法候选期间打开菜单和切窗格 | 修改项禁用，组合输入不被打断 | `context-menu`, `workspace`, `ime` | 自动覆盖，结果见入口表 |

### IMG 图片与媒体管理

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| IMG-01 · P1 | **路径与显示**<br>插入本地、相对、中文空格及父目录图片 | 资源实际加载，尺寸及 alt 编辑正确 | `desktop`, `alignment`, `compatibility` | 自动覆盖，结果见入口表 |
| IMG-02 · P0 | **未保存草稿多图**<br>正文和源码粘贴多个图片到草稿 | 队列完整，保存后资源仍可访问 | `encoding`, `native-store` | 自动覆盖，结果见入口表 |
| IMG-03 · P0 | **复制移动与失败回滚**<br>批量复制、下载、移动，途中制造失败 | 引用同步，复制失败回滚，原资源不丢 | `unit`, `compatibility`, `native-store` | 自动覆盖，结果见入口表 |
| IMG-04 · P1 | **图片目录配置**<br>切换 YAML 根目录和复制目录及路径偏好 | 优先级、文件名变量和转义符合设置 | `unit`, `desktop`, `native-store` | 自动覆盖，结果见入口表 |
| IMG-05 · P1 | **上传协议**<br>向自有 HTTP 接口执行显式及自动上传 | 只发送测试资源，失败不破坏原图 | `unit`, `native-webkit` | 自动覆盖，结果见入口表 |
| IMG-06 · P1 | **真实图床**<br>独立配置用户指定图床后实际上传 | 远程图片可读，失败可恢复，不暴露密钥 | — | 待人工/实际软件验收 |

### SYN Markdown 扩展与图形

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| SYN-01 · P1 | **TOC 脚注与前言**<br>编辑重复标题、脚注、YAML 与引用链接 | 锚点更新，隐藏定义及正文保存准确 | `unit`, `features` | 自动覆盖，结果见入口表 |
| SYN-02 · P1 | **扩展开关**<br>高亮、上下标、emoji、注释、提示块开关及编辑 | 按设置渲染且不改原始 Markdown | `unit`, `features`, `alignment` | 自动覆盖，结果见入口表 |
| SYN-03 · P1 | **MathJax 离线公式**<br>宏、行内及独立公式渲染导出 | 无网络依赖，宏按文档顺序生效 | `unit`, `desktop`, `native-webkit` | 自动覆盖，结果见入口表 |
| SYN-04 · P1 | **Mermaid 与旧图语法**<br>渲染并导出 Mermaid、sequence、flow | 标签分支正确；不支持语法明确报错 | `unit`, `parity`, `native-webkit` | 自动覆盖，结果见入口表 |
| SYN-05 · P0 | **HTML 清理**<br>嵌入脚本、事件属性与危险资源目标 | 不执行危险内容，普通静态 HTML 保留 | `unit`, `alignment`, `native-store` | 自动覆盖，结果见入口表 |
| SYN-06 · P1 | **第三方嵌入**<br>逐站点核对 HTTPS iframe、音视频与外部媒体策略 | 分别记录可用性，失败不破坏正文 | — | 待人工/实际软件验收 |

### PDF HTML 导出与打印分页

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| PDF-01 · P1 | **便携 HTML**<br>导出含图片、字体、主题、公式和图表的文档 | 离线资源嵌入，正文与资源实际可用 | `desktop`, `parity`, `compatibility`, `native-webkit` | 自动覆盖，结果见入口表 |
| PDF-02 · P1 | **纸张边距及页眉页脚**<br>以 A4、Letter 和不同边距导出 | 页框及变量正确，正文无丢失重叠 | `native-webkit`, `next` | 自动覆盖，结果见入口表 |
| PDF-03 · P1 | **分页控制**<br>手动分页、标题另页及 CSS break-before/after | 关键段落出现在预期页，完整页数正确 | `next`, `native-webkit` | 自动覆盖，结果见入口表 |
| PDF-04 · P0 | **长表格分页**<br>导出二百行表格并逐页提取文字 | 每行恰好一次，续页重复表头 | `next`, `native-webkit` | 自动覆盖，结果见入口表 |
| PDF-05 · P1 | **页面视觉验收**<br>把导出的首页、续页与末页渲染成图片 | 字体、表格、间距可读，无裁切或重叠 | `next`, `native-webkit` | 本轮 12 页样本抽查通过 |
| PDF-06 · P0 | **导出隔离**<br>设置个人背景后导出 HTML 和 PDF | 个人背景和编辑器 UI 不进入导出 | `background`, `native-webkit` | 自动覆盖，结果见入口表 |

### CNV 复杂导入导出

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| CNV-01 · P1 | **Pandoc 格式输出**<br>导出 Word、RTF、ODT、EPUB 及文本目标格式 | 文件有效，正文及预期资源存在 | `unit`, `native-webkit` | 自动覆盖，结果见入口表 |
| CNV-02 · P0 | **复杂文档往返**<br>中文、表格、公式、脚注、图片多格式往返 | 逐结构与内容断言，不仅检查文件存在 | `unit`, `compatibility`, `native-webkit` | 自动覆盖，结果见入口表 |
| CNV-03 · P0 | **持久媒体**<br>导入含图片文档，保存后重启 | 图片从受管资源读取，临时目录删除后仍可用 | `compatibility`, `native-store` | 自动覆盖，结果见入口表 |
| CNV-04 · P1 | **DOC 与 RTF 依赖**<br>用 LibreOffice 和 Pandoc 转换旧格式 | 实际转换成功，缺依赖时给明确说明 | `unit`, `compatibility` | 自动覆盖，结果见入口表 |
| CNV-05 · P0 | **不支持资源拒绝**<br>导入不支持的矢量图或脚注内媒体样本 | 明确拒绝，不静默丢图或覆盖原文 | `unit`, `native-store` | 自动覆盖，结果见入口表 |
| CNV-06 · P1 | **外部办公软件视觉**<br>分别用真实 Word、WPS、LibreOffice 打开复杂输出 | 按软件版本记录视觉与结构差异 | — | 待人工/实际软件验收 |

### THM 主题、背景与设置

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| THM-01 · P1 | **内置六主题**<br>切换全部内置主题与明暗状态 | 字体、前景背景及编辑控件可读 | `desktop`, `alignment`, `native-webkit` | 自动覆盖，结果见入口表 |
| THM-02 · P1 | **逐主题定制**<br>调整宽度、字体、行距、颜色、CSS 后重启 | 设置按主题保留，切换不改文档和历史 | `next` | 自动覆盖，结果见入口表 |
| THM-03 · P1 | **第三方 CSS 导入**<br>导入带相对字体和图片的主题并导出 | 受支持选择器生效，资源嵌入正确 | `unit`, `alignment`, `native-webkit` | 自动覆盖，结果见入口表 |
| THM-04 · P1 | **背景图片**<br>选择 PNG/JPEG/WebP，调透明模糊位置和平铺 | 原图删除后副本仍可用，重启恢复 | `unit`, `background`, `native-webkit` | 自动覆盖，结果见入口表 |
| THM-05 · P1 | **背景边界与清除**<br>超限、无效文件、重置及移除背景 | 拒绝错误资源，清除不影响正文 | `unit`, `background`, `native-store` | 自动覆盖，结果见入口表 |
| THM-06 · P1 | **写作及界面偏好**<br>切换中英、专注、打字机、统计、配对及缩进 | 即时更新，焦点、文档与历史保留 | `features`, `knowledge`, `unit` | 自动覆盖，结果见入口表 |

### PLG 插件兼容与生命周期

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| PLG-01 · P0 | **单文件安装**<br>安装超过旧 1 MB 边界的合法 CommonJS 插件 | 默认停用，启用后加载运行并可撤销写入 | `plugin-package`, `native-webkit` | 自动覆盖，结果见入口表 |
| PLG-02 · P1 | **文件夹与相对模块**<br>安装含 JS/JSON/CSS 的模块包，删除原文件夹 | 相对模块和缓存正确，重启仍能运行 | `plugin-package`, `native-webkit` | 自动覆盖，结果见入口表 |
| PLG-03 · P0 | **容量与权限**<br>分别测试单源 16 MiB、总源 32 MiB、模块 64 MiB | 边界按字节检查，超限有诊断且不留可启用残项 | `unit`, `plugin-package`, `native-store` | 自动覆盖，结果见入口表 |
| PLG-04 · P1 | **六款原版社区插件**<br>启用固定版本列表折叠、无图、专注、静态标记、暗色、只读 | 原版行为实际生效，跨标签分屏绑定正确 | `community-plugins`, `native-webkit` | 自动覆盖，结果见入口表 |
| PLG-05 · P0 | **停用与异步销毁**<br>插件写入、定时器及异步任务运行时停用 | 立即释放样式事件与锁，旧实例不能继续写入 | `unit`, `community-plugins`, `plugin-package` | 自动覆盖，结果见入口表 |
| PLG-06 · P0 | **只读保护**<br>正文、源码、任务、菜单、AI 与结构命令尝试写入 | 全部拒绝修改，停用后恢复编辑 | `community-plugins`, `context-menu`, `ai`, `indentation` | 自动覆盖，结果见入口表 |
| PLG-07 · P1 | **配置与命令**<br>更改配置，执行动态命令与快捷键并重启 | 命令、事件与配置持久且卸载干净 | `unit`, `native-webkit` | 自动覆盖，结果见入口表 |
| PLG-08 · P1 | **未验证插件与私有接口**<br>逐个安装用户实际插件及依赖包 | 逐插件记录，不宣称兼容任意 Node 或 Typora 私有 API | — | 待人工/实际软件验收 |

### AI 选区改写与模型服务

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| AI-01 · P0 | **设置与密钥**<br>保存、清除、仅会话、换端点和旧密钥迁移 | 界面不回传密钥，macOS 文件 0600，端点不串密钥 | `unit`, `ai`, `native-ai-transport` | 自动覆盖，结果见入口表 |
| AI-02 · P0 | **请求范围与显式采纳**<br>选区生成，取消部分差异后应用 | 只发送选区及显式资料；生成不修改，采纳可撤销 | `ai`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| AI-03 · P0 | **连续改写历史**<br>采纳后继续生成，分别撤销和重做两轮 | 侧栏保留，书签更新，两轮历史独立 | `ai`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| AI-04 · P0 | **局部与源码改写**<br>粗体、列表、表格、代码、源码中分别改写 | 保留容器、换行、链接和精确保存字节 | `ai`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| AI-05 · P0 | **过期取消及分屏**<br>生成中改文、切标签或窗格并取消 | 迟到建议不能写入其他目标或覆盖新输入 | `ai` | 自动覆盖，结果见入口表 |
| AI-06 · P0 | **数字链接代码与术语**<br>默认保护下请求改变数字、URL、代码和锁定词 | 阻止意外采纳，显式解除才可改动 | `unit`, `ai`, `batch` | 自动覆盖，结果见入口表 |
| AI-07 · P1 | **真实自定义服务**<br>用公开资料在原生和 Electron 请求并保存、撤销重做 | 实际返回及写入精确；与连接测试和夹具分开 | `ai`, `batch` | 同日 0.22.0 真实服务补测，本轮沿用 |
| AI-08 · P1 | **本地模型与其他服务**<br>加载真实 Ollama/LM Studio 权重，逐服务验收 | 记录实际模型、格式和结果，不以协议夹具替代 | — | 待人工/实际软件验收 |

### KB 参考资料与目录问答

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| KB-01 · P0 | **显式参考文件**<br>用 @ 选择已打开及授权目录文件后生成 | 浏览不发送，发送范围受限，未保存内容可引用 | `knowledge`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| KB-02 · P1 | **本地检索及预算**<br>先检索中文和英文，再选择片段 | 检索不调用模型，预算跳过有提示 | `unit`, `knowledge` | 自动覆盖，结果见入口表 |
| KB-03 · P0 | **引文校验**<br>返回已知引文、未知编号及伪造引文 | 仅准确匹配资料的引用可插入 | `unit`, `knowledge`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| KB-04 · P1 | **来源跳转**<br>从答案跳原文，修改来源后返回答案 | 保持结果，来源变化提示位置可能移动 | `knowledge` | 自动覆盖，结果见入口表 |
| KB-05 · P0 | **答案插入与脚注**<br>复制、生成草稿、插入当前文档后撤销 | 脚注和相对链接有效，一次撤销恢复原文 | `knowledge`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| KB-06 · P1 | **检索语义边界**<br>使用同义词、不足资料和跨语言问题 | 明确关键词及证据限制，不宣称已有向量索引 | `unit`, `knowledge` | 自动覆盖，结果见入口表 |

### BAT 跨文档计划与恢复

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| BAT-01 · P0 | **显式范围与上限**<br>选最多四篇及单篇五万、总十二万字符边界 | 超限先拒绝，只发送明确选定文档 | `unit`, `batch` | 自动覆盖，结果见入口表 |
| BAT-02 · P0 | **计划只读与格式**<br>生成时检查文件，返回未知重复或重叠目标 | 不提前修改，无效计划整体拒绝 | `unit`, `batch`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| BAT-03 · P0 | **逐文件逐项审阅**<br>排除一篇与部分替换后应用 | 仅采纳范围改变，每篇独立一次撤销 | `batch`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| BAT-04 · P0 | **并发与磁盘冲突**<br>计划后编辑、关闭、改只读或外部改文件 | 任一目标失效整批停止，无部分覆盖 | `batch`, `unit` | 自动覆盖，结果见入口表 |
| BAT-05 · P0 | **保存与编码**<br>关闭自动保存再采纳并手动保存 | 缓冲区先改，沿用普通保存，CRLF/GB18030 精确 | `batch` | 自动覆盖，结果见入口表 |
| BAT-06 · P0 | **跨重启批次恢复**<br>应用后退出重启，再恢复全部目标 | 原文精确恢复，恢复前另建反向恢复点 | `batch`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| BAT-07 · P0 | **恢复记录边界**<br>改动一个目标、损坏记录、数量超限及清理未完成项 | 阻止危险恢复，保留受损记录，清理需确认 | `unit`, `batch`, `native-store` | 自动覆盖，结果见入口表 |
| BAT-08 · P1 | **真实三文档工作流**<br>真实模型生成三篇计划，拒绝一篇并恢复 | 两种宿主都实际返回、精确采纳和撤销重做 | `batch` | 同日 0.22.0 真实服务补测，本轮沿用 |

### HIS 持久版本历史

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| HIS-01 · P0 | **快照创建与去重**<br>打开、保存、空闲编辑、选区 AI 及手动快照 | 正确记录前后文本，连续相同版本不重复 | `unit`, `knowledge`, `native-ai-ui` | 自动覆盖，结果见入口表 |
| HIS-02 · P0 | **恢复与恢复前保护**<br>重启后浏览、恢复旧版，再撤销重做 | 仅明确恢复才写入，恢复前版本保留 | `knowledge`, `native-store` | 自动覆盖，结果见入口表 |
| HIS-03 · P0 | **完整性与容量**<br>破坏记录并测试单篇及总预算 | 拒绝损坏内容并保留原始记录，按预算裁剪 | `unit`, `native-store` | 自动覆盖，结果见入口表 |
| HIS-04 · P1 | **路径与草稿身份**<br>另存、重命名移动、关闭重开后看历史 | 遵守版本历史与批次记录各自身份规则 | `unit`, `native-store` | 自动覆盖，结果见入口表 |

### PRE Windows 系统预览

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| PRE-01 · P1 | **完整预览与大文件**<br>预览五 MiB 以上文档的开头和末尾 | 无旧截断，挂载块有界，末尾实际可见 | `preview` | 自动覆盖，结果见入口表 |
| PRE-02 · P1 | **相对图片与像素**<br>预览中文空格及父目录相对图片 | 路径解码正确，图片实际像素显示 | `preview` | 自动覆盖，结果见入口表 |
| PRE-03 · P0 | **COM 启用及恢复**<br>Windows 安装后开关预览并卸载 | IFile/IShellItem 初始化有效，恢复旧处理器 | — | 公开 0.22.0 发布记录，本轮未重跑该平台 |
| PRE-04 · P1 | **Everything 实体交互**<br>在用户实际 Everything/资源管理器中切换文件 | 各软件版本、DPI 与大文件组合单独记录 | — | 待人工/实际软件验收 |

### INS 安装、更新与平台

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| INS-01 · P0 | **公开包与校验**<br>逐个下载六个正式安装文件并核对摘要 | 大小、SHA-256、标签提交与正式资产一致 | — | 公开 0.22.0 发布记录，本轮未重跑该平台 |
| INS-02 · P0 | **macOS 覆盖更新**<br>正常退出旧版，校验签名和应用文件后替换 | 只保留当前版，文档草稿设置及会话指纹一致 | — | 公开 0.22.0 发布记录，本轮未重跑该平台 |
| INS-03 · P0 | **Windows 安装升级卸载**<br>NSIS 与旧版升级、参数打开、单实例及卸载 | 关联和路径有效，用户恢复数据保留 | — | 公开 0.22.0 发布记录，本轮未重跑该平台 |
| INS-04 · P0 | **Linux DEB 关联**<br>安装升级后用 GIO/KDE 打开中文空格路径 | 使用无空格安装目录，第二实例正确接收文件 | — | 公开 0.22.0 发布记录，本轮未重跑该平台 |
| INS-05 · P0 | **AppImage 真实 FUSE**<br>Ubuntu 22.04/24.04 普通用户挂载、编辑保存并退出 | 真实挂载与卸载，Chromium 沙箱开启 | — | 公开 0.22.0 发布记录，本轮未重跑该平台 |
| INS-06 · P1 | **其他完整桌面**<br>Kubuntu 26.04/Wayland、其他桌面及快捷键实按 | 分别记录系统版本，不把 Xvfb 或旧版结果当本轮 | — | 待人工/实际软件验收 |
| INS-07 · P1 | **签名与目标平台**<br>检查 macOS 公证、Windows 签名和各架构支持 | 如实标明未公证、未签名及未交付架构 | — | 公开 0.22.0 发布记录，本轮未重跑该平台 |

### WEB 独立网页试玩

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| WEB-01 · P1 | **加载及编辑模式**<br>本地网页首次打开，正文源码编辑并撤销重做 | 非空页面，编辑准确，无桌面桥或控制台错误 | `browser-demo` | 自动覆盖，结果见入口表 |
| WEB-02 · P0 | **文件导入边界**<br>导入 UTF-8、非法编码、二进制与超过一 MiB 文件 | 合法文本可用，失败保留当前文档 | `browser-demo` | 自动覆盖，结果见入口表 |
| WEB-03 · P0 | **下载与替换确认**<br>下载当前文字；脏文档切样例时取消和确认 | 下载字节准确，取消保留原文 | `browser-demo` | 自动覆盖，结果见入口表 |
| WEB-04 · P0 | **能力与数据范围**<br>检查网络、模型输入入口、本地持久化和刷新 | 不开放桌面密钥或文件系统能力，刷新清空有说明 | `browser-demo` | 自动覆盖，结果见入口表 |
| WEB-05 · P1 | **窄屏与组合输入**<br>窄屏操作及浏览器组合状态下切换和下载 | 控件可达，不丢候选或误下载 | `browser-demo` | 自动覆盖，结果见入口表 |

### PERF 大文件与编辑性能

| ID / 优先级 | 场景与操作 | 预期 | 自动入口 | 状态 / 范围 |
| --- | --- | --- | --- | --- |
| PERF-01 · P1 | **多 MiB 所见即所得**<br>打开五、十 MiB 文档，输入并保存撤销 | 可视块有界，大纲分析在 Worker 完成，精确字节保留 | `next` | 自动覆盖，结果见入口表 |
| PERF-02 · P0 | **超大代码块**<br>在三十二 MiB 单代码块插入换行和反引号后撤销 | 局部视口有界，完整内容与恢复记录准确 | `huge-blocks`, `native-webkit` | Chromium 与可见原生通过；隐藏条件见 OBS-001 |
| PERF-03 · P0 | **大草稿重启恢复**<br>修改三十二 MiB 草稿后重启并切源码再保存 | 脏内容完整恢复，不受原二十 MiB 限制 | `huge-blocks`, `native-store` | 自动覆盖，结果见入口表 |
| PERF-04 · P1 | **被动刷新与焦点**<br>大文档滚动或表格视口刷新时操作快速打开 | 更新不抢输入焦点或错误关闭对话框 | `huge-blocks` | 自动覆盖，结果见入口表 |

## 已有 GitHub 问题的回归入口

| 问题 | 当前复核范围 | 仍需区分 |
| --- | --- | --- |
| [#1 Linux 安装包及后续反馈](https://github.com/AniChikage/open-markdown-lane/issues/1) | INS-03/04/05/06、EDT-05；无空格 Linux 安装路径、文件关联及 Ctrl 缩进 | 0.22.0 安装/FUSE 发布任务；完整 Kubuntu 26.04 人工记录为旧版，未冒充本轮 |
| [#3 标签、正文、表格右键](https://github.com/AniChikage/open-markdown-lane/issues/3) | WSP-04/05/06/07、TBL-04/05/08；本轮菜单套件通过 | 全部实体鼠标、菜单键及桌面/DPI 组合未穷尽 |
| [#5 Excel/WPS 粘贴](https://github.com/AniChikage/open-markdown-lane/issues/5) | CLP-01 至 CLP-06、TBL-06/08；本轮格式夹具及独立原生剪贴板通过 | 实体 Excel/WPS 复制来源与版本单列；OBS-002 仍待定位 |
| [#7 大型插件加载](https://github.com/AniChikage/open-markdown-lane/issues/7) | PLG-01/02/03/05；1+ MiB 单文件、4+ MiB 包、64 MiB 超限诊断 | 没有获得提交者插件源码，不宣称其整个插件已验收 |

## 菜单命令登记

来源：[`shared/commands.json`](../shared/commands.json)，共 128 项。`Mod` 在 macOS 为 Command，在 Windows/Linux 为 Control；平台差异以表中的 `pcKey` 为准。这里核对命令登记和用例归属；并不表示全部快捷键已在三个系统实体键盘上实按。

| 菜单 | 命令 | action | Mac 定义 | Windows/Linux 定义 | 对应用例 |
| --- | --- | --- | --- | --- | --- |
| 文件 | 新建 | `new` | `` Mod-N `` | `` Mod-N `` | DOC-01 |
| 文件 | 新建窗口 | `newWindow` | `` Mod-Shift-N `` | `` Mod-Shift-N `` | DOC-08 |
| 文件 | 新建标签页 | `newTab` | `` Mod-T `` | `` Mod-Alt-N `` | WSP-01 |
| 文件 | 打开文件… | `open` | `` Mod-O `` | `` Mod-O `` | DOC-01 |
| 文件 | 快速打开… | `quick-open` | `` Mod-Shift-O `` | `` Mod-P `` | SRH-06 |
| 文件 | 重新打开关闭的文档 | `reopen` | `` Mod-Shift-T `` | `` Mod-Shift-T `` | DOC-07 |
| 文件 | 打开文件夹… | `folder` | — | — | FLS-01 |
| 文件 | 最近文件与文件夹… | `recent` | — | — | FLS-04 |
| 文件 | 在文件夹中新建文件… | `new-file` | — | — | FLS-02 |
| 文件 | 新建文件夹… | `new-folder` | — | — | FLS-02 |
| 文件 | 撤销文件操作 | `undo-file` | — | — | FLS-03 |
| 文件 | 保存 | `save` | `` Mod-S `` | `` Mod-S `` | DOC-01 |
| 文件 | 另存为… | `saveAs` | `` Mod-Shift-S `` | `` Mod-Shift-S `` | DOC-03 |
| 文件 | 版本历史… | `versions` | — | — | HIS-02 |
| 文件 | 文本编码… | `encoding` | — | — | ENC-01 |
| 文件 | 导入 Word / 其他格式… | `import` | — | — | CNV-02 |
| 文件 | 导出 HTML… | `html` | — | — | PDF-01 |
| 文件 | 导出 PDF… | `pdf` | — | — | PDF-02 |
| 文件 | 导出 Word… | `docx` | — | — | CNV-01 |
| 文件 | 导出 RTF… | `rtf` | — | — | CNV-01 |
| 文件 | 导出 OpenDocument… | `odt` | — | — | CNV-01 |
| 文件 | 导出 EPUB… | `epub` | — | — | CNV-01 |
| 文件 | 导出 LaTeX… | `latex` | — | — | CNV-01 |
| 文件 | 导出 reStructuredText… | `rst` | — | — | CNV-01 |
| 文件 | 导出 MediaWiki… | `mediawiki` | — | — | CNV-01 |
| 文件 | 导出 Textile… | `textile` | — | — | CNV-01 |
| 文件 | 导出 OPML… | `opml` | — | — | CNV-01 |
| 文件 | 导出 Reveal.js… | `revealjs` | — | — | CNV-01 |
| 文件 | 关闭标签页 | `close` | `` Mod-W `` | `` Mod-W `` | DOC-04 |
| 文件 | 关闭窗口 | `close-window` | `` Mod-Shift-W `` | `` Mod-Shift-W `` | DOC-08 |
| 编辑 | 撤销 | `undo` | `` Mod-Z `` | `` Mod-Z `` | EDT-01 |
| 编辑 | 重做 | `redo` | `` Mod-Shift-Z `` | `` Mod-Shift-Z `` | EDT-01 |
| 编辑 | 剪切 | `cut` | `` Mod-X `` | `` Mod-X `` | CLP-01 |
| 编辑 | 复制 | `copy` | `` Mod-C `` | `` Mod-C `` | CLP-01 |
| 编辑 | 粘贴 | `paste` | `` Mod-V `` | `` Mod-V `` | CLP-01 |
| 编辑 | 全选 | `select-all` | `` Mod-A `` | `` Mod-A `` | EDT-10 |
| 编辑 | 选择词语 | `select-word` | `` Mod-D `` | `` Mod-D `` | EDT-10 |
| 编辑 | 删除词语 | `delete-word` | `` Mod-Shift-D `` | `` Mod-Shift-D `` | EDT-10 |
| 编辑 | 选择行 / 表格行 | `select-line` | `` Mod-L `` | `` Mod-L `` | EDT-10 |
| 编辑 | 选择格式范围 / 单元格 | `select-scope` | `` Mod-E `` | `` Mod-E `` | EDT-10 |
| 编辑 | 跳回选区 | `jump-selection` | `` Mod-J `` | `` Mod-J `` | EDT-10 |
| 编辑 | 复制为 Markdown | `copy-markdown` | `` Mod-Shift-C `` | `` Mod-Shift-C `` | CLP-01 |
| 编辑 | 粘贴为纯文本 | `paste-plain` | `` Mod-Shift-V `` | `` Mod-Shift-V `` | CLP-01 |
| 编辑 | 查找与替换 | `find` | `` Mod-F `` | `` Mod-F `` | SRH-01 |
| 编辑 | 查找下一个 | `find-next` | `` Mod-G `` | `` F3 `` | SRH-01 |
| 编辑 | 查找上一个 | `find-previous` | `` Mod-Shift-G `` | `` Shift-F3 `` | SRH-01 |
| 编辑 | 搜索文件夹内容… | `global-search` | `` Mod-Shift-F `` | `` Mod-Shift-F `` | SRH-05 |
| 编辑 | AI 改写选区… | `ai-rewrite` | `` Mod-Shift-R `` | `` Mod-Shift-R `` | AI-02 |
| 编辑 | 目录问答… | `knowledge` | — | — | KB-02 |
| 编辑 | 跨文档修改… | `batch-edit` | — | — | BAT-01 |
| 编辑 | 模型设置… | `ai-models` | — | — | AI-01 |
| 段落 | 一级标题 | `heading-1` | `` Mod-1 `` | `` Mod-1 `` | EDT-04 |
| 段落 | 二级标题 | `heading-2` | `` Mod-2 `` | `` Mod-2 `` | EDT-04 |
| 段落 | 三级标题 | `heading-3` | `` Mod-3 `` | `` Mod-3 `` | EDT-04 |
| 段落 | 四级标题 | `heading-4` | `` Mod-4 `` | `` Mod-4 `` | EDT-04 |
| 段落 | 五级标题 | `heading-5` | `` Mod-5 `` | `` Mod-5 `` | EDT-04 |
| 段落 | 六级标题 | `heading-6` | `` Mod-6 `` | `` Mod-6 `` | EDT-04 |
| 段落 | 普通段落 | `heading-0` | `` Mod-0 `` | `` Mod-0 `` | EDT-04 |
| 段落 | 提升标题级别 | `heading-up` | `` Mod-= `` | `` Mod-= `` | EDT-04 |
| 段落 | 降低标题级别 | `heading-down` | `` Mod-- `` | `` Mod-- `` | EDT-04 |
| 段落 | 插入表格… | `table` | `` Mod-Alt-T `` | `` Mod-T `` | TBL-01 |
| 段落 | 代码块 | `code` | `` Mod-Alt-C `` | `` Mod-Shift-K `` | EDT-08 |
| 段落 | 公式块 | `math-block` | `` Mod-Alt-B `` | `` Mod-Shift-M `` | EDT-08 |
| 段落 | 插入分页符 | `pagebreak` | — | — | PDF-03 |
| 段落 | 引用 | `quote` | `` Mod-Alt-Q `` | `` Mod-Shift-Q `` | EDT-05 |
| 段落 | 有序列表 | `ordered-list` | `` Mod-Alt-O `` | `` Mod-Shift-[ `` | EDT-05 |
| 段落 | 无序列表 | `unordered-list` | `` Mod-Alt-U `` | `` Mod-Shift-] `` | EDT-05 |
| 段落 | 任务列表 | `task-list` | — | — | EDT-06 |
| 段落 | 切换任务状态 | `task-toggle` | — | — | EDT-06 |
| 段落 | 标记为已完成 | `task-done` | — | — | EDT-06 |
| 段落 | 标记为未完成 | `task-undone` | — | — | EDT-06 |
| 段落 | 增加缩进 | `indent` | `` Mod-[ `` | `` Mod-[ `` | EDT-05 |
| 段落 | 减少缩进 | `outdent` | `` Mod-] `` | `` Mod-] `` | EDT-05 |
| 段落 | 在上方插入段落 | `paragraph-above` | — | — | EDT-04 |
| 段落 | 在下方插入段落 | `paragraph-below` | — | — | EDT-04 |
| 段落 | 脚注… | `footnote` | — | — | SYN-01 |
| 段落 | 水平分割线 | `hr` | — | — | EDT-04 |
| 段落 | 内容目录 | `toc` | — | — | SYN-01 |
| 段落 | YAML Front Matter | `yaml` | — | — | SYN-01 |
| 表格 | 上方插入行 | `table-rowBefore` | — | — | TBL-04 |
| 表格 | 下方插入行 | `table-row` | — | — | TBL-04 |
| 表格 | 左侧插入列 | `table-columnBefore` | — | — | TBL-04 |
| 表格 | 右侧插入列 | `table-column` | — | — | TBL-04 |
| 表格 | 向上移动行 | `table-moveRowUp` | — | — | TBL-04 |
| 表格 | 向下移动行 | `table-moveRowDown` | — | — | TBL-04 |
| 表格 | 向左移动列 | `table-moveColumnLeft` | — | — | TBL-04 |
| 表格 | 向右移动列 | `table-moveColumnRight` | — | — | TBL-04 |
| 表格 | 删除行 | `table-removeRow` | `` Mod-Shift-Backspace `` | `` Mod-Shift-Backspace `` | TBL-04 |
| 表格 | 删除列 | `table-removeColumn` | — | — | TBL-04 |
| 表格 | 左对齐 | `table-left` | — | — | TBL-04 |
| 表格 | 居中对齐 | `table-center` | — | — | TBL-04 |
| 表格 | 右对齐 | `table-right` | — | — | TBL-04 |
| 表格 | 格式化表格源码 | `table-format` | — | — | TBL-04 |
| 表格 | 删除表格 | `table-deleteTable` | — | — | TBL-04 |
| 格式 | 粗体 | `bold` | `` Mod-B `` | `` Mod-B `` | EDT-07 |
| 格式 | 斜体 | `italic` | `` Mod-I `` | `` Mod-I `` | EDT-07 |
| 格式 | 下划线 | `underline` | `` Mod-U `` | `` Mod-U `` | EDT-07 |
| 格式 | 删除线 | `strike` | `` Ctrl-Shift-` `` | `` Alt-Shift-5 `` | EDT-07 |
| 格式 | 注释 | `comment` | — | — | EDT-07 |
| 格式 | 行内代码 | `inline-code` | `` Mod-Shift-` `` | `` Mod-Shift-` `` | EDT-07 |
| 格式 | 高亮 | `highlight` | — | — | EDT-07 |
| 格式 | 上标 | `superscript` | — | — | EDT-07 |
| 格式 | 下标 | `subscript` | — | — | EDT-07 |
| 格式 | 超链接… | `link` | `` Mod-K `` | `` Mod-K `` | SRH-06 |
| 格式 | 插入引用链接… | `reference-link` | — | — | SYN-01 |
| 格式 | 插入图片… | `image` | `` Mod-Ctrl-I `` | `` Mod-Shift-I `` | IMG-01 |
| 格式 | 复制 / 下载所有图片到… | `copy-all-images` | — | — | IMG-03 |
| 格式 | 移动所有图片到… | `move-all-images` | — | — | IMG-03 |
| 格式 | 上传所有图片 | `upload-all-images` | — | — | IMG-05 |
| 格式 | 清除格式 | `clear-format` | `` Mod-\ `` | `` Mod-\ `` | EDT-07 |
| 显示 | 下一个标签页 | `next-tab` | `` Ctrl-Tab `` | `` Ctrl-Tab `` | WSP-01 |
| 显示 | 上一个标签页 | `previous-tab` | `` Ctrl-Shift-Tab `` | `` Ctrl-Shift-Tab `` | WSP-01 |
| 显示 | 左右分屏 | `split-right` | `` Mod-Alt-2 `` | `` Mod-Alt-2 `` | WSP-02 |
| 显示 | 上下分屏 | `split-down` | — | — | WSP-02 |
| 显示 | 切换编辑窗格 | `other-pane` | `` F6 `` | `` F6 `` | WSP-02 |
| 显示 | 交换窗格 | `swap-panes` | — | — | WSP-02 |
| 显示 | 关闭当前窗格 | `close-pane` | — | — | WSP-04 |
| 显示 | 源码模式 | `source` | `` Mod-/ `` | `` Mod-/ `` | EDT-09 |
| 显示 | 专注模式 | `focus` | `` F8 `` | `` F8 `` | THM-06 |
| 显示 | 打字机模式 | `typewriter` | `` F9 `` | `` F9 `` | THM-06 |
| 显示 | 显示／隐藏侧栏 | `sidebar` | `` Mod-Shift-L `` | `` Mod-Shift-L `` | FLS-01 |
| 显示 | 大纲 | `outline` | `` Mod-Ctrl-1 `` | `` Mod-Shift-1 `` | FLS-01 |
| 显示 | 文件列表 | `files` | `` Mod-Ctrl-2 `` | `` Mod-Shift-2 `` | FLS-01 |
| 显示 | 文件树 | `file-tree` | `` Mod-Ctrl-3 `` | `` Mod-Shift-3 `` | FLS-01 |
| 显示 | 字数统计… | `statistics` | — | — | THM-06 |
| 显示 | 切换明暗主题 | `theme` | — | — | THM-01 |
| 显示 | 偏好设置… | `preferences` | `` Mod-, `` | `` Mod-, `` | THM-06 |
| 显示 | 插件管理… | `plugins` | — | — | PLG-04 |

## 尚需人工与外部条件的矩阵

| 条件 | 至少需要记录 |
| --- | --- |
| 输入法 | OS、输入法版本、正文/粗体/列表/表格/代码/源码、候选提交/取消/选词 Enter、单步撤销重做 |
| 操作系统 | macOS、Windows 10/11、Ubuntu 22.04/24.04、Kubuntu 26.04；桌面、Wayland/X11、DPI、CPU 架构 |
| 剪贴板 | Office Excel、WPS、LibreOffice；软件版本，HTML/TSV/图片优先级，空值/多行/合并格 |
| 扩展与外部服务 | 用户实际插件/主题版本、依赖范围；模型接口及版本、超时/限流；图床真实上传与远程读取 |
| 浏览器 | 本轮 Chrome；Safari/Firefox、移动端实体候选与浏览器下载对话框单独记录 |

每次执行记录：用例 ID、应用版本与提交、OS/宿主/视图、前提和样例、步骤、预期与实际、文件哈希或精确差异、日志/截图、状态及执行时间。失败修复前保留旧结果，修复后重跑原序列及相关数据保护用例。当前版本化证据见[验收记录](verification.md)，功能支持边界见[功能清单](feature-parity.md)。
