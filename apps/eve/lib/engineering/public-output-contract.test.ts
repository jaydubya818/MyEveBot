import {describe,it,expect} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import capture from '../../test/fixtures/attempt7-output-contract.json';
import base from '../../test/fixtures/quantity-public-contract-base.json';
import {validatePublicOutputContract} from './public-output-contract.ts';
const path='test/output-contract.json' as const;
const binding={path,sha256:createHash('sha256').update(base.files[path]).digest('hex')};
function visible(test:string,source:string){const dir=mkdtempSync(join(tmpdir(),'quantity-contract-'));try{mkdirSync(join(dir,'test'));writeFileSync(join(dir,'test/quantity.test.mjs'),test);writeFileSync(join(dir,path),base.files[path]);writeFileSync(join(dir,'quantity.mjs'),source);return spawnSync(process.execPath,['--test','--test-reporter=tap'],{cwd:dir,encoding:'utf8',timeout:15000});}finally{rmSync(dir,{recursive:true,force:true});}}
describe('Attempt 7 public/independent output contract',()=>{
 it('reproduces original 11/11 visible pass twice and missing final LF in the captured candidate',()=>{
  for(let i=0;i<2;i++){const result=visible(capture.visibleTest,capture.source);expect(result.status).toBe(0);expect(result.stdout).toContain('# pass 11');}
  expect(capture.source).not.toContain("+ '\\n'");
 });
 it('public exact-byte tests reject captured candidate and accept an independently line-terminated implementation',()=>{
  const bad=visible(base.files['test/quantity.test.mjs'],capture.source);expect(bad.status).not.toBe(0);expect(bad.stdout).toContain('# fail 10');
  const good=visible(base.files['test/quantity.test.mjs'],capture.source.replace('process.stdout.write(', 'console.log('));expect(good.status).toBe(0);expect(good.stdout).toContain('# pass 11');
 });
 it('shared artifact constrains protected serialization without exposing hidden inputs or answers',()=>{
  expect(()=>validatePublicOutputContract(binding,base.files,[{expectedOutput:'{"quantity":113}\n',expectedExitCode:0}])).not.toThrow();
  for(const expectedOutput of ['{"quantity":113}','{"quantity":113}\n\n','{ "quantity":113 }\n','not-json\n'])expect(()=>validatePublicOutputContract(binding,base.files,[{expectedOutput,expectedExitCode:0}])).toThrow();
  expect(()=>validatePublicOutputContract({...binding,sha256:'0'.repeat(64)},base.files,[])).toThrow();
  expect(Object.keys(JSON.parse(base.files[path]))).toEqual(['version','serialization','terminalNewline','exitCode','stderr']);
 });
});
