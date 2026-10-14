import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  dropCursor,
  highlightActiveLine,
} from "@codemirror/view";
import {
  history,
  historyKeymap,
  defaultKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { livePreview, setRendered } from "./livePreview";
import { host } from "../host";
import type { DocumentRecord } from "../types";
export interface EditorHandle {
  view(): EditorView | null;
  find(): void;
  jump(line: number): void;
  wrap(before: string, after?: string): void;
}
interface Props {
  document: DocumentRecord;
  rendered: boolean;
  onChange(content: string): void;
  onError(error: string): void;
  onCursor(line: number, column: number): void;
}
export const MarkdownEditor = forwardRef<EditorHandle, Props>(
  function MarkdownEditor(
    { document: record, rendered, onChange, onError, onCursor },
    ref,
  ) {
    const parent = useRef<HTMLDivElement>(null),
      view = useRef<EditorView | null>(null);
    const callbacks = useRef({ onChange, onError, onCursor });
    callbacks.current = { onChange, onError, onCursor };
    const initial = useRef(record),
      compartment = useRef(new Compartment());
    useImperativeHandle(
      ref,
      () => ({
        view: () => view.current,
        find: () => {
          if (view.current) {
            openSearchPanel(view.current);
          }
        },
        jump: (line) => {
          const editor = view.current;
          if (!editor) return;
          const target = editor.state.doc.line(
            Math.min(line, editor.state.doc.lines),
          );
          editor.dispatch({
            selection: { anchor: target.from },
            effects: EditorView.scrollIntoView(target.from, {
              y: "start",
              yMargin: 30,
            }),
          });
          editor.focus();
        },
        wrap: (before, after = "") => {
          const editor = view.current;
          if (!editor) return;
          const { from, to } = editor.state.selection.main;
          const selected = editor.state.sliceDoc(from, to);
          editor.dispatch({
            changes: { from, to, insert: before + selected + after },
            selection: {
              anchor: from + before.length,
              head: from + before.length + selected.length,
            },
          });
          editor.focus();
        },
      }),
      [],
    );
    useEffect(() => {
      const doc = initial.current;
      const editor = new EditorView({
        parent: parent.current!,
        state: EditorState.create({
          doc: doc.content,
          selection: { anchor: doc.content.replace(/\r\n/g, "\n").length },
          extensions: [
            EditorState.lineSeparator.of(doc.lineEnding || "\n"),
            history(),
            drawSelection(),
            dropCursor(),
            EditorView.lineWrapping,
            markdown({ base: markdownLanguage }),
            syntaxHighlighting(defaultHighlightStyle),
            bracketMatching(),
            indentOnInput(),
            keymap.of([
              ...defaultKeymap,
              ...historyKeymap,
              ...searchKeymap,
              indentWithTab,
            ]),
            search({ top: true }),
            compartment.current.of(rendered ? [] : [highlightActiveLine()]),
            livePreview(doc.id),
            EditorView.contentAttributes.of({
              "aria-label": "Markdown 编辑器",
              spellcheck: "false",
              autocapitalize: "off",
            }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged)
                callbacks.current.onChange(update.state.sliceDoc());
              if (update.selectionSet || update.docChanged) {
                const line = update.state.doc.lineAt(
                  update.state.selection.main.head,
                );
                callbacks.current.onCursor(
                  line.number,
                  update.state.selection.main.head - line.from + 1,
                );
              }
            }),
            EditorView.domEventHandlers({
              paste(event, current) {
                const file = [...(event.clipboardData?.files || [])].find(
                  (file) => file.type.startsWith("image/"),
                );
                if (!file) return false;
                event.preventDefault();
                void insertImage(file, current);
                return true;
              },
              drop(event, current) {
                const file = [...(event.dataTransfer?.files || [])].find(
                  (file) => file.type.startsWith("image/"),
                );
                if (!file) return false;
                event.preventDefault();
                void insertImage(file, current);
                return true;
              },
            }),
          ],
        }),
      });
      view.current = editor;
      if (!rendered) editor.dispatch({ effects: setRendered.of(false) });
      async function insertImage(file: File, current: EditorView) {
        try {
          const relative = await host.importImage(
            doc.id,
            new Uint8Array(await file.arrayBuffer()),
            file.name,
          );
          const selection = current.state.selection.main;
          current.dispatch({
            changes: {
              from: selection.from,
              to: selection.to,
              insert: `![${file.name.replace(/[\[\]]/g, "")}](${relative})`,
            },
          });
        } catch (error) {
          callbacks.current.onError((error as Error).message);
        }
      }
      return () => {
        view.current = null;
        editor.destroy();
      };
    }, []);
    useEffect(() => {
      const editor = view.current;
      if (!editor) return;
      editor.dispatch({
        effects: [
          setRendered.of(rendered),
          compartment.current.reconfigure(
            rendered ? [] : [highlightActiveLine()],
          ),
        ],
      });
    }, [rendered]);
    useEffect(() => {
      const editor = view.current;
      if (!editor || editor.state.sliceDoc() === record.content) return;
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: record.content,
        },
        selection: { anchor: 0 },
      });
    }, [record.content]);
    return (
      <div
        className={`editor-surface ${rendered ? "live-mode" : "source-mode"}`}
        ref={parent}
      />
    );
  },
);
