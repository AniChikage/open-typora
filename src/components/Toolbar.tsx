import { t } from "../i18n";
import {
  Sparkles,
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
import { commandGroups, commandKey, shortcutLabel } from "../commands";
import { version } from "../../package.json";
interface Props {
  name: string;
  edited: boolean;
  rendered: boolean;
  setRendered(value: boolean): void;
  sidebar(): void;
  command(action: string): void;
  autosave: boolean;
  disabled: boolean;
  context: string;
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
    { action: "new", icon: FilePlus2, label: t("新建文档"), shortcut: shortcutLabel("Mod-N") },
    { action: "open", icon: FolderOpen, label: t("打开文件"), shortcut: shortcutLabel("Mod-O") },
    { action: "save", icon: Save, label: t("保存"), shortcut: shortcutLabel("Mod-S") },
    { action: "saveAs", icon: Copy, label: t("另存为…"), shortcut: shortcutLabel("Mod-Shift-S") },
    { action: "find", icon: Search, label: t("查找与替换"), shortcut: shortcutLabel("Mod-F") },
    { action: "bold", icon: Bold, label: t("粗体"), shortcut: shortcutLabel("Mod-B") },
    { action: "italic", icon: Italic, label: t("斜体"), shortcut: shortcutLabel("Mod-I") },
    { action: "code", icon: Code2, label: t("代码块"), shortcut: "" },
    { action: "focus", icon: ScanLine, label: t("专注模式"), shortcut: "F8" },
    { action: "pdf", icon: FileOutput, label: t("导出 PDF"), shortcut: "" },
  ];
  return (
    <>
      <header className="toolbar">
        <span className="document-title" title={props.name}>
          {props.name || "Open Typora"}
          {props.edited && <span className="title-edited">{t("— 已编辑")}</span>}
        </span>
      </header>
      <div className="quick-actions" aria-label={t("编辑操作")}>
        <button
          className="icon-button sidebar-toggle"
          title={t("切换侧栏")}
          aria-label={t("切换侧栏")}
          onClick={props.sidebar}
        >
          <PanelLeft size={17} />
        </button>
        <button
          className="icon-button source-toggle"
          aria-label={props.rendered ? t("源码") : t("即时渲染")}
          title={t("切换源码模式 {0}", shortcutLabel("Mod-/"))}
          aria-pressed={!props.rendered}
          disabled={props.disabled}
          onClick={() => props.setRendered(!props.rendered)}
        >
          <Code2 size={16} />
        </button>
        <button className="icon-button" aria-label={t("AI 改写选区")} title={t("AI 改写选区")} disabled={props.disabled} onPointerDown={event => event.preventDefault()} onClick={() => props.command("ai-rewrite")}><Sparkles size={16} /></button>
        <div className="menu-container" ref={root}>
          <button
            className="icon-button"
            aria-label={t("更多操作")}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <MoreHorizontal size={20} />
          </button>
          {open && (
            <div className="more-menu" role="menu" onKeyDown={event => {
              const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])")], index = controls.indexOf(document.activeElement as HTMLButtonElement);
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + (event.key === "ArrowDown" ? 1 : controls.length - 1)) % controls.length;
                controls[next]?.focus();
              }
            }}>
              {items.map(({ action, icon: Icon, label, shortcut }) => (
                <button
                  role="menuitem"
                  aria-label={label}
                  disabled={
                    !props.rendered &&
                    ["bold", "italic", "code"].includes(action)
                  }
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
              {commandGroups.filter(group => ["段落", "表格", "格式", "显示", "编辑", "文件"].includes(group.title)).map(group => {
                const extra = group.items.filter(item => !item.selector && !items.some(quick => quick.action === item.action) && !["theme", "folder", "sidebar", "source", "close-window"].includes(item.action));
                return <section className="command-group" key={group.title}><div className="menu-divider" /><p>{t(group.title)}</p>{extra.map(item => <button key={item.action} role="menuitem" aria-label={t(item.label)} disabled={
                  !!item.context && (props.disabled || (["rich", "table"].includes(item.context) && !props.rendered) || (item.context === "table" && props.context !== "table_open"))
                } onClick={() => { setOpen(false); props.command(item.action); }}><span className="menu-check" /><span>{t(item.label)}</span><kbd>{shortcutLabel(commandKey(item))}</kbd></button>)}</section>;
              })}
              <div className="menu-divider" />
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  props.command("theme");
                }}
              >
                <span className="menu-check" />
                <span>{t("切换明暗主题")}</span>
              </button>
              <button
                role="menuitemcheckbox"
                aria-checked={props.autosave}
                onClick={() => props.command("autosave")}
              >
                <span className="menu-check">
                  {props.autosave && <Check size={16} />}
                </span>
                <span>{t("自动保存已有文件")}</span>
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  props.command("about");
                }}
              >
                <span className="menu-check" />
                <span>{t("关于 Open Typora")}</span>
                <kbd>{version}</kbd>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
