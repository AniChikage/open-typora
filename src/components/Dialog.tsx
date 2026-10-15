import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
export function Dialog({ title, close, children }: { title: string; close(): void; children: ReactNode }) {
  const root = useRef<HTMLElement>(null), closing = useRef(close);
  closing.current = close;
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = [...root.current!.querySelectorAll<HTMLElement>('input:not([type="checkbox"]),textarea,select,button,summary')].find(control => control.getClientRects().length > 0 && !control.matches(":disabled"));
    first?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closing.current(); }}>
    <section ref={root} className="utility-dialog" role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); closing.current(); }
      if (event.key !== "Tab") return;
      const controls = [...root.current!.querySelectorAll<HTMLElement>('input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),summary,a[href]')].filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="dialog-heading"><h2>{title}</h2><button type="button" onClick={close} aria-label={`关闭${title}`}>×</button></div>
      {children}
    </section>
  </div>;
}
