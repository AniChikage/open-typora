# AI selection editing

AI editing is optional and available in the desktop app. You bring a model service; Open Typora does not include a paid subscription or a hosted model.

## Connect a model

Open **Edit → 模型设置…**, or **Preferences → AI**. Enter the protocol, base URL, exact model ID and, if required, an API key. **保存并测试连接** saves the configuration and sends the public text `你好` with a short connection-test instruction. Opening settings or a document does not contact a model.

| Service | Interface | Example base URL |
| --- | --- | --- |
| OpenAI-compatible API | OpenAI 兼容 API / LM Studio | Your provider's base URL, usually ending in `/v1` |
| OpenRouter | OpenAI 兼容 API / LM Studio | `https://openrouter.ai/api/v1` |
| LM Studio | OpenAI 兼容 API / LM Studio | `http://127.0.0.1:1234/v1` |
| Ollama | Ollama 原生接口 | `http://127.0.0.1:11434` |

The compatible interface uses non-streaming `POST /chat/completions`; a root URL gets `/v1/chat/completions`. Custom path prefixes and complete endpoint URLs are preserved. The Ollama interface uses non-streaming `POST /api/chat`. Select a model actually installed in the local server or available to your provider account. Local servers must be running separately; an optional local API key can be left empty if the server permits it.

For OpenRouter, choose a currently available `:free` model or `openrouter/free` to use free inference. Free endpoints still require your own OpenRouter key and have provider limits. `openrouter/free` chooses among free models, so use a fixed free model ID for repeatable quality comparisons. Open Typora sends the configured model ID and does not substitute a paid model. Check [OpenRouter's current catalog](https://openrouter.ai/models?max_price=0) and [limits](https://openrouter.ai/docs/api/reference/limits).

Other proprietary API formats are not supported unless the service offers an OpenAI-compatible chat endpoint. This release does not include tool calling, browsing or a whole-folder agent.

## Rewrite and review

1. Select text in live editing or source mode. Bold text, lists, table cells and a local code editor use the same Markdown source bookmark.
2. Click the sparkle button or use **⌘⇧R** on macOS / **Ctrl+Shift+R** on Windows and Linux.
3. Describe the edit, or choose a concise/rewrite/English preset. Click **生成改写**.
4. Review each original/suggested change. Uncheck any change you want to keep, or keep the entire original. Generation does not modify or save the document.
5. Click **应用 … 处修改** to apply the reviewed selection as one isolated undoable edit. Undo restores the exact original; redo restores the approved result. Closing the panel discards the proposal.

Only the selected text, your instruction and the editor's fixed preservation instruction are sent. The rest of the document, file path, other tabs and nearby paragraphs are not added automatically. A narrow selection therefore gives the model less context. Review names, numbers, facts, code, links and Markdown syntax before applying; preservation instructions are not a guarantee of model accuracy.

You can keep writing while generation runs. If the document text or active document changes, the proposal cannot be applied until the exact original is current again, or you select fresh text and generate again. Switching to another split pane cannot write the proposal into that pane. Read-only plugins prevent AI writes. Cancel stops the pending request and late results are ignored.

AI capture, apply and keyboard submission are guarded during IME composition. The review panel does not move focus when a response arrives. Finish the candidate input before starting or applying an edit.

## Credentials and data

- macOS stores remembered keys in the system Keychain. Windows/Linux use Electron's system-backed encryption; insecure Linux `basic_text` storage is refused.
- If secure storage is unavailable, uncheck **使用系统安全存储记住密钥** to use a key only until the app exits. Session keys are not written to disk. Local servers without authentication need no key.
- A locally signed macOS update can require renewed Keychain authorization. If access is refused, approve the app in the system prompt or re-enter the key in model settings; never put a key in chat or a bug report. See [Apple's Keychain access help](https://support.apple.com/guide/keychain-access/kyca1243/mac).
- Settings return only key-presence/storage flags to the interface. The password field is cleared after saving. Reopening settings does not reveal a saved key. Changing the service endpoint does not reuse its previous key.
- Base URLs cannot contain passwords, query strings or fragments. HTTP redirects are refused so a model key and selected text are not forwarded to another endpoint by a redirect.
- Selected text is sent to the service you configure. Use your own public test text when checking a free provider's behavior. A local server keeps the request local only if its own configuration does so.

The browser demo does not accept model keys or call model services. Existing documents, themes and recovery sessions are independent of model settings.

## Limits and errors

One request accepts up to **200,000 UTF-16 code units** of selected text and **8,000** of instructions; the provider may have a smaller token/context limit. Returned text has the same 200,000-unit limit, with a 2 MiB HTTP response cap and a 180-second timeout. Four requests may run concurrently per application service. There is no automatic retry loop.

Truncated responses and empty results cannot be applied. Authentication, endpoint and rate-limit failures leave the document unchanged; provider error bodies are not echoed into the editor. A failed connection test saves the valid configuration but reports the request failure so it can be corrected.

## Verification

`npm run test:ai` exercises the actual Electron UI and owned HTTP server: configuration, scoped requests, per-change review, Markdown containers, local code/source editing, save bytes, undo/redo, stale results, cancellation, composition guards, read-only plugins and split panes. It does not simulate model intelligence or an OS candidate window.

On macOS, `npm run test:ai-native` tests the actual URLSession transport and `npm run test:ai-webkit` tests the native bridge and WebKit review flow. These deterministic fixtures need no third-party key. Windows/Linux installers run the AI UI acceptance against their packaged executable. Physical input-method and real-provider tests are separate from those fixtures.
