import { codeSelectionCommand, selectionActions } from "./selectionCommands";
import { ImageDialog } from "../components/ImageDialog";
import { imageReferences } from "./images";
import type { ImageReference } from "./images";
import { textMatches, replaceTextMatches } from "./search";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentUnit,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { search, searchKeymap, openSearchPanel, findNext as cmFindNext, findPrevious as cmFindPrevious } from "@codemirror/search";
import { MarkdownDocument } from "./model.ts";
import { RichEditor } from "./RichEditor.ts";
import { host } from "../host";
import type { DocumentRecord } from "../types";
import type { Preferences } from "../preferences";
import type { BlockArguments } from "./blockCommands.ts";
export interface EditorHandle {
  view(): EditorView | null;
  find(): void;
  jump(line: number): void;
  wrap(before: string, after?: string): void;
  codeBlock(): void;
  undo(): void;
  redo(): void;
  focus(): void;
  richMode(): boolean;
  command(action: string, args?: BlockArguments): void;
  insert(text: string): void;
  selectionText(markdown?: boolean): string;
  clearFormat(): void;
  findNext(back?: boolean): void;
  context(): string;
  composing(): boolean;
  markdown(): string;
  transform(change: (text: string) => string): void;
}
interface Props {
  document: DocumentRecord;
  rendered: boolean;
  active?: boolean;
  readOnly?: boolean;
  preferences?: Preferences;
  typewriter?: boolean;
  onChange(content: string): void;
  onError(error: string): void;
  onCursor(line: number, column: number): void;
  onSelection?(text: string): void;
  onCompositionEnd?(): void;
}
export const MarkdownEditor = forwardRef<EditorHandle, Props>(
  function MarkdownEditor(
    { document: record, rendered, active = true, readOnly = false, preferences, typewriter = false, onChange, onError, onCursor, onSelection, onCompositionEnd },
    ref,
  ) {
    const root = useRef<HTMLDivElement>(null),
      sourceParent = useRef<HTMLDivElement>(null);
    const model = useRef<MarkdownDocument | null>(null),
      rich = useRef<RichEditor | null>(null),
      source = useRef<EditorView | null>(null);
    const callbacks = useRef({ onChange, onError, onCursor, onSelection, onCompositionEnd });
    callbacks.current = { onChange, onError, onCursor, onSelection, onCompositionEnd };
    const initial = useRef(record),
      requested = useRef(rendered),
      activeMode = useRef(rendered);
    const [visibleMode, setVisibleMode] = useState(
      rendered && record.content.length <= 300_000,
    );
    const [editingImage, setEditingImage] = useState<ImageReference | null>(null);
    const imageQueue = useRef(Promise.resolve());
    const [searchOpen, setSearchOpen] = useState(false),
      [query, setQuery] = useState(""),
      [replacement, setReplacement] = useState("");
    const [searchOptions, setSearchOptions] = useState({ regex: false, caseSensitive: false, wholeWord: false });
    const [searchStatus, setSearchStatus] = useState("");
    const searchField = useRef<HTMLInputElement>(null);
    const searchTerms = useRef({ query, replacement, searchOptions }); searchTerms.current = { query, replacement, searchOptions };
    const syncing = useRef(false);
    const sourceComposing = useRef(false);
    const pendingOptions = useRef(false);
    const compositionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isComposing = () => !!(rich.current?.composing || sourceComposing.current || source.current?.composing);
    function editingBlocked() {
      if (viewOptions.current.readOnly) return true;
      if (!isComposing()) return false;
      callbacks.current.onError("请先完成当前输入法组合输入，再修改文档。");
      return true;
    }
    function applyViewOptions() {
      if (isComposing()) { pendingOptions.current = true; return; }
      pendingOptions.current = false;
      const { preferences, typewriter, readOnly } = viewOptions.current;
      if (rich.current) {
        rich.current.setOptions({ spellcheck: preferences?.spellcheck ?? false, tabSize: preferences?.tabSize || 2, typewriter, autoPair: preferences?.autoPair ?? false, emoji: preferences?.emoji ?? true, readOnly });
        model.current?.refreshCaret(); rich.current.render(false);
      }
      if (source.current) source.current.contentDOM.spellcheck = preferences?.spellcheck ?? false;
      source.current?.dispatch({ effects: sourceBehavior.current.reconfigure(sourceOptions()) });
      if (typewriter && source.current && !activeMode.current) source.current.dispatch({ effects: EditorView.scrollIntoView(source.current.state.selection.main.head, { y: "center" }) });
    }
    function compositionFinished() {
      if (pendingOptions.current) applyViewOptions();
      callbacks.current.onCompositionEnd?.();
      setMode(requested.current);
    }
    const sourceBehavior = useRef(new Compartment());
    const sourceOptions = () => [EditorState.readOnly.of(viewOptions.current.readOnly), EditorView.editable.of(!viewOptions.current.readOnly), indentUnit.of(" ".repeat(viewOptions.current.preferences?.tabSize || 2)), ...(viewOptions.current.preferences?.autoPair ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [])];
    const viewOptions = useRef({ preferences, typewriter, readOnly, active });
    viewOptions.current = { preferences, typewriter, readOnly, active };
    function historyState() {
      if (!viewOptions.current.active || root.current?.closest(".document-editor")?.hasAttribute("hidden")) return;
      if (model.current && window.desktop?.historyState)
        void window.desktop
          .historyState(
            !viewOptions.current.readOnly && model.current.canUndo,
            !viewOptions.current.readOnly && model.current.canRedo,
            activeMode.current,
            model.current.nodeAt(model.current.selection.head)?.kind || "",
          )
          .catch(() => {});
    }
    function focusEditor() {
      if (!viewOptions.current.active) return;
      if (activeMode.current) rich.current?.restore();
      else { source.current?.requestMeasure(); source.current?.focus(); }
      const doc = model.current;
      if (doc) {
        const before = doc.text.slice(0,doc.selection.head), at = before.lastIndexOf("\n");
        callbacks.current.onCursor(before.split("\n").length, before.length-at);
        const from = Math.min(doc.selection.anchor,doc.selection.head), to = Math.max(doc.selection.anchor,doc.selection.head);
        callbacks.current.onSelection?.(doc.text.slice(from,to));
      }
      historyState();
    }
    const publish = () => {
      callbacks.current.onChange(model.current!.toMarkdown());
      historyState();
    };
    function matches() {
      try { return textMatches(model.current?.text || "", searchTerms.current.query, searchTerms.current.replacement, searchTerms.current.searchOptions); }
      catch (error) { setSearchStatus(`表达式无效：${(error as Error).message}`); return null; }
    }
    function findNext(back = false) {
      const doc = model.current, found = matches(); if (!doc || !found) return;
      if (!found.length) { setSearchStatus("未找到匹配内容"); return; }
      const from = Math.min(doc.selection.anchor, doc.selection.head), to = Math.max(doc.selection.anchor, doc.selection.head);
      const exact = found.findIndex(match => match.from === from && match.to === to);
      const index = exact >= 0 ? (exact + (back ? -1 : 1) + found.length) % found.length : back ? found.findLastIndex(match => match.to <= from) : found.findIndex(match => match.from >= to);
      const chosen = index >= 0 ? index : back ? found.length - 1 : 0, match = found[chosen];
      rich.current?.select({ anchor: match.from, head: match.to }, false); setSearchStatus(`${chosen + 1} / ${found.length}`);
    }
    function replaceMatch(all = false) {
      if (viewOptions.current.readOnly) return;
      const doc = model.current, found = matches(); if (!doc || !found) return;
      if (!found.length) { setSearchStatus("未找到匹配内容"); return; }
      rich.current?.releaseFence(); doc.closeGroup();
      if (all) { doc.replace(0, doc.text.length, replaceTextMatches(doc.text, found), "replace-all", { anchor: 0, head: 0 }); rich.current?.render(false); publish(); setSearchStatus(`已替换 ${found.length} 处`); return; }
      const from = Math.min(doc.selection.anchor, doc.selection.head), to = Math.max(doc.selection.anchor, doc.selection.head), match = found.find(item => item.from === from && item.to === to);
      if (!match) { findNext(); return; }
      doc.replace(from, to, match.replacement, "replace"); rich.current?.render(false); publish(); findNext();
    }
    function syncSource() {
      const view = source.current,
        doc = model.current;
      if (!view || !doc) return;
      syncing.current = true;
      view.dispatch({
        changes:
          view.state.doc.toString() === doc.text
            ? undefined
            : { from: 0, to: view.state.doc.length, insert: doc.text },
        selection: { anchor: doc.selection.anchor, head: doc.selection.head },
      });
      syncing.current = false;
    }
    function history(redo = false) {
      if (editingBlocked()) return;
      const doc = model.current;
      if (!doc) return;
      if (!activeMode.current && source.current) {
        const s = source.current.state.selection.main;
        doc.selection = { anchor: s.anchor, head: s.head };
      }
      if (activeMode.current) {
        redo ? rich.current?.redo() : rich.current?.undo();
      } else if (redo ? doc.redo() : doc.undo()) {
        syncSource();
        publish();
        source.current?.focus();
      }
    }
    function insertImage(file: File) { imageQueue.current = imageQueue.current.then(() => insertImageNow(file)); return imageQueue.current; }
    async function insertImageNow(file: File) {
      if (viewOptions.current.readOnly) return;
      try {
        let relative = await host.importImage(
          initial.current.id,
          new Uint8Array(await file.arrayBuffer()),
          file.name, { ...viewOptions.current.preferences, source: model.current?.toMarkdown() },
        );
        if (viewOptions.current.preferences?.imageAutoUpload) { try { const mapped = await host.imageAction(initial.current.id, [relative], "upload", { ...viewOptions.current.preferences }); if (mapped?.[relative]) relative = mapped[relative]; } catch (e) { callbacks.current.onError(`上传失败，已保留本地图片：${(e as Error).message}`); } }
        insert(`![${file.name.replace(/[\[\]]/g, "")}](${relative})`, "paste");
      } catch (error) {
        callbacks.current.onError((error as Error).message);
      }
    }
    function insert(text: string, kind = "command") {
      if (editingBlocked()) return;
      if (activeMode.current) rich.current?.insert(text, kind);
      else if (source.current && model.current) {
        const selection = source.current.state.selection.main;
        model.current.selection = {
          anchor: selection.anchor,
          head: selection.head,
        };
        model.current.replace(selection.from, selection.to, text, kind);
        syncSource();
        publish();
        source.current.focus();
      }
    }
    function ensureSource() {
      if (source.current || !sourceParent.current || !model.current) return;
      const doc = model.current;
      source.current = new EditorView({
        parent: sourceParent.current,
        state: EditorState.create({
          doc: doc.text,
          selection: doc.selection,
          extensions: [
            EditorState.phrases.of({
              Find: "查找",
              Replace: "替换为",
              next: "下一个",
              previous: "上一个",
              all: "全部匹配",
              "match case": "区分大小写",
              regexp: "正则表达式",
              "by word": "整词匹配",
              replace: "替换",
              "replace all": "全部替换",
              close: "关闭查找",
              "current match": "当前匹配",
              "on line": "所在行",
            }),
            drawSelection(),
            EditorView.lineWrapping,
            highlightActiveLine(),
            markdown({ base: markdownLanguage }),
            syntaxHighlighting(defaultHighlightStyle),
            bracketMatching(),
            sourceBehavior.current.of(sourceOptions()),
            search({ top: true }),
            keymap.of([
              {
                key: "Mod-z",
                run: () => {
                  history();
                  return true;
                },
              },
              {
                key: "Mod-Shift-z",
                run: () => {
                  history(true);
                  return true;
                },
              },
              ...searchKeymap,
              ...defaultKeymap,
              indentWithTab,
            ]),
            EditorView.contentAttributes.of({
              "aria-label": "Markdown 源码编辑器",
              spellcheck: "false",
            }),
            EditorView.updateListener.of((update) => {
              if (syncing.current) return;
              const selected = update.state.selection.main;
              if (update.docChanged) {
                const old = update.startState.selection.main;
                doc.selection = { anchor: old.anchor, head: old.head };
                const kind = sourceComposing.current || update.transactions.some((t) =>
                  t.isUserEvent("input.type.compose"),
                )
                  ? "composition"
                  : update.transactions.some((t) => t.isUserEvent("input.type"))
                    ? "typing"
                    : "source-command";
                doc.replace(
                  0,
                  doc.text.length,
                  update.state.doc.toString(),
                  kind,
                  { anchor: selected.anchor, head: selected.head },
                );
                publish();
              } else if (update.selectionSet) {
                doc.selection = {
                  anchor: selected.anchor,
                  head: selected.head,
                };
                if (!sourceComposing.current) doc.closeGroup();
              }
              if (update.selectionSet || update.docChanged) {
                const line = update.state.doc.lineAt(selected.head);
                callbacks.current.onCursor(
                  line.number,
                  selected.head - line.from + 1,
                );
                callbacks.current.onSelection?.(update.state.sliceDoc(selected.from, selected.to));
                if (viewOptions.current.typewriter) requestAnimationFrame(() => {
                  if (source.current === update.view) update.view.dispatch({ effects: EditorView.scrollIntoView(selected.head, { y: "center" }) });
                });
              }
            }),
            EditorView.domEventHandlers({
              paste(event) {
                const images = [...(event.clipboardData?.files || [])].filter(
                  (file) => file.type.startsWith("image/"),
                );
                if (!images.length) return false;
                event.preventDefault();
                for (const image of images) void insertImage(image);
                return true;
              },
              drop(event) {
                const images = [...(event.dataTransfer?.files || [])].filter(
                  (file) => file.type.startsWith("image/"),
                );
                if (!images.length) return false;
                event.preventDefault();
                for (const image of images) void insertImage(image);
                return true;
              },
              compositionstart() {
                if (compositionTimer.current !== null) { clearTimeout(compositionTimer.current); doc.endComposition(); }
                compositionTimer.current = null;
                sourceComposing.current = true;
                doc.beginComposition();
                return false;
              },
              compositionend() {
                compositionTimer.current = setTimeout(() => {
                  compositionTimer.current = null;
                  sourceComposing.current = false;
                  doc.endComposition();
                  publish();
                  compositionFinished();
                }, 0);
                return false;
              },
            }),
          ],
        }),
      });
      source.current.contentDOM.spellcheck = viewOptions.current.preferences?.spellcheck ?? false;
    }
    function setMode(value: boolean) {
      const doc = model.current;
      if (!doc) return;
      value = value && doc.text.length <= 300_000;
      if (isComposing()) return;
      doc.closeGroup();
      if (value) {
        if (!activeMode.current && source.current) {
          const s = source.current.state.selection.main;
          doc.selection = { anchor: s.anchor, head: s.head };
        }
        doc.endSourceSession();
        doc.refreshCaret();
        rich.current?.render(false);
      } else {
        if (activeMode.current) {
          doc.selection = rich.current?.bookmark() || doc.selection;
          rich.current?.releaseFence();
        }
        doc.beginSourceSession();
        ensureSource();
        syncSource();
      }
      activeMode.current = value;
      setVisibleMode(value);
      historyState();
    }
    useImperativeHandle(
      ref,
      () => ({
        view: () => source.current,
        composing: isComposing,
        markdown: () => model.current?.toMarkdown() || "",
        transform: change => { const doc = model.current; if (!doc || editingBlocked()) return; doc.closeGroup(); const next = change(doc.text); if (next !== doc.text) { doc.replace(0, doc.text.length, next, "document-command"); if (activeMode.current) rich.current?.render(false); else syncSource(); publish(); } },
        find: () => {
          if (!activeMode.current) {
            ensureSource();
            openSearchPanel(source.current!);
            return;
          }
          setSearchOpen(true);
          requestAnimationFrame(() => {
            searchField.current?.focus();
            searchField.current?.select();
          });
        },
        jump: (line) => {
          if (activeMode.current) rich.current?.jump(line);
          else if (source.current) {
            const target = source.current.state.doc.line(
              Math.min(line, source.current.state.doc.lines),
            );
            source.current.dispatch({
              selection: { anchor: target.from },
              effects: EditorView.scrollIntoView(target.from, {
                y: "start",
                yMargin: 30,
              }),
            });
            source.current.focus();
          }
        },
        wrap: (before, after = "") => {
          if (editingBlocked()) return;
          if (activeMode.current) rich.current?.wrap(before, after);
          else {
            const s = source.current?.state.selection.main;
            if (!s || !model.current) return;
            const selected = model.current.text.slice(s.from, s.to);
            model.current.selection = { anchor: s.anchor, head: s.head };
            model.current.replace(
              s.from,
              s.to,
              before + selected + after,
              "format",
              { anchor: s.from + before.length, head: s.to + before.length },
            );
            syncSource();
            publish();
            source.current?.focus();
          }
        },
        codeBlock: () => {
          if (viewOptions.current.readOnly) return;
          if (activeMode.current) rich.current?.codeBlock();
        },
        command: (action, args) => {
          if (viewOptions.current.readOnly && (!selectionActions.has(action) || action === "delete-word")) return;
          if (activeMode.current) rich.current?.command(action, args);
          else if (source.current) codeSelectionCommand(source.current, action);
        },
        insert: (text) => insert(text),
        selectionText: (markdown = false) => {
          if (activeMode.current) { const value = rich.current?.clipboard(); return (markdown ? value?.markdown : value?.plain) || ""; }
          const selected = source.current?.state.selection.main;
          return selected ? source.current!.state.sliceDoc(selected.from, selected.to) : "";
        },
        clearFormat: () => { if (activeMode.current && !viewOptions.current.readOnly) rich.current?.clearFormat(); },
        findNext: (back = false) => { if (activeMode.current) findNext(back); else if (source.current) (back ? cmFindPrevious : cmFindNext)(source.current); },
        undo: () => history(),
        redo: () => history(true),
        focus: focusEditor,
        richMode: () => activeMode.current,
        context: () => activeMode.current ? model.current?.nodeAt(model.current.selection.head)?.kind || "" : "source",
      }),
      [],
    );
    useEffect(() => {
      const original = initial.current;
      model.current = new MarkdownDocument(
        original.content,
        original.lineEnding || "\n",
      );
      rich.current = new RichEditor(root.current!, model.current, original.id, {
        change: publish,
        cursor: (line, column) => { callbacks.current.onCursor(line, column); callbacks.current.onSelection?.(rich.current?.clipboard().plain || ""); historyState(); },
        image: (file) => void insertImage(file),
        link: (url) =>
          void (/^(?:https?:|mailto:)/i.test(url) ? host.openLink(url) : host.openDocumentLink(original.id, url))
            .catch((error) => callbacks.current.onError(error.message)),
        compositionFinished,
      });
      setMode(requested.current);
      if (!root.current?.closest(".document-editor")?.hasAttribute("hidden")) focusEditor();
      return () => {
        if (compositionTimer.current !== null) clearTimeout(compositionTimer.current);
        rich.current?.destroy();
        source.current?.destroy();
        rich.current = null;
        source.current = null;
      };
    }, []);
    useEffect(() => {
      requested.current = rendered;
      setMode(rendered);
    }, [rendered]);
    useEffect(() => {
      if (
        !model.current ||
        model.current.toMarkdown() === record.content ||
        isComposing()
      )
        return;
      model.current.replaceExternal(record.content, record.lineEnding);
      if (activeMode.current) rich.current?.render(false);
      else {
        model.current.beginSourceSession();
        syncSource();
      }
      historyState();
    }, [record.content]);
    useEffect(() => {
      historyState();
    });
    useEffect(() => {
      applyViewOptions();
    }, [preferences?.spellcheck, preferences?.tabSize, preferences?.autoPair, preferences?.emoji, preferences?.highlight, preferences?.subscript, preferences?.superscript, preferences?.inlineMath, preferences?.remoteImages, typewriter, readOnly]);
    useLayoutEffect(() => {
      // Focus once after the mode's DOM is visible, before keyboard input.
      // A delayed frame can restore an older caret after a navigation key.
      if (!root.current?.closest(".document-editor")?.hasAttribute("hidden"))
        focusEditor();
    }, [visibleMode, active]);
    return (
      <div
        className={`editor-surface ${visibleMode ? "rich-mode" : "source-mode"}`}
      >
        {searchOpen && visibleMode && (
          <div
            className="rich-search"
            role="search"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setSearchOpen(false);
                rich.current?.restore();
              }
            }}
          >
            <div>
              <input
                ref={searchField}
                aria-label="查找内容"
                placeholder="查找"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchStatus("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    findNext(event.shiftKey);
                  }
                }}
              />
              <button onClick={() => findNext(true)} aria-label="上一个匹配">
                ↑
              </button>
              <button onClick={() => findNext()} aria-label="下一个匹配">
                ↓
              </button>
              <span role="status">{searchStatus}</span>
              {([["caseSensitive", "区分大小写"], ["wholeWord", "全词匹配"], ["regex", "正则表达式"]] as const).map(([key, label]) => <button key={key} aria-label={label} aria-pressed={searchOptions[key]} className={searchOptions[key] ? "search-option-active" : ""} onClick={() => { setSearchOptions(previous => ({ ...previous, [key]: !previous[key] })); setSearchStatus(""); }}>{key === "caseSensitive" ? "Aa" : key === "wholeWord" ? "W" : ".*"}</button>)}
              <button
                onClick={() => {
                  setSearchOpen(false);
                  rich.current?.restore();
                }}
                aria-label="关闭查找"
              >
                ×
              </button>
            </div>
            <div>
              <input
                aria-label="替换内容"
                placeholder="替换为"
                value={replacement}
                onChange={(event) => setReplacement(event.target.value)}
              />
              <button disabled={readOnly} onClick={() => replaceMatch()}>替换</button>
              <button disabled={readOnly} onClick={() => replaceMatch(true)}>全部替换</button>
            </div>
          </div>
        )}
        {editingImage && <ImageDialog image={editingImage} documentId={record.id} options={{ ...preferences }} close={() => { setEditingImage(null); rich.current?.restore(); }} submit={value => {
          const doc = model.current!; if (doc.text.slice(editingImage.from, editingImage.to) !== editingImage.source) { callbacks.current.onError("图片源码已变化，请重新选择图片。"); return; }
          doc.closeGroup(); doc.replace(editingImage.from, editingImage.to, value, "image-edit"); rich.current?.render(false); publish();
        }} />}
        <div className="rich-scroller" hidden={!visibleMode} onDoubleClick={event => {
          const image = (event.target as HTMLElement).closest("img"); if (!image || readOnly) return;
          const object = image.closest<HTMLElement>(".md-inline[data-mark='image']");
          let from: number | undefined;
          if (object) { const leaf = rich.current?.leaves.get(object.closest<HTMLElement>("[data-leaf]")?.dataset.leaf || ""); from = leaf?.positions[Number(object.dataset.inlineFrom)]; }
          const node = image.closest<HTMLElement>("[data-cid]"); if (from === undefined && node) from = model.current?.nodes.find(item => item.id === node.dataset.cid)?.from;
          const reference = imageReferences(model.current?.text || "").find(item => item.from === from);
          if (reference) { event.preventDefault(); setEditingImage(reference); }
        }} onContextMenu={event => { if ((event.target as HTMLElement).closest("img")) { event.preventDefault(); (event.target as HTMLElement).dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); } }}>
          <div className="rich-document" ref={root} />
        </div>
        <div
          className="source-surface"
          hidden={visibleMode}
          ref={sourceParent}
        />
      </div>
    );
  },
);
