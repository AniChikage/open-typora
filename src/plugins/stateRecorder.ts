interface Recorder {
  name: string; selector: string;
  stateGetter(element: Element): unknown;
  stateRestorer(element: Element, state: unknown): void;
}
// Session state follows document identity and stable block IDs, never Markdown.
export class StateRecorder {
  private records = new Map<string, { definition: Recorder; key: string; nodes: Element[]; states: Map<string, Map<string, unknown>> }>();
  private root: () => HTMLElement | null;
  private documentKey: () => string;
  constructor(root: () => HTMLElement | null, documentKey: () => string) { this.root = root; this.documentKey = documentKey; }
  register = (definition: Recorder) => {
    this.unregister(definition.name);
    this.records.set(definition.name, { definition, key: this.documentKey(), nodes: [...(this.root()?.querySelectorAll(definition.selector) || [])], states: new Map() });
  };
  unregister = (name: string) => { this.records.delete(name); };
  sync() {
    for (const record of this.records.values()) {
      const id = (element: Element, index: number) => element.getAttribute("cid") || element.getAttribute("data-cid") || String(index);
      const saved = new Map(record.nodes.map((element,index) => [id(element,index), record.definition.stateGetter(element)]));
      record.states.set(record.key,saved);
      // Bound session memory across long folder-browsing sessions.
      if (record.states.size > 100) record.states.delete(record.states.keys().next().value!);
      record.key = this.documentKey();
      record.nodes = [...(this.root()?.querySelectorAll(record.definition.selector) || [])];
      const restore = record.states.get(record.key);
      record.nodes.forEach((element,index) => { const value = restore?.get(id(element,index)); if (value) record.definition.stateRestorer(element,value); });
    }
  }
  clear() { this.records.clear(); }
}
