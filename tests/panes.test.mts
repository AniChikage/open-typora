import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkspace, activateWorkspace, reorderDocuments } from "../src/workspace.ts";
const layout: import("../shared/contracts.js").WorkspaceLayout={primaryId:"a",secondaryId:"b",direction:"columns",ratio:.5};
test("workspace restores only distinct existing documents and clamps split dimensions",()=>{
  assert.equal(normalizeWorkspace(layout,["a","b","c"],"a"),layout);
  assert.deepEqual(normalizeWorkspace({...layout,ratio:4},["a","b"],"a"),{...layout,ratio:.8});
  assert.equal(normalizeWorkspace(layout,["a"],"a"),null);
  assert.equal(normalizeWorkspace({...layout,direction:"invalid"},["a","b"],"a"),null);
  for(const value of [layout,{...layout,primaryId:"missing"},{...layout,secondaryId:"a"}]){
    const next=normalizeWorkspace(value,["a","c"],"c");
    assert.notEqual(next!.primaryId,next!.secondaryId);assert.ok([next!.primaryId,next!.secondaryId].includes("c"));
  }
});
test("selecting a tab replaces the focused pane and existing visible tabs keep their pane",()=>{
  assert.equal(activateWorkspace(layout,"a","b"),layout);
  assert.deepEqual(activateWorkspace(layout,"a","c"),{...layout,primaryId:"c"});
  assert.deepEqual(activateWorkspace(layout,"b","c"),{...layout,secondaryId:"c"});
  assert.equal(activateWorkspace(null,"a","c"),null);
});
test("tab reorder retains document objects, dirty content and a stable active id",()=>{
  const records=[{id:"a",content:"dirty A"},{id:"b",content:"B"},{id:"c",content:"C"}];
  const moved=reorderDocuments(records,"a","c");assert.deepEqual(moved.map(item=>item.id),["b","c","a"]);assert.equal(moved[2],records[0]);
  assert.equal(reorderDocuments(records,"missing","c"),records);
});
