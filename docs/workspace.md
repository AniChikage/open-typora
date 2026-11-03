# References, folder Q&A, multi-document editing, and version history

English · [简体中文](workspace.zh-CN.md)

These desktop features use ordinary local Markdown files. AI remains optional: configure your own compatible API or local model in **Edit → Model settings…**. No model or cloud subscription is bundled. See the [AI guide](ai.md) for service and credential settings.

## Add reference files to a rewrite

Select text and open **Rewrite selection with AI**. Type `@` and a filename in the instructions, or use **Add reference file**. Choose from open documents and the currently authorized folder. Selected files appear as removable chips.

Clicking **Generate rewrite** reads those references locally and chooses relevant excerpts. Nothing is sent while browsing the picker. The request contains the selected text, your instruction, and the excerpts; it does not automatically include every open document. Open documents use their current unsaved text. If a selected reference is unavailable or too large, generation stops before sending, so you can remove it or open a smaller file.

Review the resulting changes before applying them. Applying is a single undo transaction and captures the document before and after the edit in local version history. If the source text, active document, input composition, or read-only state changes while a snapshot is being written, the edit is refused rather than applied to a stale target.

## Ask questions about a folder

1. Open a Markdown folder, then choose **Edit → Folder Q&A…**. You can also choose **Open documents** as the source scope.
2. Enter a question using terms from your documents and click **Find sources**. This step runs locally, including chunk ranking in a Web Worker. It makes no model request.
3. Expand the results to inspect the excerpts and line ranges. Uncheck any source you do not want to send.
4. Click **Send selected excerpts and ask**. Only these excerpts and the question go to your configured model.
5. Read the answer and its quoted evidence. **Open source** jumps to the document; **Back to Folder Q&A** returns to the retained answer. If the source changed, the app warns that its line numbers may have moved.
6. Copy the answer, create a new draft, or insert it into the current document. Insertion adds Markdown footnotes and relative file links where possible, and can be undone once. Draft references and files on another Windows volume use plain source labels instead of broken relative links.

The model must return known source IDs and quotes that occur in the supplied excerpts. Unknown IDs, invented quotes, missing citations, and malformed responses are rejected before insertion. If the model reports insufficient evidence, insertion is disabled. Quote matching checks correspondence with the provided text; it does **not** establish that the answer's reasoning is correct. Review the conclusion yourself.

Retrieval uses lexical terms, including Chinese character pairs. It is not an embedding index, a web search, or an autonomous agent. Questions that use different vocabulary from the files may need more specific keywords. The app does not execute instructions found in source files. Multi-document edits use the separate reviewed workflow below; folder Q&A never writes multiple files.

### Retrieval limits

| Limit | Behavior |
| --- | --- |
| Reference file | Up to 2 MiB per file |
| Explicit rewrite references | Up to 4 files |
| Folder retrieval | Up to 30 MiB of accepted source text per search; bounded batches may read one additional batch before noticing the limit |
| Evidence | Up to 8 excerpts, with source names and original line ranges |
| Model context | At most 48,000 UTF-16 units of reference text; service token limits may be smaller |

Skipped files and a reached budget are reported in the dialog. Narrow the folder or use open documents when the search is incomplete. These limits apply to reference retrieval, not to opening, editing, or saving large documents. Directory access remains limited to granted files and rejects replaced symlinks. Reading a reference does not open it or add it to the recovery session.

File names and excerpts are sent as context. Host authority metadata, absolute filesystem paths, file tokens, and hashes are not added to the model payload. Text inside the excerpts may itself contain personal information, paths, or secrets: inspect it before sending. Source and model output are treated as text, not commands. Nothing is inserted automatically.

## Edit multiple documents

Choose **Edit → Edit multiple documents…**. This is a bounded review workflow for existing Markdown documents, not an autonomous agent.

