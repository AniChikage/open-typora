import {
  forwardRef,
  useEffect,
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
}
interface Props {
  document: DocumentRecord;
  rendered: boolean;
  preferences?: Preferences;
  typewriter?: boolean;
  onChange(content: string): void;
  onError(error: string): void;
  onCursor(line: number, column: number): void;
  onSelection?(text: string): void;
}
export const MarkdownEditor = forwardRef<EditorHandle, Props>(
  function MarkdownEditor(
    { document: record, rendered, preferences, typewriter = false, onChange, onError, onCursor, onSelection },
    ref,
  ) {
    const root = useRef<HTMLDivElement>(null),
      sourceParent = useRef<HTMLDivElement>(null);
    const model = useRef<MarkdownDocument | null>(null),
      rich = useRef<RichEditor | null>(null),
      source = useRef<EditorView | null>(null);
    const callbacks = useRef({ onChange, onError, onCursor, onSelection });
    callbacks.current = { onChange, onError, onCursor, onSelection };
    const initial = useRef(record),
      requested = useRef(rendered),
      activeMode = useRef(rendered);
    const [visibleMode, setVisibleMode] = useState(
      rendered && record.content.length <= 300_000,
    );
    const [searchOpen, setSearchOpen] = useState(false),
      [query, setQuery] = useState(""),
      [replacement, setReplacement] = useState("");
    const [searchStatus, setSearchStatus] = useState("");
    const searchField = useRef<HTMLInputElement>(null);
    const searchTerms = useRef({ query, replacement }); searchTerms.current = { query, replacement };
    const syncing = useRef(false);
    const sourceBehavior = useRef(new Compartment());
    const sourceOptions = () => [indentUnit.of(" ".repeat(viewOptions.current.preferences?.tabSize || 2)), ...(viewOptions.current.preferences?.autoPair ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [])];
    const viewOptions = useRef({ preferences, typewriter });
    viewOptions.current = { preferences, typewriter };
    function historyState() {
      if (root.current?.closest(".document-editor")?.hasAttribute("hidden"))
        return;
      if (model.current && window.desktop?.historyState)
        void window.desktop
          .historyState(
            model.current.canUndo,
            model.current.canRedo,
            activeMode.current,
            model.current.nodeAt(model.current.selection.head)?.kind || "",
          )
          .catch(() => {});
    }
    function focusEditor() {
      if (activeMode.current) rich.current?.restore();
      else source.current?.focus();
    }
    const publish = () => {
      callbacks.current.onChange(model.current!.toMarkdown());
      historyState();
    };
    function findNext(back = false) {
      const doc = model.current;
      const query = searchTerms.current.query;
      if (!doc || !query) return;
      const start = back
        ? Math.min(doc.selection.anchor, doc.selection.head) - 1
        : Math.max(doc.selection.anchor, doc.selection.head);
      let at = back
        ? doc.text.lastIndexOf(query, start)
        : doc.text.indexOf(query, start);
      if (at < 0)
        at = back ? doc.text.lastIndexOf(query) : doc.text.indexOf(query);
      if (at < 0) {
        setSearchStatus("未找到匹配内容");
        return;
      }
      rich.current?.select({ anchor: at, head: at + query.length }, false);
      setSearchStatus(
        `${doc.text.slice(0, at).split(query).length} / ${doc.text.split(query).length - 1}`,
      );
    }
    function replaceMatch(all = false) {
      const doc = model.current;
      if (!doc || !query) return;
      rich.current?.releaseFence();
      if (all) {
        const count = doc.text.split(query).length - 1;
        if (!count) {
          setSearchStatus("未找到匹配内容");
          return;
        }
        doc.closeGroup();
        doc.replace(
          0,
          doc.text.length,
          doc.text.split(query).join(replacement),
          "replace-all",
          { anchor: 0, head: 0 },
        );
        rich.current?.render(false);
        publish();
        setSearchStatus(`已替换 ${count} 处`);
        return;
      }
      const from = Math.min(doc.selection.anchor, doc.selection.head),
        to = Math.max(doc.selection.anchor, doc.selection.head);
      if (doc.text.slice(from, to) !== query) {
        findNext();
        return;
      }
      doc.replace(from, to, replacement, "replace");
      rich.current?.render(false);
      publish();
      findNext();
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
    async function insertImage(file: File) {
      try {
        const relative = await host.importImage(
          initial.current.id,
          new Uint8Array(await file.arrayBuffer()),
          file.name,
        );
        insert(`![${file.name.replace(/[\[\]]/g, "")}](${relative})`, "paste");
      } catch (error) {
        callbacks.current.onError((error as Error).message);
      }
    }
    function insert(text: string, kind = "command") {
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
                const kind = update.transactions.some((t) =>
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
                doc.closeGroup();
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
                const image = [...(event.clipboardData?.files || [])].find(
                  (file) => file.type.startsWith("image/"),
                );
                if (!image) return false;
                event.preventDefault();
                void insertImage(image);
                return true;
              },
              drop(event) {
                const image = [...(event.dataTransfer?.files || [])].find(
                  (file) => file.type.startsWith("image/"),
                );
                if (!image) return false;
                event.preventDefault();
                void insertImage(image);
                return true;
              },
              compositionend() {
                queueMicrotask(() => {
                  doc.closeGroup();
                  setMode(requested.current);
                });
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
      if (rich.current?.composing || source.current?.composing) return;
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
      const changed = activeMode.current !== value;
      activeMode.current = value;
      setVisibleMode(value);
      historyState();
      if (changed)
        requestAnimationFrame(() => {
          if (value) rich.current?.restore();
          else source.current?.focus();
        });
    }
    useImperativeHandle(
      ref,
      () => ({
        view: () => source.current,
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
          if (activeMode.current) rich.current?.codeBlock();
        },
        command: (action, args) => { if (activeMode.current) rich.current?.command(action, args); },
        insert: (text) => insert(text),
        selectionText: (markdown = false) => {
          if (activeMode.current) { const value = rich.current?.clipboard(); return (markdown ? value?.markdown : value?.plain) || ""; }
          const selected = source.current?.state.selection.main;
          return selected ? source.current!.state.sliceDoc(selected.from, selected.to) : "";
        },
        clearFormat: () => { if (activeMode.current) rich.current?.clearFormat(); },
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
        compositionFinished: () => setMode(requested.current),
      });
      setMode(requested.current);
      return () => {
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
        rich.current?.composing
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
      if (rich.current) {
        rich.current.setOptions({ spellcheck: preferences?.spellcheck ?? false, tabSize: preferences?.tabSize || 2, typewriter, autoPair: preferences?.autoPair ?? false });
        model.current?.refreshCaret(); rich.current.render(false);
      }
      if (source.current) source.current.contentDOM.spellcheck = preferences?.spellcheck ?? false;
      source.current?.dispatch({ effects: sourceBehavior.current.reconfigure(sourceOptions()) });
      if (typewriter && source.current && !activeMode.current) source.current.dispatch({ effects: EditorView.scrollIntoView(source.current.state.selection.main.head, { y: "center" }) });
    }, [preferences, typewriter]);
    useEffect(() => {
      if (!root.current?.closest(".document-editor")?.hasAttribute("hidden"))
        focusEditor();
    }, [visibleMode]);
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
              <button onClick={() => replaceMatch()}>替换</button>
              <button onClick={() => replaceMatch(true)}>全部替换</button>
            </div>
          </div>
        )}
        <div className="rich-scroller" hidden={!visibleMode}>
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
