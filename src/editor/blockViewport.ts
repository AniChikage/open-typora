import type { DocumentNode } from './model.ts';

/** Measured block heights; offscreen blocks have no DOM or inline-position arrays. */
export class BlockViewport {
  private nodes: DocumentNode[] = [];
  private heights = new Map<string, number>();
  private prefix: number[] = [0];
  private dirty = true;
  setNodes(nodes: DocumentNode[]) { if (nodes !== this.nodes) { this.nodes = nodes; this.dirty = true; } }
  reset() { this.heights.clear(); this.dirty = true; }
  measure(id: string, height: number) {
    if (!(height > 0) || Math.abs((this.heights.get(id) || 0) - height) < 1) return false;
    this.heights.set(id, height); this.dirty = true; return true;
  }
  private update() {
    if (!this.dirty) return;
    this.prefix = [0];
    for (const node of this.nodes) {
      const estimated = Math.max(32, Math.ceil(node.source.length / 90) * 26 + (node.kind === 'heading_open' ? 38 : 26));
      this.prefix.push(this.prefix.at(-1)! + (this.heights.get(node.id) ?? estimated));
    }
    this.dirty = false;
  }
  offset(index: number) { this.update(); return this.prefix[Math.min(this.nodes.length,Math.max(0,index))]; }
  private at(y: number) {
    this.update(); let from = 0, to = this.nodes.length;
    while (from < to) { const middle = (from + to) >>> 1; if (this.prefix[middle+1] < y) from = middle+1; else to = middle; }
    return Math.min(Math.max(0,this.nodes.length-1),from);
  }
  visible(top: number, height: number, pins: number[] = []) {
    const from = this.at(Math.max(0,top-1600)), to = this.at(top+Math.max(600,height)+1600);
    const indices = new Set(pins.filter(i=>i>=0&&i<this.nodes.length));
    for(let i=from;i<=to;i++) indices.add(i);
    return [...indices].sort((a,b)=>a-b);
  }
}

export function blockSpacer(height: number) {
  const spacer = document.createElement('div');
  spacer.className = 'virtual-block-spacer'; spacer.contentEditable = 'false';
  spacer.setAttribute('aria-hidden','true');
  spacer.style.cssText = `height:${Math.max(0,height)}px;min-height:0;flex-shrink:0;margin:0;padding:0;border:0;pointer-events:none;`;
  return spacer;
}
