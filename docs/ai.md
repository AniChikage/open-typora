# AI selection editing

English · [简体中文](ai.zh-CN.md)

AI editing is optional and available in the desktop app. You bring a model service; Open Typora does not include a paid subscription or a hosted model.

## Connect a model

Open **编辑 → 模型设置…** (Edit → Model settings), or **偏好设置 → AI 改写 → 模型设置…** (Preferences → AI editing → Model settings). Enter the protocol, base URL, exact model ID and, if required, an API key. **保存并测试连接** saves the configuration and sends the public text `你好` with a short connection-test instruction. Opening settings or a document does not contact a model.

| Service | Interface | Example base URL |
| --- | --- | --- |
| OpenAI-compatible API | OpenAI 兼容 API / LM Studio | Your provider's base URL, usually ending in `/v1` |
| OpenRouter | OpenAI 兼容 API / LM Studio | `https://openrouter.ai/api/v1` |
| LM Studio | OpenAI 兼容 API / LM Studio | `http://127.0.0.1:1234/v1` |
| Ollama | Ollama 原生接口 | `http://127.0.0.1:11434` |

The compatible interface uses non-streaming `POST /chat/completions`; a root URL gets `/v1/chat/completions`. Custom path prefixes and complete endpoint URLs are preserved. The Ollama interface uses non-streaming `POST /api/chat`. Select a model actually installed in the local server or available to your provider account. Local servers must be running separately; an optional local API key can be left empty if the server permits it.

For OpenRouter, copy an exact model ID from its [current catalog](https://openrouter.ai/models), and use your own OpenRouter key. Availability, pricing and [request limits](https://openrouter.ai/docs/api/reference/limits) are controlled by the provider. Open Typora sends the configured model ID without substituting another model.

Other proprietary API formats are not supported unless the service offers an OpenAI-compatible chat endpoint. This release does not include tool calling, browsing or a whole-folder agent.

## Rewrite and review

1. Select text in live editing or source mode. Bold text, lists, table cells and a local code editor use the same Markdown source bookmark.
2. Click the sparkle button or use **⌘⇧R** on macOS / **Ctrl+Shift+R** on Windows and Linux.
3. Describe the edit, or choose a concise/rewrite/English preset. Click **生成改写**.
4. Review each original/suggested change. Uncheck any change you want to keep, or keep the entire original. Generation does not modify or save the document.
5. Click **应用 … 处修改** to apply the reviewed selection as one isolated undoable edit. Undo restores the exact original; redo restores the approved result. The panel stays open, clears the consumed differences and retains your instruction. Use **继续改写** to edit the approved text again, or select other text and click **读取当前选区**. Each application has its own undo step; closing the panel discards only an unapplied proposal.

Only the selected text, your instruction and the editor's fixed preservation instruction are sent. The rest of the document, file path, other tabs and nearby paragraphs are not added automatically. A narrow selection therefore gives the model less context. Review names, numbers, facts, code, links and Markdown syntax before applying; preservation instructions are not a guarantee of model accuracy.

You can keep writing while generation runs. If the document text or active document changes, the proposal cannot be applied until the exact original is current again, or you select fresh text and generate again. Switching to another split pane cannot write the proposal into that pane. Read-only plugins prevent AI writes. Cancel stops the pending request and late results are ignored.

AI capture, apply and keyboard submission are guarded during IME composition. The review panel does not move focus when a response arrives. Finish the candidate input before starting or applying an edit.

## Credentials and data

- Starting with 0.20.2, the macOS app stores remembered keys in plaintext in `~/Library/Application Support/Open Typora/ai-settings.json`, with file permissions `0600` (read/write for the current user only). Regular settings and rewrite requests read that file, without Keychain access. Do not commit or share the configuration file. Windows/Linux retain Electron's system-backed encryption; insecure Linux `basic_text` storage is refused.
- Uncheck **保存密钥到本机配置文件** on macOS, or **使用系统安全存储记住密钥** on Windows/Linux, to keep a key only until the app exits. Session keys are not written to disk. Local servers without authentication need no key.
- For a macOS configuration from 0.20.1 or earlier, the app does not read Keychain automatically. Settings offers **迁移旧密钥到配置文件**, or you can re-enter the key. This explicit migration may need one final system authorization; after migration, settings and rewrites no longer query Keychain. The old entry is not used again. Never put a key in chat or an issue.
- Settings return only key-presence/storage flags to the interface. The password field is cleared after saving. Reopening settings does not reveal a saved key. Changing the service endpoint does not reuse its previous key.
- Base URLs cannot contain passwords, query strings or fragments. HTTP redirects are refused so a model key and selected text are not forwarded to another endpoint by a redirect.
- Selected text is sent to the service you configure. Use your own public test text when checking a free provider's behavior. A local server keeps the request local only if its own configuration does so.

The browser demo does not accept model keys or call model services. Existing documents, themes and recovery sessions are independent of model settings.

## Limits and errors

One request accepts up to **200,000 UTF-16 code units** of selected text and **8,000** of instructions; the provider may have a smaller token/context limit. Returned text has the same 200,000-unit limit, with a 2 MiB HTTP response cap and a 180-second timeout. Four requests may run concurrently per application service. There is no automatic retry loop.

Truncated responses and empty results cannot be applied. Authentication, endpoint and rate-limit failures leave the document unchanged; provider error bodies are not echoed into the editor. A failed connection test saves the valid configuration but reports the request failure so it can be corrected.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Connection test fails | Match the interface and URL to your service, use its exact model ID, and check the key and provider quota. A valid configuration stays saved even when the test request fails. |
| Local server cannot be reached | Start LM Studio or Ollama separately, load a model and verify the host and port. Open Typora does not install or start a local model server. |
| An old macOS key still needs migration | In model settings, choose **迁移旧密钥到配置文件**, or re-enter the key once and save. Subsequent launches use the file. Do not include the key or configuration file in an issue. |
| Apply is disabled | Finish any IME candidate input, leave read-only mode, and return to the unchanged original document and pane. If the text changed, select it again and generate a new proposal. |
| Empty, truncated or oversized output | Narrow the selection or requested change and check the model's context/output limits. The rejected result has not changed your document. |

For a bug report, include the app and OS versions, interface type, non-secret error text, and a public minimal sample. Remove API keys, private endpoints and document contents you cannot share.

## Verification

`npm run test:ai` exercises the actual Electron UI and owned HTTP server: configuration, scoped requests, per-change review, Markdown containers, local code/source editing, save bytes, undo/redo, stale results, cancellation, composition guards, read-only plugins and split panes. It does not simulate model intelligence or an OS candidate window.

On macOS, `npm run test:ai-native` tests the actual URLSession transport and `npm run test:ai-webkit` tests the native bridge and WebKit review flow. These deterministic fixtures need no third-party key. Windows/Linux installers run the AI UI acceptance against their packaged executable. Physical input-method and real-provider tests are separate from those fixtures.

The [0.20.0 verification record](verification.md) separately records a real custom-API rewrite and manual Sogou Pinyin acceptance on macOS. Ollama was tested at the protocol level; this release did not run local model weights. Other model services and physical input methods are not exhaustively verified.
