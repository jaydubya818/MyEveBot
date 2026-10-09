import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {applyComposerOverlay,reviewedComposer as manifest} from './composer-overlay.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url));
const read=(sha,path)=>{
  const result=spawnSync('git',['-C',root,'show',`${sha}:${path}`],{encoding:'utf8',maxBuffer:32*1024*1024});
  if(result.status!==0){assert.match(result.stderr,/does not exist in/);return null;}
  return result.stdout;
};
function fixture(){const writes=new Map();return{writes,args:{name:'myeve',integration:manifest.integration,source:manifest.source,read,readComposed:path=>read(manifest.integration,path),put:(path,bytes)=>writes.set(path,bytes)}};}

test('only exact focus patch plus committed browser regression and documentation enter composition',()=>{
  const {writes,args}=fixture(),result=applyComposerOverlay(args);
  assert.deepEqual([...writes.keys()],[manifest.path,...Object.keys(manifest.files)]);
  assert.equal(writes.get(manifest.path),read(manifest.source,manifest.path));
  assert.equal(result.method,'EXACT_CANONICAL_PATCH');
  assert(writes.get(manifest.path).includes('composer.setSelectionRange(savedFocus.start, savedFocus.end, savedFocus.direction)'));
  assert(!writes.has('apps/eve/vercel.json'));assert(!writes.has('.github/workflows/owner-ux.yml'));
});
test('changed source pins, canonical code, or MyApps lifecycle bytes require explicit reconciliation',()=>{
  for(const kind of ['source','integration','canonical','lifecycle','test']) {
    const {writes,args}=fixture();
    const patch=kind==='source'||kind==='integration'?{[kind]:'0'.repeat(40)}:
      kind==='canonical'?{read:(sha,path)=>args.read(sha,path)+(sha===manifest.source&&path===manifest.path?'\n':'')}:
        kind==='lifecycle'?{readComposed:path=>path===manifest.path?args.readComposed(path)+'\n// newer MyApps lifecycle\n':args.readComposed(path)}:
          {read:(sha,path)=>args.read(sha,path)+(path.endsWith('.spec.cjs')?'\n':'')};
    assert.throws(()=>applyComposerOverlay({...args,...patch}),/Unreviewed|Changed/);
    assert.equal(writes.size,0);
  }
});
