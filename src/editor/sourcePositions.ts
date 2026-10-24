// Code bodies are contiguous or line mapped. Do not allocate one number per character.
const compact = new WeakMap<number[], (index: number) => number>();
export function mappedPositions(length: number, position: (index: number) => number): number[] {
  const numeric = (key: PropertyKey) => typeof key === "string" && /^(?:0|[1-9]\d*)$/.test(key);
  const result = new Proxy([] as number[], {
    get(target, key, receiver) {
      if (key === "length") return length + 1;
      if (numeric(key)) { const index = Number(key); return index <= length ? position(index) : undefined; }
      return Reflect.get(target, key, receiver);
    },
    has(target, key) { return numeric(key) ? Number(key) <= length : Reflect.has(target, key); },
  });
  compact.set(result, position);
  return result;
}
export const contiguousPositions = (start: number, length: number) => mappedPositions(length, index => start + index);
export function shiftPositions(positions: number[], delta: number) {
  const position = compact.get(positions);
  return position ? mappedPositions(positions.length - 1, index => position(index) + delta) : positions.map(value => value + delta);
}
export function positionIndex(positions: number[], value: number, floor = false) {
  let from = 0, to = positions.length;
  while (from < to) { const middle = (from + to) >>> 1; if (positions[middle] < value || floor && positions[middle] === value) from = middle + 1; else to = middle; }
  return Math.max(0, Math.min(positions.length - 1, floor ? from - 1 : from));
}
