import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {applyAgentPackaging,reviewedAgentPackaging as m} from './agent-packaging.mjs';
const read=(sha,path)=>execFileSync('git',['show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});
function fixture(){
 const inventory={executors:{[m.inventory.path]:structuredClone(m.inventory.before),unrelated:{classification:'RETAINED',sha256:'untouched'}}};
 const writes=new Map();
 return {writes,args:{integration:m.integration,canonical:m.canonical,read,readComposed:path=>read(path==='package-lock.json'?'HEAD':m.canonical,path),inventory,put:(p,s)=>writes.set(p,s)}};
}
test('supported tokenizer externalization changes only the exact packaging list and retains source classification',()=>{
 const {args,writes}=fixture();const proof=applyAgentPackaging(args);
 assert.equal(writes.size,1);
 assert.equal(writes.get(m.path).replace(m.hunk.to,m.hunk.from),read(m.canonical,m.path));
 assert.deepEqual(args.inventory.executors[m.inventory.path],m.inventory.after);
 assert.deepEqual(args.inventory.executors.unrelated,{classification:'RETAINED',sha256:'untouched'});
 assert.equal(proof.dependency.version,'1.0.21');assert.equal(proof.executionAuthority,'UNCHANGED');
});
test('changed pins, authored source, review or dependency cannot inherit packaging qualification',()=>{
 for(const kind of ['integration','canonical','source','composed','review','version','integrity']){
  const {args,writes}=fixture();
  if(kind==='integration'||kind==='canonical')args[kind]='0'.repeat(40);
  if(kind==='source')args.read=(sha,path)=>read(sha,path)+'\n';
  if(kind==='composed')args.readComposed=path=>read(path==='package-lock.json'?'HEAD':m.canonical,path)+'\n';
  if(kind==='review')args.inventory.executors[m.inventory.path].classification='UNREVIEWED';
  if(kind==='version'||kind==='integrity'){const previous=args.readComposed;args.readComposed=path=>{if(path!=='package-lock.json')return previous(path);const lock=JSON.parse(previous(path));lock.packages['node_modules/js-tiktoken'][kind]='changed';return JSON.stringify(lock);};}
  const before=structuredClone(args.inventory);
  assert.throws(()=>applyAgentPackaging(args),/Unreviewed|Changed/);
  assert.equal(writes.size,0);assert.deepEqual(args.inventory,before);
 }
});
