import { useEffect, useRef, useState } from 'react';
import type { SourceAnalysis } from './sourceAnalysis';
export function useSourceAnalysis(source: string, speed: number) {
  const [result, setResult] = useState<{ source: string; analysis: SourceAnalysis } | null>(null);
  const worker = useRef<Worker | null>(null), sequence = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    const id = ++sequence.current;
    if (source.length <= 300_000) return;
    const timer = setTimeout(() => {
      worker.current?.terminate();
      const next = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' }); worker.current = next;
      next.onmessage = event => { if (sequence.current === id) setResult({ source, analysis: event.data.analysis }); };
      next.postMessage({ id, source, speed });
    }, 250);
    return () => clearTimeout(timer);
  }, [source, speed]);
  return result?.source === source ? result.analysis : null;
}
