import test from 'node:test';
import assert from 'node:assert/strict';
import {tabCloseTargets,tabCopyText} from '../src/tabActions.ts';
const records=[
 {id:'a',name:'一份笔记.md',path:'/笔记/一份笔记.md',content:'A',savedContent:'A'},
 {id:'b',name:'B.md',path:'/笔记/B.md',content:'dirty B',savedContent:'B'},
 {id:'c',name:'未命名.md',path:null,content:'',savedContent:''},
 {id:'d',name:'D.md',path:'/笔记/D.md',content:'D',savedContent:'D'},
];
test('tab close groups follow visual order and do not classify untitled drafts as saved files',()=>{
 assert.deepEqual(tabCloseTargets(records,'b','left'),['a']);
 assert.deepEqual(tabCloseTargets(records,'b','right'),['c','d']);
 assert.deepEqual(tabCloseTargets(records,'b','others'),['a','c','d']);
 assert.deepEqual(tabCloseTargets(records,'b','saved'),['a','d']);
 assert.deepEqual(tabCloseTargets(records,'b','all'),['a','b','c','d']);
 assert.deepEqual(tabCloseTargets(records,'missing','all'),[]);
 assert.equal(records[1].content,'dirty B');
});
test('tab copies preserve Unicode, native separators, quotes and root directories',()=>{
 assert.equal(tabCopyText(records[0],'name'),'一份笔记.md');
 assert.equal(tabCopyText(records[0],'stem'),'一份笔记');
 assert.equal(tabCopyText(records[0],'directory'),'/笔记');
 assert.equal(tabCopyText({...records[0],path:'/一份笔记.md'},'directory'),'/');
 const windows={...records[0],path:'C:\\笔记\\a b.md'};
 assert.equal(tabCopyText(windows,'directory'),'C:\\笔记');
 assert.equal(tabCopyText(windows,'quoted-path'),'"C:\\笔记\\a b.md"');
 assert.equal(tabCopyText({...windows,path:'C:\\root.md'},'directory'),'C:\\');
 assert.equal(tabCopyText({...records[0],name:'.notes'},'stem'),'.notes');
 for(const kind of ['path','quoted-path','directory'])assert.equal(tabCopyText(records[2],kind),null);
});
