import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {applyGovernanceOverlay, reviewedGovernance as manifest} from './governance-overlay.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url));
const read=(sha,path)=>{
  const result=spawnSync('git',['-C',root,'show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});
  if(result.status!==0){assert.match(result.stderr,/does not exist in/);return null;}
  return result.stdout;
};
function fixture(){
  const inventory=JSON.parse(read(manifest.integration,'apps/eve/scripts/executor-inventory.json'));
  const writes=new Map();
  return {inventory,writes,args:{integration:manifest.integration,source:manifest.source,inventory,read,put:(path,bytes)=>writes.set(path,bytes)}};
}

test('exact canonical overlay resolves 41 findings and binds the required Proof assembly fix without touching unrelated entries',()=>{
  const {inventory,writes,args}=fixture(),before=structuredClone(inventory);
  const result=applyGovernanceOverlay(args);
  assert.equal(result.inventorySources.length,42);
  assert.equal(writes.size,5);
  assert.deepEqual([...writes.keys()].filter(path=>!path.endsWith('.test.ts')).sort(),[
    'apps/eve/agent/lib/context-assembly.ts','apps/eve/lib/external-alpha/bounded-context.ts',
  ]);
  for(const [path,entry] of Object.entries(before.executors))
    if(!Object.hasOwn(manifest.inventory,path))assert.deepEqual(inventory.executors[path],entry,path);
  assert(!writes.has('apps/eve/lib/external-alpha/allowance.ts'));
  assert(!writes.has('apps/eve/lib/external-alpha/shared-accounting.ts'));
  assert(!writes.has('apps/eve/scripts/check-executor-governance.ts'));
});

test('changed pins or canonical bytes fail before any output is written',()=>{
  for(const patch of [
    {source:'0'.repeat(40)},
    {integration:'0'.repeat(40)},
    {read:(sha,path)=>{const value=read(sha,path);return sha===manifest.source&&path.endsWith('bounded-context.ts')?value+'\n':value;}},
  ]){
    const {inventory,writes,args}=fixture(),before=structuredClone(inventory);
    assert.throws(()=>applyGovernanceOverlay({...args,...patch}),/Unreviewed/);
    assert.equal(writes.size,0);assert.deepEqual(inventory,before);
  }
});

test('unreviewed metadata or a stale unchanged-source fingerprint cannot be accepted',()=>{
  for(const mutate of [
    value=>{value.executors['agent/agent.ts'].reason+=' unreviewed';},
    value=>{value.executors['agent/agent.ts'].sha256='0'.repeat(64);},
    value=>{value.executors['lib/external-alpha/allowance.ts'].classification='READ_ONLY';},
  ]){
    const {inventory,writes,args}=fixture(),before=structuredClone(inventory);
    const altered=JSON.parse(read(manifest.source,'apps/eve/scripts/executor-inventory.json'));mutate(altered);
    assert.throws(()=>applyGovernanceOverlay({...args,read:(sha,path)=>sha===manifest.source&&path.endsWith('executor-inventory.json')?JSON.stringify(altered):read(sha,path)}),/Unreviewed canonical record/);
    assert.equal(writes.size,0);assert.deepEqual(inventory,before);
  }
});

test('overlay refuses a changed integration record instead of overwriting its review',()=>{
  const {inventory,writes,args}=fixture();
  inventory.executors['lib/external-alpha/allowance.ts'].reason+=' separately changed';
  const before=structuredClone(inventory);
  assert.throws(()=>applyGovernanceOverlay(args),/Changed governance record/);
  assert.equal(writes.size,0);assert.deepEqual(inventory,before);
});
