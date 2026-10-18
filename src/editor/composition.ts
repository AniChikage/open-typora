// Some IMEs report keyCode 229 before/after isComposing becomes accurate.
export function imeKey(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229 || event.key === "Process";
}
