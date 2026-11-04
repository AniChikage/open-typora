# Open Markdown Lane rename

The project and repository are now **Open Markdown Lane** / `open-markdown-lane`.
The source, desktop menus, browser demo, generated exports, build tools and new
installer filenames use this name. This is an independent project, unaffiliated
with Typora; please support the [official product](https://typora.io/) if you can.

## Existing data

- Existing desktop application-data directories named `Open Typora` are used in
  place. Sessions, drafts, version snapshots, plugins, images and AI settings are
  not moved or deleted. Fresh installs use `Open Markdown Lane`.
- The OS application ID `org.opentypora.desktop`, WebKit document origin
  `opentypora://app`, asset protocol, background IndexedDB database and legacy
  credential-service ID remain stable for upgrade compatibility. These internal
  identifiers are not the displayed product name.
- Linux also retains the old name while Electron initializes its libsecret/
  KWallet encryption provider, then sets the new display name before opening
  windows. This keeps saved API credentials decryptable with the existing key.
- Browser preference/session keys are copied to `open-markdown-lane-*` before
  rendering. Existing new keys take precedence. Old keys remain intact; if a
  quota prevents copying, reads fall back to the old value.
- Runtime environment variables use `OPEN_MARKDOWN_LANE_*`. Previous
  `OPEN_TYPORA_*` overrides remain supported by the desktop hosts; explicit new
  values take precedence.
- The macOS install script checks that both old and new applications have quit,
  verifies the replacement, and then removes the old application bundle. A failed
  replacement restores the previous bundle. It does not remove document or
  settings directories.
- Windows retains its installer application ID. The Linux DEB declares that it
  replaces and conflicts with the previous `open-typora` package. AppImages are
  standalone files; remove an old AppImage yourself after verifying the new one.

## Published links and third-party compatibility

Release 0.23.0 ships renamed macOS, Windows and Linux installers. The public
web demo uses https://open-markdown-lane.comicyueyu.chatgpt.site. Previous
release binaries are retired; source tags and historical verification remain.
Upgrade acceptance downloads the current public release and verifies its checksums,
so future builds do not depend on retired release assets.

Historical verification records, third-party plugin provenance, upstream licenses,
Typora theme selectors and supported `typora-*` Markdown metadata retain their
original names. Renaming those would falsify history or break interoperability.

Install the current release to update an existing application. Keep the original
documents and application-data directory in place.
