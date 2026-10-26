import { memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Plus, X, Columns2, Rows2, ArrowLeftRight } from "lucide-react";
import { MarkdownEditor } from "../editor/MarkdownEditor";
import type { EditorHandle } from "../editor/MarkdownEditor";
import type { DocumentRecord } from "../types";
import type { Preferences } from "../preferences";
import type { WorkspaceLayout } from "../workspace";
import { ContextMenu } from "./ContextMenu";
import type { ContextMenuEntry } from "./ContextMenu";
import { tabCloseTargets } from "../tabActions";
import type { TabCloseKind } from "../tabActions";

interface EditorProps {
  record: DocumentRecord;
  active: boolean;
  visible: boolean;
  slot: "primary" | "secondary";
  split: boolean;
  rendered: boolean;
  readOnly: boolean;
  preferences: Preferences;
  typewriter: boolean;
  select(id: string): boolean;
  register(id: string, handle: EditorHandle | null): void;
  change(id: string, text: string): void;
  error(text: string): void;
  cursor(id: string, line: number, column: number): void;
  selection(id: string, text: string): void;
  compositionEnd(id: string): void;
  mode(id: string, rendered: boolean): void;
  closePane(id: string): void;
  command(id: string, action: string): void;
}
const DocumentView = memo(function DocumentView(props: EditorProps) {
  const { record, active, visible, slot, split } = props;
  const register = useCallback((handle: EditorHandle | null) => props.register(record.id, handle), [props.register, record.id]);
  return <section id={`document-${record.id}`} role="tabpanel" aria-label={record.name} className={`document-editor workspace-document ${slot}`} data-document-id={record.id} data-active={active} hidden={!visible}
    onPointerDownCapture={event => { if (!active && !props.select(record.id)) event.preventDefault(); }}
    onFocusCapture={() => { if (!active) props.select(record.id); }}>
    {split && <div className={`pane-heading ${active ? "active" : ""}`} onPointerDown={() => props.select(record.id)}>
      <span title={record.path || record.name}>{record.name}{record.content !== record.savedContent ? " •" : ""}</span>
      <button className="pane-mode" aria-label={`${record.name} ${props.rendered ? "切换源码" : "切换即时渲染"}`} onClick={() => { if (props.select(record.id)) props.mode(record.id, !props.rendered); }}>{props.rendered ? "源码" : "即时渲染"}</button>
      <button className="icon-button" aria-label={`关闭${slot === "primary" ? "第一个" : "第二个"}窗格`} title="关闭此窗格，保留文档" onClick={() => props.closePane(record.id)}><X size={14} /></button>
    </div>}
    <MarkdownEditor key={`${record.id}-${record.lineEnding}`} ref={register} document={record} rendered={props.rendered} active={active} readOnly={props.readOnly} preferences={props.preferences} typewriter={props.typewriter}
      onChange={text => props.change(record.id, text)} onError={props.error} onCursor={(line,column) => props.cursor(record.id,line,column)} onSelection={text => props.selection(record.id,text)} onCompositionEnd={() => props.compositionEnd(record.id)} onCommand={action => props.command(record.id, action)} />
  </section>;
});
interface Props extends Omit<EditorProps, "record" | "active" | "visible" | "slot" | "split" | "rendered"> {
  documents: DocumentRecord[];
  activeId: string;
  layout: WorkspaceLayout | null;
  modes: Record<string, boolean>;
  create(): void;
  close(id: string): void;
  reorder(source: string, target: string): void;
  split(direction: "columns" | "rows"): void;
  swap(): void;
  resize(ratio: number): void;
  autosave: boolean;
  tabAction(id: string, action: string): void;
  composing(): boolean;
}
export function EditorWorkspace(props: Props) {
  const tabs = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), visited = useRef(new Set<string>());
  const layout = props.layout;
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; origin: HTMLElement } | null>(null);
  const record = props.documents.find(record => record.id === menu?.id);
  function openMenu(id: string, origin: HTMLElement, x?: number, y?: number) {
    if (props.composing()) { props.error("请先完成当前输入法组合输入，再打开标签页菜单。"); return; }
    const rect = origin.getBoundingClientRect();
    setMenu({ id, origin, x: x || rect.left + 12, y: y || rect.bottom });
  }
  const menuItems: ContextMenuEntry[] = record ? [
    { id: "save", label: "保存" }, { id: "saveAs", label: "另存为…" }, { id: "save-all", label: "保存全部" }, null,
    { id: "close", label: "关闭标签页" },
    ...([["left", "关闭左侧标签页"], ["right", "关闭右侧标签页"], ["others", "关闭其他标签页"], ["saved", "关闭所有已保存标签页"], ["all", "关闭全部标签页"]] as const).map(([kind, label]) => ({ id: `close-${kind}`, label, disabled: !tabCloseTargets(props.documents, record.id, kind as TabCloseKind).length })),
    { id: "close-all-save", label: "保存并关闭全部标签页" }, null,
    { id: "copy-name", label: "复制文件名（含扩展名）" }, { id: "copy-stem", label: "复制文件名（不含扩展名）" },
    { id: "copy-path", label: "复制完整路径", disabled: !record.path }, { id: "copy-quoted-path", label: "复制带引号完整路径", disabled: !record.path }, { id: "copy-directory", label: "复制所在文件夹路径", disabled: !record.path }, null,
    { id: "reveal", label: "在文件管理器中显示", disabled: !record.path }, { id: "open-directory", label: "打开所在文件夹", disabled: !record.path }, { id: "rename", label: "重命名文件…", disabled: !record.path }, null,
    { id: "split-right", label: "向右拆分编辑器" }, { id: "split-down", label: "向下拆分编辑器" },
    { id: "close-pane", label: "关闭此窗格", disabled: !layout || (layout.primaryId !== record.id && layout.secondaryId !== record.id) },
    { id: "outline", label: "显示大纲" }, { id: "autosave", label: "自动保存已有文件", checked: props.autosave },
  ] : [];
  const visible = new Set(layout ? [layout.primaryId,layout.secondaryId] : [props.activeId]);
  for (const id of visible) visited.current.add(id);
  const ids = new Set(props.documents.map(record => record.id));
  for (const id of visited.current) if (!ids.has(id)) visited.current.delete(id);
  useLayoutEffect(() => { tabs.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:"nearest",inline:"nearest"}); }, [props.activeId]);
  function tabKey(event: KeyboardEvent, index: number) {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) { event.preventDefault(); event.stopPropagation(); openMenu(props.documents[index].id, event.currentTarget as HTMLElement); return; }
    const count = props.documents.length;
    if (event.key === "Delete") { event.preventDefault(); props.close(props.documents[index].id); return; }
    if (!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (index + (event.key === "ArrowRight" ? 1 : count - 1)) % count;
    if (event.altKey) props.reorder(props.documents[index].id,props.documents[next].id);
    else if (props.select(props.documents[next].id)) requestAnimationFrame(() => tabs.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${props.documents[next].id}"]`)?.focus());
  }
  const grid: CSSProperties = layout ? layout.direction === "columns" ? { gridTemplateColumns: `${layout.ratio}fr 6px ${1-layout.ratio}fr` } : {gridTemplateRows:`${layout.ratio}fr 6px ${1-layout.ratio}fr`} : {};
  return <div className="editor-workspace">
    <div className="workspace-bar">
      <div className="document-tabs" ref={tabs} role="tablist" aria-label="文档标签">
        {props.documents.map((record,index) => <div className={`document-tab ${record.id === props.activeId ? "selected" : ""} ${visible.has(record.id) ? "visible-pane" : ""}`} key={record.id}
          onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openMenu(record.id, event.currentTarget.querySelector<HTMLElement>('[role="tab"]')!, event.clientX, event.clientY); }}
          onDragOver={event => { if (event.dataTransfer.types.includes("application/x-open-typora-tab")) event.preventDefault(); }} onDrop={event => { const id=event.dataTransfer.getData("application/x-open-typora-tab"); if(id){event.preventDefault();props.reorder(id,record.id);} }}>
          <button role="tab" aria-selected={record.id === props.activeId} aria-controls={`document-${record.id}`} aria-label={record.name} title={`${record.path || record.name}${record.content !== record.savedContent ? " · 未保存" : ""}`} tabIndex={record.id === props.activeId ? 0 : -1} data-tab-id={record.id} draggable
            onDragStart={event => {if(!props.select(record.id)){event.preventDefault();return;} event.dataTransfer.setData("application/x-open-typora-tab",record.id);event.dataTransfer.effectAllowed="move";}}
            onMouseDown={event => {if(event.button===0)event.preventDefault();}} onClick={() => props.select(record.id)} onAuxClick={event => {if(event.button===1){event.preventDefault();props.close(record.id);}}} onKeyDown={event => tabKey(event,index)}>
            <span>{record.name}</span>{record.content !== record.savedContent && <span className="tab-dirty" aria-hidden="true">•</span>}
          </button><button className="tab-close" aria-label={`关闭标签 ${record.name}`} title="关闭标签" onClick={() => props.close(record.id)}><X size={12} /></button>
        </div>)}
      </div>
      <div className="workspace-actions">
        <button className="icon-button" aria-label="新建标签页" title="新建标签页" onClick={props.create}><Plus size={16} /></button>
        <button className="icon-button" aria-label="左右分屏" title="左右分屏" aria-pressed={layout?.direction === "columns"} onClick={() => props.split("columns")}><Columns2 size={16} /></button>
        <button className="icon-button" aria-label="上下分屏" title="上下分屏" aria-pressed={layout?.direction === "rows"} onClick={() => props.split("rows")}><Rows2 size={16} /></button>
        {layout && <button className="icon-button" aria-label="交换窗格" title="交换窗格" onClick={props.swap}><ArrowLeftRight size={15} /></button>}
      </div>
    </div>
    <div ref={body} className={`workspace-body ${layout ? `split-${layout.direction}` : ""}`} style={grid}>
      {props.documents.filter(record => visited.current.has(record.id)).map(record => <DocumentView key={record.id} record={record} active={record.id === props.activeId} visible={visible.has(record.id)} slot={layout?.secondaryId === record.id ? "secondary" : "primary"} split={!!layout} rendered={props.modes[record.id] !== false} readOnly={props.readOnly} preferences={props.preferences} typewriter={props.typewriter}
        select={props.select} register={props.register} change={props.change} error={props.error} cursor={props.cursor} selection={props.selection} compositionEnd={props.compositionEnd} mode={props.mode} closePane={props.closePane} command={props.command} />)}
      {layout && <div className="pane-divider" role="separator" aria-label="调整分屏比例" aria-orientation={layout.direction === "columns" ? "vertical" : "horizontal"} aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(layout.ratio*100)} tabIndex={0}
        onDoubleClick={() => props.resize(.5)} onKeyDown={event => { if(["ArrowLeft","ArrowUp","ArrowRight","ArrowDown","Home","End"].includes(event.key)){event.preventDefault();props.resize(event.key==="Home"?.2:event.key==="End"?.8:layout.ratio+(["ArrowRight","ArrowDown"].includes(event.key)?.05:-.05));} }}
        onPointerDown={event => {if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);}}
        onPointerMove={event => {if(!event.currentTarget.hasPointerCapture(event.pointerId)||!body.current)return; const rect=body.current.getBoundingClientRect();props.resize(layout.direction==="columns"?(event.clientX-rect.left)/rect.width:(event.clientY-rect.top)/rect.height);}}
        onPointerUp={event => {if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} />}
    </div>
    {menu && record && <ContextMenu label="标签页菜单" x={menu.x} y={menu.y} items={menuItems} close={reason => { setMenu(null); if (reason === "cancel" && menu.origin.isConnected) menu.origin.focus({ preventScroll: true }); }} action={action => { if (menu.origin.isConnected) menu.origin.focus({ preventScroll: true }); props.tabAction(menu.id, action); }} />}
  </div>;
}
