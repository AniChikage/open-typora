# Themes and plugin compatibility

Open Typora 0.6.0 includes six original themes and a compatibility host for a subset of [obgnail/typora_plugin](https://github.com/obgnail/typora_plugin). This is an independent integration, with no affiliation to Typora or the plugin authors. It does not load the complete Typora plugin distribution.

## Included community plugins

Open **View → Plugin Manager** (显示 → 插件管理), or use **Preferences → Manage plugins**. Plugins are off initially. Their enabled state and configuration persist locally. Enable a plugin to apply its default effect, use **Toggle effect** or its shortcut to change it, and disable it to unload it. Effect toggles are session state unless the upstream plugin explicitly saves its configuration.

| Plugin | Upstream file | Adapted behavior | Default shortcut |
| --- | --- | --- | --- |
| Read-only / 只读模式 | `read_only.js` | Locks live editing, source, local code editors, undo and editing commands; document navigation and copying remain available | Mod+Alt+R |
| No images / 无图阅读 | `no_image.js` | Hides inline images; hover reveals them | Mod+Alt+I |
| Paragraph focus / 段落聚焦 | `blur.js` | Blurs other top-level blocks; hover restores clarity | Mod+Alt+Shift+B |
| Static markers / 常显语法标记 | `static_markers.js` | Keeps supported inline metadata visible, including emphasis and code delimiters | Mod+Alt+M |
| Dark inversion / 反色夜间模式 | `dark.js` | Applies the upstream root inversion filter in a light OS appearance | Mod+Alt+D |

Mod means Command on macOS and Control on Windows. Reserved editor shortcuts and collisions with other loaded plugins are rejected. Use **Plugin settings** to adjust the JSON configuration, including `HOTKEY`. A loading failure displays its cause and releases resources owned through the compatibility API.

The five upstream files are included unchanged under `third-party/typora-plugins`, pinned to commit `4a856129a9dbefaa963bfba4aacd3e5484bde60a`, with their MIT license and provenance. They are compiled as ordinary modules; the host does not use `eval` or enable `unsafe-eval`. Runtime adapters normalize a small set of DOM selectors and upstream CSS transition units.

## Installing another plugin

Use **Install local plugin**, review the trust notice, and choose a UTF-8 `.js` or `.cjs` file of at most 1 MB. Installation copies it into a managed, content-addressed module and leaves it disabled. Enable it explicitly. To uninstall, use **Remove plugin**; desktop copies go to the operating system Trash and the original source file stays intact.

Installed JavaScript is trusted application code, **not a sandbox**. It can access documents and the desktop bridge. Only install source you trust. macOS serves modules through its existing same-origin resource handler. The Electron host preserves the existing application origin and serves installed modules through a scoped, per-session authorized protocol. Neither host enables `eval`, Node integration or unrestricted remote script loading.

The supported entry is a single CommonJS file exporting `module.exports.plugin`. Compatible `BasePlugin` lifecycle hooks are `prepare`, `init`, `style` (CSS string), `html` (sanitized), `hotkey`, `process` and `postprocess`; commands use `call`, and cleanup can use `destroy`. A simple `BaseCustomPlugin.callback(anchor)` entry is supported, but the upstream custom-plugin manager and all selector/hint conventions are not implemented.

The adapter provides style insertion/removal, notifications, local settings updates, lifecycle/document events, basic selection and Markdown access, undoable text insertion/replacement, `File.lock/unlock/freshLock`, tracked document event listeners, and a small `$` helper. It does **not** provide Node `require`, filesystem/process modules, Electron APIs, dependencies, the full jQuery API, or arbitrary Typora internals. Unsupported module requests fail visibly. Plugins using those interfaces require a port. Direct global DOM mutations outside the tracked helpers remain the plugin author's cleanup responsibility.

For example, this independent single-file plugin adds an undoable edit:

```js
class InsertDate extends BasePlugin {
  call() {
    this.utils.insertText(new Date().toISOString().slice(0, 10))
  }
}
module.exports = { plugin: InsertDate }
```

## Themes

Preferences contains **简白, 暖纸, 青墨, 石墨, 深海, 松夜** with immediate previews. Warm paper and forest use serif document fonts; the other themes use a sans-serif writing face. Font availability follows the operating system. Theme selection persists locally and is included in exported HTML/PDF styles.

Custom CSS installation on macOS and Windows supports local CSS imports plus referenced fonts and images. Resources are embedded, with depth/size limits and checks against directory traversal and symlink escapes. Remote resources must be downloaded first. Basic `#write`, `#typora-sidebar` and `.md-fences` selectors are adapted, along with common palette variables. This is **partial Typora theme compatibility**; no claim is made that every third-party theme renders identically.

## Verification scope

Tests execute the pinned upstream sources, exercise lifecycle cleanup, failed dependencies, real DOM effects, read-only guards, installation integrity and theme assets. The native WebKit suite additionally imports an installed CommonJS module under the actual script policy and checks an undoable document edit. UI acceptance and platform-specific limitations are recorded in the feature checklist. Passing these checks does not establish compatibility with all Typora plugins, themes, IMEs or operating systems.
