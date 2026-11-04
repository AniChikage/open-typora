import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {selectUpgradeAssets,verifyUpgradeChecksum} from '../scripts/download-upgrade-fixture.mts';
const asset=(name:string)=>({name,browser_download_url:`https://github.com/AniChikage/open-markdown-lane/releases/download/v0.23.0/${name}`});
const name='Open-Markdown-Lane-0.23.0-linux-x64.deb';
const release={tag_name:'v0.23.0',draft:false,prerelease:false,assets:[asset(name),asset('SHA256SUMS.txt')]};
test('upgrade fixture selects the exact platform/version and rejects ambiguous or external assets',()=>{
 assert.equal(selectUpgradeAssets(release,'linux').installer.name,name);
 assert.throws(()=>selectUpgradeAssets({...release,assets:[...release.assets,asset('Open-Typora-0.23.0-linux-x64.deb')]},'linux'));
 assert.throws(()=>selectUpgradeAssets({...release,assets:[{name,browser_download_url:'https://example.org/file'},asset('SHA256SUMS.txt')]},'linux'));
 assert.throws(()=>selectUpgradeAssets({...release,draft:true},'linux'));
 assert.throws(()=>selectUpgradeAssets(release,'windows'));
});
test('upgrade fixture requires one matching SHA256 and rejects corrupt bytes',()=>{
 const bytes=Buffer.from('fixture'), hash=createHash('sha256').update(bytes).digest('hex');
 const row=`${hash}  ${name}\n`;
 assert.equal(verifyUpgradeChecksum(row,name,bytes),hash);
 assert.throws(()=>verifyUpgradeChecksum(row,name,Buffer.from('changed')));
 assert.throws(()=>verifyUpgradeChecksum(row+row,name,bytes));
 assert.throws(()=>verifyUpgradeChecksum('not a checksum',name,bytes));
});
