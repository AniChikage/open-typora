import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,truncate,symlink} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {pluginLimits} from '../build/runtime/shared/plugin-limits.mjs';
import {pluginModule,pluginPackage} from '../build/runtime/shared/plugin-module.mjs';
import {installPlugin,plugins} from '../build/runtime/electron/plugins.mjs';
import {pluginResource,validatePlugin} from '../build/runtime/electron/resources.mjs';

test('issue #7: multi-file modules above the old resource cap install, load and preserve original source',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'open-markdown-lane-issue7-'));
  try {
    const profile=path.join(root,'profile'),folder=path.join(root,'source');await mkdir(profile);await mkdir(folder);
    const original='module.exports.plugin=class extends BasePlugin {};\n/*'+'x'.repeat(700000)+'*/';
    await writeFile(path.join(folder,'index.js'),original);await writeFile(path.join(folder,'helper.js'),'/*'+'x'.repeat(700000)+'*/');
    const installed=await installPlugin(folder,profile),resource=await pluginResource(installed.url,profile);
    assert.ok(resource.bytes.length>1_010_000);assert.ok(resource.bytes.toString().includes(original));
    assert.deepEqual(await validatePlugin(installed.id,profile),{bytes:resource.bytes.length});
    const single=path.join(root,'single.js');
    for(const bytes of [975831,1009554,1011934]) {
      const prefix='module.exports.plugin=class {};/*',code=prefix+'x'.repeat(bytes-prefix.length-2)+'*/';
      assert.equal(Buffer.byteLength(code),bytes);
      await writeFile(single,code);const item=await installPlugin(single,profile);
      assert.ok((await pluginResource(item.url,profile)).bytes.toString().includes(code));
    }
  }finally{await rm(root,{recursive:true,force:true});}
});
test('plugin limits count UTF-8 bytes, allow exactly 16 MiB, and reject source/package/escaping overhead before installation',async()=>{
  const exact='/*'+'x'.repeat(pluginLimits.source-4)+'*/';
  assert.ok(pluginModule(exact).length>pluginLimits.source);
  assert.throws(()=>pluginModule(exact+'x'),/16 MiB/);
  assert.throws(()=>pluginModule('中'.repeat(Math.floor(pluginLimits.source/3)+1)),/16 MiB/);
  assert.throws(()=>pluginPackage('index.js',{'index.js':exact,'a.js':exact,'b.js':'x'}),/32 MiB/);
  // CSS quoting expands sixfold. Validate the actual wrapped size, not only input bytes.
  assert.throws(()=>pluginPackage('index.js',{'index.js':'module.exports.plugin=class {};','large.css':'\u0001'.repeat(11*1024*1024)}),/64 MiB/);
  const root=await mkdtemp(path.join(os.tmpdir(),'open-markdown-lane-plugin-source-limit-'));
  try{
    const profile=path.join(root,'profile');await mkdir(profile);const file=path.join(root,'large.js');await writeFile(file,exact+'x');
    await assert.rejects(installPlugin(file,profile),/16 MiB/);assert.deepEqual(await plugins(profile),[]);
    const folder=path.join(root,'source');await mkdir(folder);await writeFile(path.join(folder,'index.js'),'module.exports.plugin=class {};');
    await writeFile(path.join(folder,'large.css'),'\u0001'.repeat(11*1024*1024));
    await assert.rejects(installPlugin(folder,profile),/64 MiB/);assert.deepEqual(await plugins(profile),[]);
  }finally{await rm(root,{recursive:true,force:true});}
});
test('installed plugin preflight keeps resource bounds, regular-file and canonical-path checks with actionable errors',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'open-markdown-lane-plugin-resource-limit-'));
  try{
    const profile=path.join(root,'profile'),pluginsDir=path.join(profile,'plugins');await mkdir(pluginsDir,{recursive:true});
    const id='local-'+'a'.repeat(64),file=path.join(pluginsDir,id+'.mjs');await writeFile(file,'');await truncate(file,pluginLimits.resource);
    assert.deepEqual(await validatePlugin(id,profile),{bytes:pluginLimits.resource});
    await truncate(file,pluginLimits.resource+1);
    await assert.rejects(validatePlugin(id,profile),error=> (error as NodeJS.ErrnoException).code==='PLUGIN_TOO_LARGE' && (error as Error).message.includes('64 MiB'));
    await assert.rejects(pluginResource('opentypora://app/_plugins/'+id+'.mjs',profile),/64 MiB/);
    await rm(file);await assert.rejects(validatePlugin(id,profile),/重新安装/);
    const outside=path.join(root,'outside.mjs');await writeFile(outside,'owned fixture');await symlink(outside,file);
    await assert.rejects(validatePlugin(id,profile),/路径无效/);
    await assert.rejects(validatePlugin('../../outside',profile),/标识无效/);
  }finally{await rm(root,{recursive:true,force:true});}
});
