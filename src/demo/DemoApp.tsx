import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Heading2, List, Table2, Undo2, Redo2, Search, Upload, Download, RotateCcw, ArrowUpRight } from "lucide-react";
import { host } from "../host";
import { InsertDialog } from "../components/InsertDialog";
import type { InsertKind } from "../components/InsertDialog";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import type { EditorHandle } from "../editor/MarkdownEditor";
import { setMarkdownOptions } from "../editor/markdown";
import { defaultPreferences } from "../preferences";
import type { DocumentRecord } from "../types";
import { samples } from "./samples";
import { decodeMarkdown, downloadName, MAX_FILE_BYTES } from "./files";
import icon from "../../design/icon.svg";

const preferences = { ...defaultPreferences, imageAutoUpload: false, remoteImages: false };
setMarkdownOptions(preferences);
const repository = "https://github.com/AniChikage/open-typora";
function documentFor(name: string, content: string): DocumentRecord {
  return { id: crypto.randomUUID(), name, content, savedContent: content, path: null, diskHash: null, lineEnding: "\n" };
}

export default function DemoApp() {
  const [record, setRecord] = useState(() => documentFor(samples[0].name, samples[0].content));
  const [sampleId, setSampleId] = useState<string>(samples[0].id);
  const [rendered, setRendered] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [insertKind, setInsertKind] = useState<InsertKind | null>(null);
  const [importing, setImporting] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const picker = useRef<HTMLInputElement>(null);
  const current = useRef(record);
  current.current = record;
  const dirty = record.content !== record.savedContent;
  const onChange = useCallback((content: string) => {
    setRecord(previous => ({ ...previous, content }));
    setNotice("");
  }, []);
  const onCursor = useCallback(() => {}, []);

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (current.current.content !== current.current.savedContent) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        downloadCurrent();
      }
    };
    window.addEventListener("beforeunload", leave);
    window.addEventListener("keydown", shortcut);
    return () => {
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("keydown", shortcut);
    };
  }, []);

  function ready() {
    if (editor.current?.composing()) {
      setError("Finish your current input before changing or downloading the document.");
      return false;
    }
    return true;
  }
  function canReplace() {
    return ready() && (current.current.content === current.current.savedContent || window.confirm("Replace this document? Download your Markdown first if you want to keep these edits."));
  }
  function selectSample(id: string) {
    const sample = samples.find(item => item.id === id);
    if (!sample || !canReplace()) return;
    setSampleId(id);
    setRecord(documentFor(sample.name, sample.content));
    setError(""); setNotice("");
  }
  async function importFile(file?: File) {
    if (!file || !ready()) return;
    // Capture identity so a delayed file read cannot overwrite a newer document.
    const previous = current.current;
    setImporting(true); setError("");
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("This demo accepts files up to 1 MB. Use the desktop app for larger files.");
      const content = decodeMarkdown(new Uint8Array(await file.arrayBuffer()), file.name);
      if (current.current.id !== previous.id || !canReplace()) return;
      setRecord(documentFor(file.name, content));
      setSampleId("");
      setNotice("Opened in this tab. Your original file is unchanged.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setImporting(false); }
  }
  function downloadCurrent() {
    if (!ready()) return;
    const latest = current.current;
    const url = URL.createObjectURL(new Blob([latest.content], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = downloadName(latest.name);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setNotice("Download started. Check your Downloads folder for the Markdown file.");
  }
  function command(action: string) {
    if (!ready()) return;
    if (action === "bold") editor.current?.wrap("**", "**");
    else if (action === "italic") editor.current?.wrap("*", "*");
    else if (action === "undo") editor.current?.undo();
    else if (action === "redo") editor.current?.redo();
    else if (action === "find") editor.current?.find();
    else if (["table", "link", "footnote", "reference-link"].includes(action)) setInsertKind(action as InsertKind);
    else if (action === "source") setRendered(previous => !previous);
    else if (action === "clear-format") editor.current?.clearFormat();
    else if (action === "code") editor.current?.codeBlock();
    else if (action === "pagebreak") editor.current?.insert("\n\n<!-- pagebreak -->\n\n");
    else if (action === "image") {
      const id = current.current.id;
      void host.chooseImage(id).then(image => { if (image && current.current.id === id) editor.current?.insert(`![${image.alt.replace(/[\[\]]/g, "")}](${image.path})`); }).catch(error => setError(error.message));
    } else if (["underline", "strike", "inline-code", "highlight"].includes(action)) {
      const marks: Record<string, [string, string]> = { underline: ["<u>", "</u>"], strike: ["~~", "~~"], "inline-code": ["`", "`"], highlight: ["==", "=="] };
      editor.current?.wrap(...marks[action]);
    }
    else editor.current?.command(action);
  }

  return <div className="demo-shell">
    {insertKind && <InsertDialog kind={insertKind} selected={editor.current?.selectionText() || ""} close={() => { setInsertKind(null); editor.current?.focus(); }} submit={value => {
      if (insertKind === "link") editor.current?.insert(`[${(value.label || value.value || "链接").replace(/[\[\]]/g, character => "\\" + character)}](${value.value})`);
      else editor.current?.command(insertKind, value);
      setInsertKind(null); editor.current?.focus();
    }} />}
    <header className="demo-header">
      <a className="demo-brand" href={repository} target="_blank" rel="noreferrer"><img src={icon} alt="" width="36" height="36" /><span>Open Typora</span></a>
      <span className="demo-label">WEB DEMO</span>
      <nav aria-label="Project"><a href={repository} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={14} /></a><a className="desktop-link" href={`${repository}/releases/latest`} target="_blank" rel="noreferrer">Get the desktop app <ArrowUpRight size={14} /></a></nav>
    </header>
    <div className="demo-intro"><p>A clear page. Yours to write.</p><span>No install. No account. Just Markdown.</span></div>
    <main className="demo-workspace" aria-label="Markdown writing workspace">
      <div className="demo-controls">
        <label className="sample-picker"><span className="sr-only">Example document</span><select aria-label="Example document" value={sampleId} disabled={importing} onChange={event => selectSample(event.target.value)}>
          {!sampleId && <option value="">{record.name}</option>}
          {samples.map(sample => <option key={sample.id} value={sample.id}>{sample.label}</option>)}
        </select></label>
        <div className="mode-switch" role="group" aria-label="Editor mode"><button aria-pressed={rendered} onClick={() => setRendered(true)}>Live</button><button aria-pressed={!rendered} onClick={() => setRendered(false)}>Source</button></div>
        <div className="file-actions"><button onClick={() => { if (ready()) picker.current?.click(); }} disabled={importing}><Upload size={16} /><span>{importing ? "Opening…" : "Open .md"}</span></button><button className="download-button" onClick={downloadCurrent}><Download size={16} /><span>Download .md</span></button></div>
        <input ref={picker} type="file" accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void importFile(file); }} />
      </div>
      <div className="demo-formatbar" role="toolbar" aria-label="Formatting">
        <div className="format-tools">
          {([["bold", "Bold", Bold], ["italic", "Italic", Italic], ["heading-2", "Heading 2", Heading2], ["unordered-list", "Bullet list", List], ["table", "Insert table", Table2]] as const).map(([action, label, Icon]) => <button key={action} title={!rendered && !["bold", "italic"].includes(action) ? `${label} — switch to Live to use this tool` : label} disabled={!rendered && !["bold", "italic"].includes(action)} aria-label={label} onMouseDown={event => event.preventDefault()} onClick={() => command(action)}><Icon size={17} strokeWidth={1.6} /></button>)}
          <span className="tool-divider" />
          <button title="Undo" aria-label="Undo" onClick={() => command("undo")}><Undo2 size={17} strokeWidth={1.6} /></button><button title="Redo" aria-label="Redo" onClick={() => command("redo")}><Redo2 size={17} strokeWidth={1.6} /></button><button title="Find in document" aria-label="Find in document" onClick={() => command("find")}><Search size={17} strokeWidth={1.6} /></button>
        </div>
        <button className="reset-button" onClick={() => selectSample(sampleId || "welcome")} disabled={importing}><RotateCcw size={14} />Reset</button>
      </div>
      {error && <div className="demo-error" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}>×</button></div>}
      <div className="demo-editor document-editor">
        <MarkdownEditor key={record.id} ref={editor} document={record} rendered={rendered} preferences={preferences} onChange={onChange} onError={setError} onCursor={onCursor} onCommand={command} />
      </div>
      <footer className="demo-status"><span className="file-name">{record.name}<span className={dirty ? "edit-dot edited" : "edit-dot"} aria-label={dirty ? "Edited in this tab" : "Original document"} /></span><span role="status">{notice || "Stays in this tab · Download to keep your work"}</span><span className="character-count">{Array.from(record.content).length.toLocaleString()} characters</span></footer>
    </main>
    <footer className="demo-footer"><span>Early preview · Same editor as the desktop app</span><span>UTF-8 files up to 1 MB · External media blocked · Refresh clears edits</span><a href={`${repository}/issues/new/choose`} target="_blank" rel="noreferrer">Report a problem <ArrowUpRight size={12} /></a></footer>
  </div>;
}
