import type { EditorView } from "@codemirror/view";
import { EditorView as View } from "@codemirror/view";
import { selectParentSyntax } from "@codemirror/commands";

export const selectionActions = new Set(["select-word", "delete-word", "select-line", "select-scope", "jump-selection"]);
export function wordRange(text: string, position: number) {
  const at = Math.max(0, Math.min(text.length, position));
  let part: Intl.SegmentData | undefined;
  for (const segment of new Intl.Segmenter(undefined, {granularity:"word"}).segment(text)) {
    if (segment.index > at) break;
    if (segment.isWordLike && segment.index <= at && segment.index + segment.segment.length >= at) { part = segment; break; }
    if (segment.index <= at && segment.index + segment.segment.length > at) part = segment;
  }
  return part ? {from:part.index,to:part.index+part.segment.length} : {from:at,to:at};
}
export function codeSelectionCommand(view: EditorView, action: string) {
  if (!selectionActions.has(action)) return false;
  const selected = view.state.selection.main;
  if (action === "jump-selection") {
    view.dispatch({effects:View.scrollIntoView(selected.head,{y:"center"})}); view.focus(); return true;
  }
  if (action === "delete-word" && view.state.readOnly) return true;
  if (action === "select-scope" && selectParentSyntax(view)) { view.focus(); return true; }
  let from = selected.from, to = selected.to;
  if (action === "select-line" || action === "select-scope") {
    from = view.state.doc.lineAt(from).from;
    to = view.state.doc.lineAt(to > from && view.state.doc.lineAt(to).from === to ? to-1 : to).to;
  } else if (action === "select-word" || selected.empty) {
    const line = view.state.doc.lineAt(selected.head), word = wordRange(line.text,selected.head-line.from);
    from = line.from+word.from; to = line.from+word.to;
  }
  if (action === "delete-word") view.dispatch({changes:{from,to,insert:""},selection:{anchor:from},userEvent:"delete.word"});
  else view.dispatch({selection:{anchor:from,head:to},scrollIntoView:true});
  view.focus(); return true;
}
