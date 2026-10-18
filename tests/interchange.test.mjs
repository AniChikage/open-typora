import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {convertImport,pandocPath,libreOfficePath} from '../electron/interchange.mjs';
const exec = promisify(execFile), pandoc = await pandocPath(), office = await libreOfficePath();
if (process.env.OPEN_TYPORA_REQUIRE_CONVERTERS) { assert.ok(pandoc,'Pandoc must be installed for release acceptance'); assert.ok(office,'LibreOffice must be installed for release acceptance'); }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=','base64');
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(),'open-typora-import-')); t.after(()=>rm(root,{recursive:true,force:true}));
  await writeFile(path.join(root,'figure.png'),png);
  const source = '# 中文 heading\n\nBody **bold** with $E=mc^2$ and note[^n].\n\n| A | B |\n|---|---|\n| one | 中文 |\n\n![Figure](figure.png)\n\n```javascript\nlet answer = 42;\n```\n\n[^n]: Footnote text\n';
  const md = path.join(root,'复杂 input.md'); await writeFile(md,source);
  return {root,md};
}
for (const format of ['docx','odt','epub']) test(`actual ${format} import retains text, table, code, math, notes and persistent embedded image`,{skip:!pandoc},async t=>{
  const {root,md} = await fixture(t), file = path.join(root,'converted.'+format);
  await exec(pandoc,[md,'--from=markdown','--to='+format,'--output='+file,'--resource-path='+root]);
  const imported = await convertImport(file,path.join(root,'session'));
  assert.match(imported.markdown,/中文 heading/); assert.match(imported.markdown,/\|.*one.*中文/);
  assert.match(imported.markdown,/let answer = 42/); assert.match(imported.markdown,/\$\$?\s*E\s*=\s*mc/);
  assert.match(imported.markdown,/Footnote text/);
  const image = imported.markdown.match(/(?:src="|\]\(<?)([^"\s)>]+)/)?.[1]; assert.ok(image,imported.markdown);
  assert.deepEqual(await readFile(image.startsWith("file:") ? fileURLToPath(image) : decodeURIComponent(image)),png);
  await rm(file); assert.deepEqual(await readFile(image.startsWith("file:") ? fileURLToPath(image) : decodeURIComponent(image)),png);
  assert.deepEqual((await readdir(path.join(root,'session'))).sort(),['Imported']);
});
for (const format of ['doc','rtf']) test(`actual LibreOffice ${format} conversion imports headings, tables and image`,{skip:!pandoc||!office},async t=>{
  const {root,md} = await fixture(t), docx = path.join(root,'legacy.docx');
  await exec(pandoc,[md,'--output='+docx,'--resource-path='+root]);
  const filters = {doc:'doc:MS Word 97',rtf:'rtf:Rich Text Format'};
  await exec(office,['-env:UserInstallation='+pathToFileURL(path.join(root,'profile')).href,'--headless','--norestore','--convert-to',filters[format],'--outdir',root,docx],{timeout:60000});
  const file = path.join(root,'legacy.'+format), imported = await convertImport(file,path.join(root,'session'));
  assert.match(imported.markdown,/中文 heading/); assert.match(imported.markdown,/\|.*one.*中文/); assert.match(imported.markdown,/Footnote text/);
  const image = imported.markdown.match(/(?:src="|\]\(<?)([^"\s)>]+)/)?.[1]; assert.ok(image,imported.markdown);
  assert.ok((await readFile(image.startsWith("file:") ? fileURLToPath(image) : decodeURIComponent(image))).length>20);
  assert.deepEqual((await readdir(path.join(root,'session'))).sort(),['Imported']);
});
test('failed import cleans temporary conversion and extracted resources',{skip:!pandoc},async t=>{
  const {root} = await fixture(t), file = path.join(root,'broken.docx'), directory = path.join(root,'session');
  await writeFile(file,'Not an Office document'); await assert.rejects(convertImport(file,directory));
  assert.deepEqual(await readdir(path.join(directory,'Imported')),[]);
  assert.deepEqual(await readdir(directory),['Imported']);
});
