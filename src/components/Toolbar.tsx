import {
  PanelLeft,
  MoreHorizontal,
  Check,
  FilePlus2,
  FolderOpen,
  FileOutput,
  Search,
  ScanLine,
  Copy,
  Save,
  Bold,
  Italic,
  Code2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
interface Props {
  name: string;
  rendered: boolean;
  setRendered(value: boolean): void;
  sidebar(): void;
  save(): void;
  command(action: string): void;
  autosave: boolean;
  native: boolean;
  disabled: boolean;
}
export function Toolbar(props: Props) {
  const [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);
  const items = [
    { action: "new", icon: FilePlus2, label: "新建文档", shortcut: "⌘ N" },
    { action: "open", icon: FolderOpen, label: "打开文件", shortcut: "⌘ O" },
    { action: "saveAs", icon: Copy, label: "另存为…", shortcut: "⇧ ⌘ S" },
    { action: "find", icon: Search, label: "查找与替换", shortcut: "⌘ F" },
    { action: "bold", icon: Bold, label: "粗体", shortcut: "⌘ B" },
    { action: "italic", icon: Italic, label: "斜体", shortcut: "⌘ I" },
    { action: "code", icon: Code2, label: "代码块", shortcut: "" },
    { action: "focus", icon: ScanLine, label: "专注模式", shortcut: "⇧ ⌘ F" },
    { action: "pdf", icon: FileOutput, label: "导出 PDF", shortcut: "" },
  ];
  return (
    <header className="toolbar">
      <div className="titlebar-left">
        {!props.native && (
          <div className="traffic-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )}
        <button
          className="icon-button sidebar-toggle"
          title="切换侧栏"
          aria-label="切换侧栏"
          onClick={props.sidebar}
        >
          <PanelLeft size={17} />
        </button>
      </div>
      <span className="document-title" title={props.name}>
        {props.name || "Open Typora"}
      </span>
      <div className="toolbar-actions">
        <div className="mode-switch" role="group" aria-label="编辑模式">
          <button
            aria-label="即时渲染"
            aria-pressed={props.rendered}
            onClick={() => props.setRendered(true)}
          >
            即时渲染
          </button>
          <button
            aria-label="源码"
            aria-pressed={!props.rendered}
            onClick={() => props.setRendered(false)}
          >
            源码
          </button>
        </div>
        <button
          className="save-button"
          aria-label="保存"
          disabled={props.disabled}
          onClick={props.save}
        >
          <Save className="mobile-save-icon" size={16} />
          <span>保存</span>
        </button>
        <div className="menu-container" ref={root}>
          <button
            className="icon-button"
            aria-label="更多操作"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <MoreHorizontal size={20} />
          </button>
          {open && (
            <div className="more-menu" role="menu">
              {items.map(({ action, icon: Icon, label, shortcut }) => (
                <button
                  role="menuitem"
                  aria-label={label}
                  key={action}
                  onClick={() => {
                    setOpen(false);
                    props.command(action);
                  }}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                  <kbd aria-hidden="true">{shortcut}</kbd>
                </button>
              ))}
              <div className="menu-divider" />
              <button
                role="menuitemcheckbox"
                aria-checked={props.autosave}
                onClick={() => props.command("autosave")}
              >
                <span className="menu-check">
                  {props.autosave && <Check size={16} />}
                </span>
                <span>自动保存已有文件</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  props.command("about");
                }}
              >
                <span className="menu-check" />
                <span>关于 Open Typora</span>
                <kbd>0.1.0</kbd>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
