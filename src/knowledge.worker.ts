import { selectEvidence } from '../shared/knowledge.mts';
import type { ContextDocument } from '../shared/contracts';
self.onmessage = (event: MessageEvent<{ documents: ContextDocument[]; query: string; explicit: boolean }>) => {
  try { self.postMessage({ evidence: selectEvidence(event.data.documents, event.data.query, event.data.explicit) }); }
  catch { self.postMessage({ error: '资料检索失败，请重试。' }); }
};
