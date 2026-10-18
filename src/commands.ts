import definitions from "../shared/commands.json" with { type: "json" };
export interface CommandDefinition { label: string; action: string; key?: string; pcKey?: string; context?: string; selector?: string }
export const commandGroups: { title: string; items: CommandDefinition[] }[] = definitions;
export const commandDefinitions = commandGroups.flatMap(group => group.items);
export const commandsByAction = new Map(commandDefinitions.map(item => [item.action, item]));
export function commandKey(command: CommandDefinition) {
  return /Mac/.test(navigator.platform) ? command.key : command.pcKey ?? command.key;
}
export function shortcutLabel(key = "") {
  if (!/Mac/.test(navigator.platform)) return key.replaceAll("Mod-", "Ctrl+").replaceAll("Ctrl-", "Ctrl+").replaceAll("Alt-", "Alt+").replaceAll("Shift-", "Shift+").replace("Ctrl+Ctrl+", "Ctrl+");
  return key.replaceAll("Mod-", "⌘ ").replaceAll("Ctrl-", "⌃ ").replaceAll("Alt-", "⌥ ").replaceAll("Shift-", "⇧ ").replaceAll("Backspace", "⌫");
}
export function commandForKey(event: KeyboardEvent) {
  const mac = /Mac/.test(navigator.platform);
  const physical: Record<string, string> = { Backquote: "`", BracketLeft: "[", BracketRight: "]", Slash: "/", Backslash: "\\", Equal: "=", Minus: "-", Comma: "," };
  const key = physical[event.code] || (event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : event.code.startsWith("Digit") ? event.code.slice(5) : event.key.toLowerCase());
  return commandDefinitions.find(command => {
    const keyString = commandKey(command);
    if (!keyString || command.selector) return false;
    const mod = keyString.includes("Mod-"), ctrl = keyString.includes("Ctrl-"), alt = keyString.includes("Alt-"), shift = keyString.includes("Shift-");
    const target = keyString.replace(/^(?:(?:Mod|Ctrl|Alt|Shift)-)+/, "").toLowerCase();
    return key === target && event.metaKey === (mac && mod) && event.ctrlKey === (ctrl || (!mac && mod)) && event.altKey === alt && event.shiftKey === shift;
  })?.action;
}
