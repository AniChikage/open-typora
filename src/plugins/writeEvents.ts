interface Binding {
  name: string; listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions; capture: boolean;
  wrapped: EventListener; abort?: () => void;
}

// Plugins see one logical writing surface while the host switches real editors.
export class WriteEvents {
  private root: HTMLElement | null = null;
  private bindings = new Set<Binding>();
  private stopped = false;
  private failed: (error: unknown) => void;
  constructor(failed: (error: unknown) => void) { this.failed = failed; }
  setRoot(root: HTMLElement | null) {
    if (this.stopped || this.root === root) return;
    for (const entry of this.bindings) this.root?.removeEventListener(entry.name, entry.wrapped, entry.capture);
    this.root = root;
    for (const entry of this.bindings) root?.addEventListener(entry.name, entry.wrapped, entry.options);
  }
  add(name: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (this.stopped || !listener || (typeof options === 'object' && options.signal?.aborted)) return;
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    if ([...this.bindings].some(entry => entry.name === name && entry.listener === listener && entry.capture === capture)) return;
    const entry: Binding = {name, listener, options, capture, wrapped: event => {
      if (typeof options === 'object' && options.once) this.remove(name, listener, capture);
      if (this.stopped) return;
      try {
        const result = typeof listener === 'function' ? listener.call(this.root, event) : listener.handleEvent(event);
        Promise.resolve(result).catch(this.failed);
      } catch (error) { this.failed(error); }
    }};
    if (typeof options === 'object' && options.signal) {
      const signal = options.signal, abort = () => this.remove(name, listener, capture);
      signal.addEventListener('abort', abort, {once:true});
      entry.abort = () => signal.removeEventListener('abort', abort);
    }
    this.bindings.add(entry); this.root?.addEventListener(name, entry.wrapped, options);
  }
  remove(name: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    for (const entry of this.bindings) if (entry.name === name && entry.listener === listener && entry.capture === capture) {
      this.root?.removeEventListener(name, entry.wrapped, capture); entry.abort?.(); this.bindings.delete(entry);
    }
  }
  clear() {
    this.stopped = true;
    for (const entry of this.bindings) { this.root?.removeEventListener(entry.name, entry.wrapped, entry.capture); entry.abort?.(); }
    this.bindings.clear(); this.root = null;
  }
}
