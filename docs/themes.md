# Customizing themes

Open Preferences, choose a theme, then expand **自定义当前主题**. Changes preview immediately and are saved separately for each theme, including installed CSS themes.

Controls cover body/code font families, line height (1.2–2.5), document width (480–1,600 px), paragraph spacing (0–40 px), accent, paper and text colors. Empty font/color values follow the selected theme. Font fields accept installed font-family names, not CSS declarations. The background-image settings remain separate and are excluded from exports.

## CSS

Use **自定义 CSS** for styles shared by the editor and exported document. Public targets include `.rich-document` (live editor), `.source-surface` (source editor) and `.print-document` (HTML/PDF). Theme variables include `--document-font`, `--code-font`, `--document-width`, `--document-line-height`, `--paragraph-spacing`, `--accent`, `--paper` and `--ink`.

```css
.rich-document h2, .print-document h2 { color: #376a86; }
.rich-document blockquote, .print-document blockquote {
  border-left: 3px solid var(--accent);
}
```

Use **打印专用 CSS** for output-only rules, without an outer `@media print` wrapper:

```css
.print-document h2 { break-before: page; }
.print-document figure { break-inside: avoid; }
```

**导出当前主题 CSS…** combines the selected theme, visual settings and custom CSS; print-only rules are wrapped in `@media print`. Reimport the exported file with the CSS theme picker to share it. Local fonts/images should be imported with a theme so assets are embedded; arbitrary filesystem URLs in typed CSS are not automatically packaged.

**恢复当前主题默认值** resets only the selected theme's custom settings. Advanced and print CSS each have a 100,000-character limit. Third-party themes can hardcode conflicting styles; compatibility is partial and selector-specific overrides may be needed. Settings are local to this application profile, not stored in Markdown files or synchronized across devices.
