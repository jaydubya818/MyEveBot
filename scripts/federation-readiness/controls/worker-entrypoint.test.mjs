import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {verifiedSource} from './worker-entrypoint.mjs';
test('exported source requires nonempty content hashes and an exact pin',()=>{
 const cwd=mkdtempSync('/private/tmp/fq-source-');const sha='a'.repeat(40);
 try{
  writeFileSync(`${cwd}/worker.js`,'synthetic');
  const stamp={sha,files:{'worker.js':createHash('sha256').update('synthetic').digest('hex')}};
  writeFileSync(`${cwd}/.fq-source.json`,JSON.stringify(stamp));
  assert.equal(verifiedSource(cwd,sha),sha);assert.throws(()=>verifiedSource(cwd,'b'.repeat(40)));
  writeFileSync(`${cwd}/worker.js`,'changed');assert.throws(()=>verifiedSource(cwd,sha));
  writeFileSync(`${cwd}/.fq-source.json`,JSON.stringify({sha,files:{}}));assert.throws(()=>verifiedSource(cwd,sha));
 }finally{rmSync(cwd,{recursive:true,force:true});}
});
