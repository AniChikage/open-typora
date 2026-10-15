# Open Typora 品牌标记

唯一矢量源是 [icon.svg](icon.svg)。定制衬线字母 M 对应 Markdown，双侧竖画和中间斜画构成清晰、稳定的轮廓。墨蓝主体与一小段灰蓝顶边置于纸白底座，不加入文档折角或小尺寸细节。

- 纸白 `#ffffff`、底座阴影色 `#edf1f5`。
- 墨蓝 `#35465e` / `#1d2a3e`、顶边灰蓝 `#6d8cae`。
- 1024 方形画布，底座四周留 64 单位；标记居中，以实际 16/32/64/128 像素检查识别度。
- 应用图标和“关于”窗口共用这份源文件。`scripts/icon.mjs` 生成 PNG、Windows ICO 与 macOS ICNS，不再单独绘制一份标记。

README 展示图使用 `presentation/hero.html` 排版，`presentation/editor-window.jpg` 为真实 macOS 应用截图，打开的是 `examples/a-quiet-morning.md`。产品图统一使用英文；中英文 README 共用 `docs/images/hero.png`。白底、轻量标题、留白和独立窗口参考 Typora 官网的展示节奏，素材与文案均为本项目原创。截图只裁去底部状态区，保留实际文档、标题栏和窗口控件；不重绘或翻译应用像素。应用界面目前仍为简体中文。

DMG 安装背景源文件为 `dmg-background.svg`；`scripts/package-dmg.mjs` 生成 1×/2× 背景和 Finder 图标布局，将已经签名的原生应用封装为拖拽安装磁盘。
