import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import "./contextMenu.css";

export interface ContextMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  checked?: boolean;
  children?: ContextMenuEntry[];
}
export type ContextMenuEntry = ContextMenuItem | null;
export type MenuDismissal = "action" | "cancel" | "outside";
interface Props {
  label: string;
  x: number;
  y: number;
  items: ContextMenuEntry[];
  close(reason: MenuDismissal): void;
  action(id: string): void;
}

function MenuPanel({ label, x, y, items, choose, back, parentLeft, autofocus = true }: {
  label: string; x: number; y: number; items: ContextMenuEntry[];
  choose(id: string): void; back?(): void; parentLeft?: number; autofocus?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [expanded, setExpanded] = useState<{ id: string; rect: DOMRect; keyboard: boolean } | null>(null);
  useLayoutEffect(() => {
    const panel = root.current!, rect = panel.getBoundingClientRect();
    const left = x + rect.width > window.innerWidth - 8 && parentLeft !== undefined ? parentLeft - rect.width + 3 : x;
    setPosition({ left: Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) });
    if (autofocus) panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [x, y, parentLeft, autofocus]);
  function controls() { return [...root.current!.querySelectorAll<HTMLButtonElement>(':scope > .context-menu-entry > button:not(:disabled)')]; }
  function restoreParent(id: string) {
    setExpanded(null);
    controls().find(button => button.dataset.menuId === id)?.focus({ preventScroll: true });
  }
  return <div ref={root} role="menu" aria-label={label} className="context-menu" style={position}
    onKeyDown={event => {
      if ((event.target as HTMLElement).closest('[role="menu"]') !== event.currentTarget) return;
      const buttons = controls(), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); setExpanded(null);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? buttons.length - 1 : 1)) % buttons.length;
        buttons[next]?.focus(); buttons[next]?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "ArrowRight") {
        const item = items.find(item => item?.id === buttons[index]?.dataset.menuId);
        if (item?.children) { event.preventDefault(); event.stopPropagation(); setExpanded({ id: item.id, rect: buttons[index].getBoundingClientRect(), keyboard: true }); }
      } else if (event.key === "ArrowLeft" && back) { event.preventDefault(); event.stopPropagation(); back(); }
    }}>
    {items.map((item, index) => !item ? <div role="separator" className="context-menu-separator" key={`separator-${index}`} /> : <div className="context-menu-entry" key={item.id}>
      <button type="button" role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={item.checked} disabled={item.disabled}
        aria-haspopup={item.children ? "menu" : undefined} aria-expanded={item.children ? expanded?.id === item.id : undefined} data-menu-id={item.id}
        onPointerEnter={event => {
          if (event.pointerType === "touch" || item.disabled) return;
          event.currentTarget.focus({ preventScroll: true });
          setExpanded(item.children ? { id: item.id, rect: event.currentTarget.getBoundingClientRect(), keyboard: false } : null);
        }}
        onClick={event => {
          if (item.children) setExpanded({ id: item.id, rect: event.currentTarget.getBoundingClientRect(), keyboard: true });
          else choose(item.id);
        }}>
        <span className="context-menu-check" aria-hidden="true">{item.checked && <Check size={13} />}</span>
        <span className="context-menu-label">{item.label}</span>{item.children && <ChevronRight size={13} aria-hidden="true" />}
      </button>
      {item.children && expanded?.id === item.id && <MenuPanel label={item.label} x={expanded.rect.right - 3} y={expanded.rect.top - 4} parentLeft={expanded.rect.left}
        items={item.children} choose={choose} autofocus={expanded.keyboard} back={() => restoreParent(item.id)} />}
    </div>)}
  </div>;
}

export function ContextMenu(props: Props) {
  const root = useRef<HTMLDivElement>(null), latest = useRef(props); latest.current = props;
  useLayoutEffect(() => {
    const outside = (event: Event) => { if (!root.current?.contains(event.target as Node)) latest.current.close("outside"); };
    const resized = () => latest.current.close("outside");
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    document.addEventListener("scroll", outside, true);
    window.addEventListener("resize", resized);
    window.addEventListener("blur", resized);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("focusin", outside); document.removeEventListener("scroll", outside, true); window.removeEventListener("resize", resized); window.removeEventListener("blur", resized); };
  }, []);
  return createPortal(<div ref={root} className="context-menu-root" onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); props.close("cancel"); }
  }}><MenuPanel {...props} choose={id => { props.close("action"); props.action(id); }} /></div>, document.body);
}
