import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom=new JSDOM('<!doctype html>');for(const key of ['window','document','DOMParser','Node'])globalThis[key]=dom.window[key];
const {MarkdownDocument}=await import('../src/editor/model.ts');
const original='x'.repeat(5*1024*1024),document=new MarkdownDocument(original);
document.text.charCodeAt(document.text.length-1);global.gc();const before=process.memoryUsage().heapUsed;
for(let index=0;index<100;index++){document.closeGroup();document.replace(1000+index*200,1100+index*200,'y'.repeat(100),'command');}
document.text.charCodeAt(document.text.length-1);global.gc();const after=process.memoryUsage().heapUsed;
let undoSteps=0;while(document.undo())undoSteps++;assert.equal(document.text,original);
console.log(JSON.stringify({documentBytes:Buffer.byteLength(original),beforeBytes:before,afterBytes:after,growthBytes:after-before,undoSteps}));
