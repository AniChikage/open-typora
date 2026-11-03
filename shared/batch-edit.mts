import prompts from './ai-prompts.json' with { type: 'json' };
import type { RewriteConstraints } from './rewrite-constraints.mjs';
import { constraintInstruction } from './rewrite-constraints.mjs';
export const batchFileLimit = 50_000, batchTotalLimit = 120_000, batchCountLimit = 4;
export interface BatchSource { id: string; name: string; text: string }
export interface BatchPatch { before: string; after: string; from: number; to: number }
export interface BatchProposal { summary: string; files: { id: string; summary: string; edits: BatchPatch[] }[] }
export const batchPrompt = prompts.batch;
export function batchInput(sources: BatchSource[], constraints: RewriteConstraints) {
  if (!sources.length || sources.length > batchCountLimit || new Set(sources.map(source => source.id)).size !== sources.length || sources.some(source => !/^D[1-4]$/.test(source.id) || typeof source.text !== 'string' || !source.text.trim() || source.text.length > batchFileLimit || source.name.length > 500) || sources.reduce((sum, source) => sum + source.text.length, 0) > batchTotalLimit) throw new Error('跨文档修改最多 4 篇，每篇 5 万字符，总计 12 万字符；请缩小范围。');
  return JSON.stringify({ documents: sources, constraints: constraintInstruction(constraints) });
}
export function batchProposal(text: string, sources: BatchSource[]): BatchProposal {
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error('模型未返回有效修改计划，请重新生成。'); }
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const fail = () => { throw new Error('修改计划包含未知文件、重复原文或无效差异，未应用任何修改。'); };
  if (!object(value) || typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 4000 || !Array.isArray(value.files) || value.files.length !== sources.length) return fail();
  const seen = new Set<string>(); let edits = 0, total = 0;
  const files = value.files.map((item: unknown) => {
    if (!object(item) || typeof item.id !== 'string' || seen.has(item.id) || typeof item.summary !== 'string' || item.summary.length > 4000 || !Array.isArray(item.edits) || item.edits.length > 100) return fail();
    const source = sources.find(source => source.id === item.id); if (!source) return fail(); seen.add(source.id);
    const patches = item.edits.map((patch: unknown) => {
      if (!object(patch) || typeof patch.before !== 'string' || !patch.before || typeof patch.after !== 'string' || patch.after === patch.before || (total += patch.before.length + patch.after.length) > 240000 || ++edits > 200) return fail();
      const from = source.text.indexOf(patch.before);
      if (from < 0 || source.text.indexOf(patch.before, from + 1) !== -1) return fail();
      return { before: patch.before, after: patch.after, from, to: from + patch.before.length };
    }).sort((a, b) => a.from - b.from);
    if (patches.some((patch, index) => index > 0 && patches[index - 1].to > patch.from)) return fail();
    return { id: source.id, summary: item.summary, edits: patches };
  });
  return { summary: value.summary, files };
}
export function batchText(original: string, edits: BatchPatch[], accepted: readonly boolean[]) {
  let result = '', position = 0;
  for (let index = 0; index < edits.length; index++) {
    const patch = edits[index]; if (patch.from < position || original.slice(patch.from, patch.to) !== patch.before) throw new Error('原文已变化，请重新生成修改计划。');
    result += original.slice(position, patch.from) + (accepted[index] ? patch.after : patch.before); position = patch.to;
  }
  return result + original.slice(position);
}
