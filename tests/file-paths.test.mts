import test from 'node:test';
import assert from 'node:assert/strict';
import {documentFileName,pathContains} from '../src/filePaths.ts';
test('renamed document names retain only the file name on Windows, UNC and POSIX paths',()=>{
 for(const path of ['C:\\Users\\runner\\Renamed table.md','D:/笔记/重命名.md','\\\\server\\share\\name.md','/home/user/notes.md'])
  assert.equal(documentFileName(path),path.includes('Renamed')?'Renamed table.md':path.includes('重命名')?'重命名.md':path.includes('name.md')?'name.md':'notes.md');
 assert.equal(documentFileName('/home/a\\b.md'),'a\\b.md');
});
test('folder path changes and removal match Windows descendants without prefix collisions',()=>{
 assert.equal(pathContains('C:\\Notes\\nested\\a.md','c:\\notes'),true);
 assert.equal(pathContains('C:/Notes/nested/a.md','C:\\Notes'),true);
 assert.equal(pathContains('\\\\server\\share\\Folder\\a.md','\\\\SERVER\\share\\folder'),true);
 assert.equal(pathContains('C:\\Notes-extra\\a.md','C:\\Notes'),false);
 assert.equal(pathContains('D:\\Notes\\a.md','C:\\Notes'),false);
 assert.equal(pathContains('/Notes/nested/a.md','/Notes'),true);
 assert.equal(pathContains('/Notes-extra/a.md','/Notes'),false);
 assert.equal(pathContains('/notes/a.md','/Notes'),false);
 assert.equal(pathContains('/Notes/a.md','/'),true);
});
