import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readBackground, saveBackground, clearBackground } from "../electron/background.mjs";
import { backgroundMime, checkedBackground, maxBackgroundBytes } from "../shared/background.mjs";
import { defaultPreferences, loadPreferences } from "../src/preferences.ts";
import { backgroundStyle } from "../src/background.ts";
import formats from "./background-formats.json" with {type:"json"};
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNNsAAAAASUVORK5CYII=","base64");
test("background copies survive source removal, failed replacements preserve the last image, clear retains documents",async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(),"open-typora-background-"));
  try {
    const source = path.join(folder,"source.png"), document = path.join(folder,"note.md");
    await writeFile(source,png); await writeFile(document,"# Keep my words\r\n");
    assert.equal(await readBackground(folder),null);
    const asset = await saveBackground(folder,await readFile(source),source,bytes => { assert.deepEqual(bytes,png); });
    await rm(source); assert.deepEqual(await readBackground(folder),asset);
    await assert.rejects(saveBackground(folder,Buffer.from("<svg/>"),"bad.png",() => {}));
    await assert.rejects(saveBackground(folder,png,"broken.png",() => {throw new Error("decode failed");}));
    assert.deepEqual(await readBackground(folder),asset);
    await clearBackground(folder); assert.equal(await readBackground(folder),null);
    assert.equal(await readFile(document,"utf8"),"# Keep my words\r\n");
  } finally { await rm(folder,{recursive:true,force:true}); }
});
test("background data refuses remote URLs, SVG, invalid records and oversized assets",() => {
  assert.equal(backgroundMime(png),"image/png");
  for(const [format,encoded] of Object.entries(formats)) assert.equal(backgroundMime(Buffer.from(encoded,"base64")),"image/"+format);
  assert.throws(() => backgroundMime(Buffer.alloc(maxBackgroundBytes + 1)),/8 MB/);
  for (const dataUrl of ["https://example.com/image.png","data:image/svg+xml;base64,PHN2Zy8+","data:text/html;base64,AAAA"]) assert.throws(() => checkedBackground({name:"bad",dataUrl}));
  assert.throws(() => checkedBackground({dataUrl:"data:image/png;base64,AAAA"}));
});
test("old preferences gain subtle background defaults and malformed controls are bounded",() => {
  let saved = '{"fontSize":18,"spellcheck":false}';
  globalThis.localStorage = {getItem:() => saved};
  let value = loadPreferences(); assert.equal(value.fontSize,18); assert.equal(value.spellcheck,false); assert.equal(value.backgroundOpacity,18);
  saved = '{"backgroundOpacity":200,"backgroundBlur":-3,"backgroundPosition":"url(evil)","backgroundSize":"broken"}';
  value = loadPreferences(); assert.equal(value.backgroundOpacity,100); assert.equal(value.backgroundBlur,0); assert.equal(value.backgroundPosition,"center"); assert.equal(value.backgroundSize,"cover");
  const style = backgroundStyle({name:"test",dataUrl:"data:image/png;base64,AAAA"},{...defaultPreferences,backgroundOpacity:35,backgroundBlur:8,backgroundPosition:"top",backgroundSize:"repeat"});
  assert.equal(style.opacity,.35); assert.equal(style.filter,"blur(8px)"); assert.equal(style.backgroundRepeat,"repeat"); assert.equal(style.backgroundPosition,"top");
});
