import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launchFiles } from "../build/runtime/electron/launch-files.mjs";

test("installed file associations preserve spaces and Unicode without treating switches as files", () => {
  const folder = path.resolve("notes");
  assert.deepEqual(launchFiles(["Open Typora.exe", "--inspect.md", "会议 notes.md", "not.txt", "会议 notes.md"], true, folder), [path.join(folder, "会议 notes.md")]);
});
test("development launch omits the Electron application directory", () => {
  assert.deepEqual(launchFiles(["electron", "editor.md", "note.markdown"], false), [path.resolve("note.markdown")]);
});
test("Linux desktop %U file URLs decode spaces and Unicode before opening a document", () => {
  const file=path.resolve('会议 notes #1.md');
  assert.deepEqual(launchFiles(['open-typora',pathToFileURL(file).href,'file:///%ZZ.md'],true),[file]);
});
