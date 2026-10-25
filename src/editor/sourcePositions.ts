export interface SourceEdit { from: number; to: number; insert: string }

// Code bodies are contiguous or line mapped. Do not allocate one number per character.
const compact = new WeakMap<number[], {position: (index: number) => number; offset: number}>();
export function mappedPositions(length: number, position: (index: number) => number, offset = 0): number[] {
  const numeric = (key: PropertyKey) => typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key);
  const result = new Proxy([] as number[], {
    get(target, key, receiver) {
      if (key === "length") return length + 1;
      if (numeric(key)) { const index = Number(key); return index <= length ? position(index) + offset : undefined; }
      return Reflect.get(target, key, receiver);
    },
    has(target, key) { return numeric(key) ? Number(key) <= length : Reflect.has(target, key); },
  });
  compact.set(result, {position, offset});
  return result;
}
export const contiguousPositions = (start: number, length: number) => mappedPositions(length, index => start + index);
export function shiftPositions(positions: number[], delta: number) {
  const mapping = compact.get(positions);
  return mapping ? mappedPositions(positions.length - 1, mapping.position, mapping.offset + delta) : positions.map(value => value + delta);
}
export function positionIndex(positions: number[], value: number, floor = false) {
  let from = 0, to = positions.length;
  while (from < to) { const middle = (from + to) >>> 1; if (positions[middle] < value || floor && positions[middle] === value) from = middle + 1; else to = middle; }
  return Math.max(0, Math.min(positions.length - 1, floor ? from - 1 : from));
}

// Build UTF-16 spans so history and row caches do not retain an older whole source.
// Primitive structuredClone may return the original backing storage on newer V8.
export function detachedSpan(value: string): string {
  if (!value.length) return "";
  const chunks: string[] = [];
  for (let from = 0; from < value.length; from += 8192) {
    const end = Math.min(value.length, from + 8192), units = new Uint16Array(end - from);
    for (let index = from; index < end; index++) units[index - from] = value.charCodeAt(index);
    chunks.push(String.fromCharCode(...units));
  }
  return chunks.length === 1 ? chunks[0] : chunks.join("");
}
