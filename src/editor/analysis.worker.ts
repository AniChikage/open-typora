import { analyzeSource } from './sourceAnalysis';
self.onmessage = (event: MessageEvent<{ id: number; source: string; speed: number }>) => {
  const { id, source, speed } = event.data;
  self.postMessage({ id, analysis: analyzeSource(source, speed) });
};
