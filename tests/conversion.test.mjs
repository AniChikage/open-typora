import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://editor.test/' });
for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'Node']) globalThis[key] = dom.window[key];
const { renderMarkdown } = await import('../src/editor/markdown.ts');
const { conversionMarkdown } = await import('../src/editor/print.ts');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=';
test('conversion embeds reference images and sized HTML images while preserving code, math and footnotes', async () => {
  const source = `# 中文\n\n![inline](${png})\n\n<img src="${png}" alt="尺寸" width="120" />\n\n![参考][fig]\n\n[fig]: ${png} "title"\n\n行内 $E=mc^2$ 和脚注[^n]。\n\n[^n]: 脚注内容\n\n\`\`\`text\n![code](missing.png)\n\`\`\`\n`;
  const root = document.createElement('article'); root.innerHTML = renderMarkdown(source, 'fixture');
  const converted = await conversionMarkdown(source, root);
  assert.ok(converted.includes(`src="${png}"`) && converted.includes('width="120"'));
  assert.ok(converted.includes(`[fig]: ${png} "title"`));
  assert.ok(converted.includes('![code](missing.png)'));
  assert.ok(converted.includes('$E=mc^2$') && converted.includes('[^n]: 脚注内容'));
});
test('missing export resources fail explicitly instead of producing a broken converted file', async () => {
  await assert.rejects(conversionMarkdown('![missing](no-file.png)', document.createElement('article')), /无法读取导出图片/);
});
