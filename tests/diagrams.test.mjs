import test from "node:test";
import assert from "node:assert/strict";
import { sequenceDiagram, flowDiagram } from "../src/editor/legacyDiagrams.ts";
test("public sequence syntax keeps participants, message directions, arrow types and notes",()=>{
  const diagram=sequenceDiagram('Title: Greeting\nAlice->Bob: Hello Bob\nNote right of Bob: Bob thinks\nBob-->Alice: I am good\nAlice->>Bob: Open arrow\nNote over Alice,Bob: Shared');
  for(const text of ['participant p0 as Alice','participant p1 as Bob','p0->>p1: Hello Bob','p1-->>p0: I am good','Note right of p1: Bob thinks','Note over p0,p1: Shared','p0-)p1: Open arrow']) assert.ok(diagram.includes(text),text);
});
test("flow syntax retains every node, chained edge, yes/no branch and cycle",()=>{
  const diagram=flowDiagram('st=>start: Start\nop=>operation: Work\ncond=>condition: Ready?\ne=>end: End\nst->op->cond\ncond(yes)->e\ncond(no)->op');
  for(const text of ['n0(["Start"])','n2{"Ready?"}','n0 --> n1','n1 --> n2','n2 -->|yes| n3','n2 -->|no| n1']) assert.ok(diagram.includes(text),text);
});
test("unsupported syntax and missing nodes fail rather than silently dropping diagram content",()=>{
  assert.throws(()=>sequenceDiagram('Alice->Bob: Hello\nactivate Bob'),/不支持/);
  assert.throws(()=>flowDiagram('a=>operation: A\na->missing'),/未定义/);
  assert.throws(()=>flowDiagram('a=>operation: A\na=>end: End'),/重复/);
  assert.throws(()=>flowDiagram('a=>operation: A|approved'),/尚不支持/);
});
