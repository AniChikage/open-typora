import test from "node:test";
import assert from "node:assert/strict";
import { commandForKey, commandKey, commandDefinitions } from "../src/commands.ts";
const event = (code, modifiers={}) => ({code,key:code.replace(/^Key/,''),metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,...modifiers});
test("PC shortcuts use Typora's Windows/Linux profile rather than the Mac alternatives",()=>{
  Object.defineProperty(navigator,'platform',{value:'Linux x86_64',configurable:true});
  for(const [code,modifiers,action] of [['KeyP',{},'quick-open'],['KeyT',{},'table'],['KeyK',{shiftKey:true},'code'],['KeyM',{shiftKey:true},'math-block'],['Digit1',{shiftKey:true},'outline'],['BracketLeft',{shiftKey:true},'ordered-list'],['F3',{ctrlKey:false},'find-next']]) {
    assert.equal(commandForKey(event(code,{ctrlKey:true,...modifiers})),action);
  }
  assert.equal(commandForKey(event('KeyI',{ctrlKey:true,shiftKey:true})),'image');
  assert.equal(commandForKey(event('Digit5',{altKey:true,shiftKey:true})),'strike');
});
test("Mac shortcuts retain their documented bindings and each platform has no duplicate accelerator",()=>{
  Object.defineProperty(navigator,'platform',{value:'MacIntel',configurable:true});
  assert.equal(commandForKey(event('KeyT',{metaKey:true})),'newTab');
  assert.equal(commandForKey(event('KeyT',{metaKey:true,altKey:true})),'table');
  assert.equal(commandForKey(event('KeyO',{metaKey:true,shiftKey:true})),'quick-open');
  for(const platform of ['MacIntel','Win32','Linux x86_64']) {
    Object.defineProperty(navigator,'platform',{value:platform,configurable:true});
    const keys=commandDefinitions.map(commandKey).filter(Boolean);
    assert.equal(new Set(keys).size,keys.length,platform);
  }
});
