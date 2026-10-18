// Translate the common public js-sequence/flowchart syntax into the offline
// Mermaid renderer. Markdown stays untouched. Unsupported syntax is an error,
// never a partially drawn diagram that silently omits a user's nodes or edges.
function label(value: string) {
  return value.replace(/[&<>";\\]/g, character => ({ "&": "#38;", "<": "#60;", ">": "#62;", '"': "#quot;", ";": "#59;", "\\": "#92;" })[character]!);
}
function lines(source: string) {
  return source.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
}
export function sequenceDiagram(source: string) {
  const actors = new Map<string, string>(), body: string[] = [];
  const actor = (name: string) => {
    name = name.trim();
    if (!name || /[<>;\[\]{}]/.test(name)) throw new Error("参与者名称不受支持");
    if (!actors.has(name)) actors.set(name, `p${actors.size}`);
    return actors.get(name)!;
  };
  for (const line of lines(source)) {
    let match;
    if ((match = /^title\s*:\s*(.+)$/i.exec(line))) body.push(`title ${label(match[1])}`);
    else if ((match = /^participant\s+(.+)$/i.exec(line))) actor(match[1]);
    else if ((match = /^note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i.exec(line))) {
      const names = match[2].split(",").map(actor);
      if (names.length > (match[1].toLowerCase() === "over" ? 2 : 1)) throw new Error("注释位置不受支持");
      body.push(`Note ${match[1].toLowerCase()} ${names.join(",")}: ${label(match[3])}`);
    } else if ((match = /^(.+?)\s*(-->>|-->|->>|->)\s*([^:]+):\s*(.*)$/.exec(line))) {
      const arrow = { "->": "->>", "-->": "-->>", "->>": "-)", "-->>": "--)" }[match[2]];
      body.push(`${actor(match[1])}${arrow}${actor(match[3])}: ${label(match[4])}`);
    } else throw new Error(`不支持的 sequence 语法：${line}`);
  }
  if (!actors.size) throw new Error("时序图没有参与者");
  return ["sequenceDiagram", ...[...actors].map(([name, id]) => `participant ${id} as ${label(name)}`), ...body].join("\n");
}
export function flowDiagram(source: string) {
  const nodes = new Map<string, { id: string; kind: string; text: string }>(), paths: string[] = [];
  for (const line of lines(source)) {
    const match = /^(\w+)\s*=>\s*(start|end|operation|inputoutput|subroutine|condition)(?:\s*:\s*(.+))?$/.exec(line);
    if (match) {
      if (nodes.has(match[1])) throw new Error("流程图节点重复");
      nodes.set(match[1], {id:`n${nodes.size}`, kind:match[2], text:match[3] || match[1]});
    } else paths.push(line);
  }
  const shapes: Record<string, [string,string]> = {start:["([", "])"],end:["([", "])"],operation:["[", "]"],inputoutput:["[/", "/]"],subroutine:["[[", "]]"],condition:["{", "}"],parallel:["{{", "}}"]};
  const result = ["flowchart TD"];
  for (const node of nodes.values()) {
    if (/\|[A-Za-z]|:>|https?:/.test(node.text)) throw new Error("流程图状态样式和链接尚不支持");
    const [open,close] = shapes[node.kind];
    result.push(`${node.id}${open}"${label(node.text)}"${close}`);
  }
  for (const line of paths) {
    const chain = line.split(/\s*->\s*/).map(part => /^(\w+)(?:\((yes|no|true|false)\))?$/.exec(part));
    if (chain.length < 2 || chain.some(part => !part || !nodes.has(part[1]))) throw new Error(`不支持的 flow 语法或节点未定义：${line}`);
    for (let i=0; i<chain.length-1; i++) {
      const from = chain[i]!, to = chain[i+1]!, branch = from[2] && /^(yes|no|true|false)$/.test(from[2]) ? from[2] : "";
      result.push(`${nodes.get(from[1])!.id} -->${branch ? `|${branch}|` : ""} ${nodes.get(to[1])!.id}`);
    }
  }
  if (!nodes.size) throw new Error("流程图没有节点");
  return result.join("\n");
}
export function diagramSource(language: string, source: string) {
  return language === "sequence" ? sequenceDiagram(source) : language === "flow" ? flowDiagram(source) : source;
}
