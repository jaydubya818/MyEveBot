import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {join,relative,sep} from 'node:path';
const under=(root,path)=>path===root||path.startsWith(root+sep);

/** Required closure of the ACTUAL public bootstrap/two-message path. The Eve
 * server cannot silently borrow a missing external from the source installation.
 * Adapter imports are a separately labeled, parent-rooted fixture boundary.
 * Unexecuted dynamic/tool paths remain outside this claim. */
export function validateCurrentLoadedClosure(build,witness){
 assert.equal(witness.kind,'eve');const root=build.output.root.path;
 const entries=new Map(build.output.entries.filter(row=>row.type==='file').map(row=>[join(root,row.path),row]));
 const external=new Map();
 for(const pkg of build.external.packages)for(const file of pkg.files)
  external.set(join(root,pkg.path,file.path),file);
 const actual=witness.loads.filter(row=>row.role==='OUTPUT');assert(actual.length>0,'CURRENT_OUTPUT_LOADS_REQUIRED');
 for(const row of actual){
  const path=fileURLToPath(row.url),entry=entries.get(path);
  assert(entry&&under(root,path),'CURRENT_UNSEALED_OUTPUT_LOAD');assert.equal(row.sha256,entry.sha256);assert.equal(row.mode,entry.mode);
  if(relative(root,path).startsWith('node_modules'+sep)){
   const file=external.get(path);assert(file,'CURRENT_LOADED_EXTERNAL_NOT_BODY_VERIFIED');
   assert.equal(row.sha256,file.sha256);assert.equal(row.mode,file.mode);
  }
 }
 for(const path of [join(root,'index.mjs'),join(root,'_libs/eve.mjs')])
  assert(actual.some(row=>fileURLToPath(row.url)===path&&row.observation==='RETURNED_SOURCE_BYTES_VERIFIED'),'CURRENT_REQUIRED_BUNDLED_SOURCE_NOT_LOADED');
 for(const row of witness.resolutions.filter(row=>row.url.startsWith('file:'))){
  const target=fileURLToPath(row.url),parent=row.parentURL?.startsWith('file:')?fileURLToPath(row.parentURL):null;
  if(parent&&under(root,parent))assert(under(root,target),'CURRENT_EVE_PARENT_ESCAPED_OUTPUT');
  assert(under(root,target)?row.role==='OUTPUT':row.role==='FIXTURE_TRANSPORT_DEPENDENCY','CURRENT_UNDECLARED_EVE_INPUT_FALLBACK');
 }
 for(const row of witness.loads)assert(['OUTPUT','FIXTURE_TRANSPORT_DEPENDENCY'].includes(row.role),'CURRENT_FOREIGN_EVE_MODULE');
 return {status:'OBSERVED_REQUIRED_PUBLIC_PATH_CLOSURE_BOUND',loadedOutputFiles:[...new Set(actual.map(row=>relative(root,fileURLToPath(row.url))))].sort(),
  externalLoadedFiles:[...new Set(actual.map(row=>fileURLToPath(row.url)).filter(path=>external.has(path)).map(path=>relative(root,path)))].sort(),
  bundled:['index.mjs','_libs/eve.mjs'],pg:'BUNDLED_DERIVATION_AND_PUBLIC_DATABASE_BEHAVIOR_BOUND_SEPARATELY',
  sourceFallback:'DENIED_FOR_EVE_SERVER',unexecutedToolOrDynamicPaths:'NOT_ATTESTED',
  sourceObservationLimits:[...new Set(actual.map(row=>row.observation))].sort()};
}
