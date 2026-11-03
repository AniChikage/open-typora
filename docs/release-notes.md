Open Typora 0.22.0 adds reviewed edits across selected Markdown documents, persistent batch recovery, and preservation constraints for AI editing.

This is an independent, unofficial project, unaffiliated with Typora. If you can afford it, please [buy Typora](https://store.typora.io/) and support its official developers.

## Downloads

- macOS 14+, Apple Silicon: `Open-Typora-0.22.0-arm64.dmg` or ZIP.
- Windows 10/11 x64: `Open-Typora-0.22.0-windows-x64-Setup.exe` or ZIP.
- Linux x64: `Open-Typora-0.22.0-linux-x64.deb` or AppImage.

SHA-256 checksums are included. macOS is locally signed, not notarized; Windows is unsigned. Updates preserve documents, preferences, model settings, and recovery data.

## Changes

- **Edit multiple documents:** choose up to four open or authorized-folder documents, generate a plan, review file-by-file and change-by-change, then explicitly apply. Unknown files, ambiguous passages, overlapping edits and malformed model plans are rejected. Generation does not change files; only the selected document texts are sent.
- **Preservation constraints:** protect numbers/common date and time forms, link/image destinations and code by default; optionally lock exact terms. Unexpected changes block application until rejected or explicitly allowed. Checks compare extracted values and counts; they do not verify factual correctness or all syntax variants.
- **Batch recovery:** save complete before/after text locally before applying. Keep the latest 20 completed batches and separate pending records. Recovery survives restart, checks every target for later edits or disk conflicts, and retains a recovery point before restoration too. Each affected editor also has a separate undo step.
- Preserve the current tab and split layout, background-tab history, unsaved text and existing autosave behavior. Edits update buffers; ordinary per-file saving still applies. This does not provide a filesystem-wide atomic save or an autonomous writing agent.
- Fix a false conflict after a save reaches disk before its session checkpoint: recovery accepts it only when disk text exactly matches the recovered buffer. Genuine conflicts still retain the draft.
- Revalidate scanned folder entries before opening them; reject entries replaced by symlinks rather than opening a file outside the granted folder.

## Scope

A plan accepts up to 50,000 UTF-16 units per document and 120,000 in total. Model-service limits may be smaller. Restore requires original paths or draft IDs and unchanged approved results; renamed/moved files must be handled separately. See the [workflow and privacy guide](workspace.md#edit-multiple-documents).

Semantic retrieval, autonomous tool execution, paragraph conflict merging, source-change impact tracking and historical Q&A are not included. Existing plugin compatibility boundaries remain unchanged.
