import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {applyFactoryCapabilityCompatibility,reviewedFactoryCapabilityCompatibility as manifest} from './factory-capability-compatibility.mjs';
import {applyFactoryMain} from './factory-main.mjs';
import {applyFixturesOverlay} from './fixtures-overlay.mjs';
import {readFileSync} from 'node:fs';
const fixtures=JSON.parse(readFileSync(new URL('../../docs/myapps/phase3/factory-main-fixture-sources.json',import.meta.url)));
function fixture(){
 const repo=process.env.MYFACTORY_SOURCE_ROOT;assert(repo,'MYFACTORY_SOURCE_ROOT required');
 const git=args=>spawnSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:32*1024*1024});
 const head=git(['rev-parse','HEAD']).stdout.trim(),merge=git(['merge-tree','--write-tree','--name-only',head,manifest.integration]);assert.equal(merge.status,1);
 const initialTree=merge.stdout.split('\n')[0];
 const read=(sha,path)=>{const r=git(['show',`${sha}:${path}`]);if(r.status!==0){assert.match(r.stderr,/does not exist in|exists on disk, but not in/);return null;}return r.stdout;};
 const current=new Map(),readComposed=p=>current.has(p)?current.get(p):read(initialTree,p),put=(p,s)=>current.set(p,s);
 applyFactoryMain({main:manifest.main,head,integration:manifest.integration,initialTree,read,readComposed,put});
 applyFixturesOverlay({name:'myfactory',integration:manifest.integration,source:'b12031ea65fa5c2e0a03763b931003ab78017580',main:manifest.main,mainManifest:fixtures,read,readComposed,put});
 const writes=new Map();return {current,writes,args:{source:manifest.source,main:manifest.main,integration:manifest.integration,read,readComposed,put:(p,s)=>writes.set(p,s)}};
}
test('exact reviewed server adapter follows both main and canonical fixture guards',()=>{
 const {args,writes}=fixture();const provenance=applyFactoryCapabilityCompatibility(args);
 assert.equal(writes.size,8);
 for(const [path,bytes] of writes)assert.equal(bytes,args.read(manifest.source,path),path);
 assert.equal(provenance.sourceDigest,'88d5cac68592267b3630b439614a057f94601f34f63323209721e9f1e3d503cb');
 assert.equal(provenance.installedBindings,'NOT_CONFIGURED');
 assert(!writes.has('apps/cloud-control/src/production-model-provider.mjs'));
});
test('substituted pins, source, every composed preimage or inventory drift fail atomically',()=>{
 for(const kind of ['source','main','integration','sourceBytes',...Object.keys(manifest.files),manifest.inventory.path]){
  const {args,writes,current}=fixture();
  if(['source','main','integration'].includes(kind))args[kind]='0'.repeat(40);
  else if(kind==='sourceBytes'){const read=args.read;args.read=(sha,p)=>read(sha,p)+(p===Object.keys(manifest.files)[0]?'\n':'');}
  else current.set(kind,args.readComposed(kind)+'\n');
  assert.throws(()=>applyFactoryCapabilityCompatibility(args),/Unreviewed|Changed/);assert.equal(writes.size,0);
 }
});