1. Select up to **4 documents**, from open tabs or the currently authorized folder, and write an instruction. Folder files open before generation; an open document uses its current unsaved text. Only these explicitly selected texts, display names, your instruction and preservation settings are sent to your configured model. Document IDs and absolute filesystem paths are not added to the request.
2. Review the returned **edit plan**. Generating it does not edit or save documents. Each proposed replacement must match one unique, non-overlapping passage in a known target; unknown files, ambiguous passages and malformed output stop the workflow.
3. Open **Review file changes**. Accept or reject a whole file or individual changes. By default, changes to numeric tokens, common date/time forms, link/image destinations and code contents block application. You can also list exact terms to preserve. To change protected content intentionally, explicitly relax its constraint. These are deterministic comparisons, **not fact-checking**: they do not prove semantic accuracy or cover every natural-language date, unit or link syntax.
4. Click **Apply to … documents**. A complete local recovery record is written before any buffer changes. All selected targets are rechecked for source text, document identity, read-only state, composition, and disk changes. A changed target blocks the whole batch. Approved edits use one isolated undo step per file, including background tabs; the original tab/pane remains selected.
5. Edits land in **editor buffers** and follow your existing autosave setting. With autosave off, save each document normally. This is not a filesystem-wide atomic save: existing per-file saving and external-change protection still apply.

**Batch recovery** is in the same dialog. Open the original documents, choose a recovery point, inspect its original text and confirm restoration. Every affected document must still match that batch's approved result, including files that were saved and reopened. If one has later changes or a disk conflict, **nothing is restored**. A restore first creates its own recovery point, so it can be reversed the same way. Normal per-document Undo also remains available while its editor stays open. Closing a document and reopening it does not restore in-memory undo history.

Recovery records live in `edit-batches-v1` in the application data folder, with plaintext before/after content, names and local paths; owner-only permissions are used where supported. Integrity checks reject damaged records without rewriting them. Keep the latest **20 completed batches**, including completed restores; pending records are retained separately (at most 20). An interrupted application can leave a pending record even if edits reached buffers. Inspect it before restoring or explicitly removing it; removal only deletes that recovery point. This is bounded local recovery, not a replacement for backups.

Batch restore matches saved documents by their original path and drafts by their original ID. Reopen closed originals first. Moving, renaming, deleting or saving a draft under a new path does not migrate a batch recovery record. The preview shows at most 12,000 characters per original; restoration uses the complete stored text.

### Multi-document limits

- Up to 50,000 UTF-16 units per input document, 120,000 total; the model service may impose a smaller context limit. Ordinary editor file sizes are unaffected.
- One plan request, with no automatic retry or hidden folder-wide scan. Cancellation ignores late results. No browsing, tool execution, automatic new files or autonomous writes.
- Up to 200 unique replacement passages across the plan. Output and request limits from the [AI guide](ai.md) also apply.
- Changes to captured document text during generation require generating a new plan. Paragraph-level conflict merging, source-change impact tracking, semantic retrieval and historical Q&A are future work.

## Persistent version history

Choose **File → Version history…** to browse local snapshots. Save a manual snapshot before an experiment, inspect an earlier version, or restore it. Before a restore, the current content is captured too; one undo returns to that content. Viewing a version never writes the document.

Snapshots are captured when opening and saving, after eight seconds of idle unsaved editing, around approved AI selection edits, and around version restores. Multi-document edits use the separate batch recovery records described above. Consecutive save/automatic snapshots within 30 seconds are coalesced when an older baseline exists; identical latest content does not create another entry. App-managed Save As and rename/move operations carry history forward. Renaming a file outside the app does not migrate its history automatically.

History lives under `versions-v1` in the application's data directory, independently of session recovery and in-memory undo. Each document retains up to **50 versions / 128 MiB** of unique text; all history shares a **512 MiB** budget. Oldest versions are pruned when necessary. The preview shows the first 24,000 characters; a restore uses the full stored version. A document exceeding the history budget remains editable and saveable, but cannot get a snapshot at that size.

Snapshots contain plaintext Markdown and use owner-only file permissions where the platform supports them. Integrity checks reject damaged snapshots; unreadable indexes are preserved and reported. Saving a document can still succeed if history storage fails. Version history is a convenience, not a separate backup or a promise of unlimited retention. Copy important documents to your own backup location.

## Interface language

In Preferences, select **Language / 语言 → English** or **简体中文**. The choice is saved locally and updates application controls and menus without replacing the editor, translating document contents, or clearing undo. Chinese remains the default for existing profiles. Operating-system file dialogs follow the OS language; third-party plugin text and custom theme names may use their own language.
