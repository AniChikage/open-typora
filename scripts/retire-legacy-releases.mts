// One-time rename cleanup. Source tags and history are deliberately retained.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import manifest from './legacy-release-manifest.json' with {type:'json'};
const repository='AniChikage/open-markdown-lane', tag='v0.23.0';
assert.equal(process.env.GH_REPO,repository);
assert.ok(['refs/heads/main','refs/tags/v0.23.0'].includes(process.env.GITHUB_REF || ''), 'Cleanup is restricted to main or the verified release tag');
const api=(endpoint:string)=>JSON.parse(execFileSync('gh',['api',`repos/${repository}/${endpoint}`],{encoding:'utf8'}));
const replacement=api(`releases/tags/${tag}`);
assert.equal(replacement.draft,false);assert.equal(replacement.prerelease,false);
assert.equal(replacement.name,'Open Markdown Lane 0.23.0');
assert.equal(api('releases/latest').id,replacement.id);
const expected=['arm64.dmg','arm64.zip','windows-x64-Setup.exe','windows-x64.zip','linux-x64.deb','linux-x64.AppImage'].map(s=>`Open-Markdown-Lane-0.23.0-${s}`).concat('SHA256SUMS.txt').sort();
assert.deepEqual(replacement.assets.map((a:{name:string})=>a.name).sort(),expected);
// Verify all replacement bytes before any deletion, not only asset metadata.
const folder=await mkdtemp(path.join(os.tmpdir(),'lane-release-'));
try {
 execFileSync('gh',['release','download',tag,'--repo',repository,'--dir',folder],{stdio:'inherit'});
 const sums=await readFile(path.join(folder,'SHA256SUMS.txt'),'utf8');
 assert.equal(sums.trim().split('\n').length,6);
 for(const name of expected.filter(n=>n!=='SHA256SUMS.txt')) assert.ok(sums.includes(`  ${name}\n`));
 execFileSync('sha256sum',['--check','SHA256SUMS.txt'],{cwd:folder,stdio:'inherit'});
 const current=api('releases?per_page=100') as {id:number;tag_name:string}[];
 for(const item of manifest) {
  const found=current.find(r=>r.id===item.id);
  if(!found) continue;
  assert.equal(found.tag_name,item.tag);assert.notEqual(item.id,replacement.id);
  execFileSync('gh',['api','--method','DELETE',`repos/${repository}/releases/${item.id}`],{stdio:'inherit'});
  console.log(`Retired ${item.tag} release and binaries; source tag retained`);
 }
 const remaining=api('releases?per_page=100') as {id:number}[];
 assert.ok(remaining.every(r=>!manifest.some(old=>old.id===r.id)));
 console.log('PASS: legacy releases removed; verified Open Markdown Lane release retained');
} finally {await rm(folder,{recursive:true,force:true});}
