import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,readdirSync,realpathSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {sealRuntimeOutput} from './runtime-output-seal.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const portable=path=>path.split(sep).join('/');
const metadata=path=>JSON.parse(readFileSync(join(path,'package.json'),'utf8'));
function inside(root,path){
 const key=relative(root,path);
 return key!==''&&key!=='..'&&!key.startsWith('..'+sep)&&!isAbsolute(key);
}
function packageName(value){
 return typeof value==='string'&&/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(value)
  &&!value.split('/').some(part=>part==='.'||part==='..');
}
function sourcePath(root,key){
 assert(typeof key==='string'&&key.split('/').every(part=>part&&part!=='.'&&part!=='..')
  &&!key.includes('\\')&&!isAbsolute(key),'TRACE_LOCK_PATH');
 const path=resolve(root,key);
 assert(inside(root,path)&&realpathSync(path)===path,'TRACE_SOURCE_ALIAS_OR_ESCAPE');
 return path;
}
const dependencyNames=value=>[...new Set(Object.keys(value.dependencies??{})
 .concat(Object.keys(value.optionalDependencies??{}),Object.keys(value.peerDependencies??{})))].sort();
function completePackageBody(root){
 const result=[];
 function walk(directory){
  for(const name of readdirSync(directory).sort()){
   if(name==='node_modules')continue; // Separate package boundary, resolved below.
   const path=join(directory,name),stat=lstatSync(path),key=portable(relative(root,path));
   assert(!stat.isSymbolicLink(),'TRACE_EQUIVALENCE_BODY_ALIAS_UNREVIEWED');
   if(stat.isDirectory()){
    result.push({path:key,type:'directory',mode:stat.mode&0o7777});walk(path);
   }else{
    assert(stat.isFile(),'TRACE_EQUIVALENCE_NONREGULAR_FILE');
    result.push({path:key,type:'file',mode:stat.mode&0o7777,bytes:stat.size,sha256:digest(readFileSync(path))});
   }
  }
 }
 walk(root);return result;
}

/** Full intrinsic body AND effective declared dependency/optional/peer context.
 * This is stronger than equal SRI/emitted subsets, and does not assert unobserved
 * dynamic import reachability or exports/main conditions. Actual module loads
 * still require the registered public-runtime witness.
 */
function assertSourceContextEquivalent(sourceRoot,lock,a,b,visited=new Set()){
 if(a===b)return;
 const pair=[a,b].sort().join('\0');if(visited.has(pair))return;visited.add(pair);
 const aa=lock.packages[portable(relative(sourceRoot,a))],bb=lock.packages[portable(relative(sourceRoot,b))];
 assert(aa&&bb&&!aa.link&&!bb.link,'TRACE_EQUIVALENCE_LOCKED_ORIGINS_REQUIRED');
 assert.equal(aa.integrity,bb.integrity,'TRACE_EQUIVALENCE_INTEGRITY');
 const before=metadata(a),after=metadata(b);
 assert.deepEqual(before,after,'TRACE_EQUIVALENCE_EFFECTIVE_PARENT_METADATA');
 assert.deepEqual(completePackageBody(a),completePackageBody(b),'TRACE_EQUIVALENCE_COMPLETE_SOURCE_BODY');
 for(const name of dependencyNames(before)){
  const left=resolvePackageDirectory(sourceRoot,a,name),right=resolvePackageDirectory(sourceRoot,b,name);
  assert.equal(left===null,right===null,'TRACE_EQUIVALENCE_EFFECTIVE_PARENT_ABSENCE');
  if(left)assertSourceContextEquivalent(sourceRoot,lock,left,right,visited);
 }
}

/** Resolve a package directory from its actual importing parent, without loading code.
 * This is node_modules directory lookup, not an exports/main resolver. The later
 * owned public-runtime witness must bind the actual loaded entry and conditions.
 */
export function resolvePackageDirectory(root,parent,name){
 root=realpathSync(root);parent=realpathSync(parent);
 assert(packageName(name),'TRACE_PACKAGE_NAME');
 assert(parent===root||inside(root,parent),'TRACE_PARENT_ESCAPE');
 for(let current=parent;;current=dirname(current)){
  if(current.split(sep).at(-1)!=='node_modules'){
   const candidate=join(current,'node_modules',name);
   if(existsSync(candidate)){
    const canonical=realpathSync(candidate);
    assert(inside(root,canonical),'TRACE_DEPENDENCY_ESCAPE');
    assert(lstatSync(canonical).isDirectory(),'TRACE_PACKAGE_DIRECTORY');
    assert.equal(metadata(canonical).name,name,'TRACE_DEPENDENCY_NAME');
    return canonical;
   }
  }
  if(current===root)break;
 }
 return null;
}

/**
 * Compare ALL emitted external package files with their selected installed bodies.
 * Requires separately authenticated installed inputs. This primitive does not
 * prove a fresh install, bundled module derivation, bootstrap or full reachability.
 */
export function verifyEmittedPackages(sourceDirectory,serverDirectory){
 const sourceRoot=realpathSync(sourceDirectory),serverRoot=realpathSync(serverDirectory);
 assert.notEqual(sourceRoot,serverRoot,'TRACE_DISTINCT_ROOTS');
 const lockBytes=readFileSync(join(sourceRoot,'package-lock.json'));
 const lock=JSON.parse(lockBytes);
 assert.equal(lock.lockfileVersion,3,'TRACE_LOCK_FORMAT');
 assert(lock.packages&&typeof lock.packages==='object','TRACE_LOCK_PACKAGES');
 const seal=sealRuntimeOutput(serverRoot);
 const roots=[];
 for(const entry of seal.entries){
  if(entry.type!=='file'||!entry.path.startsWith('node_modules/')
   ||!entry.path.endsWith('/package.json'))continue;
  const root=dirname(join(serverRoot,entry.path)),value=metadata(root);
  if(!packageName(value.name))continue; // Nested type-only package.json remains a body file.
  assert(typeof value.version==='string','TRACE_PACKAGE_VERSION');
  roots.push({root,key:portable(relative(serverRoot,root)),metadata:value});
 }
 assert(roots.length>0,'TRACE_NO_EMITTED_PACKAGES');
 roots.sort((a,b)=>a.key.localeCompare(b.key));
 const outputByRoot=new Map(roots.map(item=>[item.root,item]));
 const installed=[];
 for(const [key,locked] of Object.entries(lock.packages)){
  if(!key.split('/').includes('node_modules')||locked.link)continue;
  if(!existsSync(join(sourceRoot,key,'package.json')))continue; // Noninstalled optional platform.
  const root=sourcePath(sourceRoot,key),value=metadata(root);
  assert.equal(value.version,locked.version,'TRACE_INSTALLED_VERSION_DIFFERS_FROM_LOCK');
  assert.match(locked.integrity??'',/^sha512-[A-Za-z0-9+/]{86}==$/,'TRACE_LOCKED_SRI_REQUIRED');
  installed.push({key,root,metadata:value,locked});
 }
 const records=[],comparedFiles=new Set();
 for(const item of roots){
  const files=seal.entries.filter(entry=>entry.type==='file'&&entry.path.startsWith(item.key+'/')
   &&!entry.path.slice(item.key.length+1).split('/').includes('node_modules'));
  assert(files.some(entry=>entry.path===item.key+'/package.json'),'TRACE_METADATA_REQUIRED');
  const candidates=installed.filter(source=>{
   try{assert.deepEqual(source.metadata,item.metadata);return true;}catch{return false;}
  });
  assert(candidates.length>0,`TRACE_NO_LOCKED_METADATA_MATCH:${item.key}`);
  const matching=candidates.filter(source=>files.every(file=>{
   const key=file.path.slice(item.key.length+1),path=join(source.root,key);
   if(key==='package.json')return true; // Nitro may serialize identical JSON without newline.
   if(!existsSync(path)||realpathSync(path)!==path)return false;
   const stat=lstatSync(path);
   return stat.isFile()&&Boolean(stat.mode&0o111)===Boolean(file.mode&0o111)
    &&stat.size===file.bytes&&digest(readFileSync(path))===file.sha256;
  }));
  assert(matching.length>0,`TRACE_EMITTED_BODY_MISMATCH:${item.key}`);
  assert.equal(new Set(matching.map(source=>source.locked.integrity)).size,1,
   'TRACE_AMBIGUOUS_DISTINCT_PUBLISHED_BODIES');
  item.matches=matching;
  item.verifiedFiles=files;
  for(const file of files)comparedFiles.add(file.path);
  records.push({path:item.key,name:item.metadata.name,version:item.metadata.version,
   installedEquivalenceClass:matching.map(source=>source.key).sort(),
   integrity:matching[0].locked.integrity,files:files.map(file=>({
    path:file.path.slice(item.key.length+1),sha256:file.sha256,bytes:file.bytes,mode:file.mode})),
   packageMetadataComparison:'JSON_IDENTICAL',edges:[]});
 }
 // Propagate concrete installed origins from unique parents through actual
 // emitted parent edges. A duplicate metadata match is never selected by order.
 const origins=new Map(roots.map(item=>[item.root,new Set(item.matches.length===1?[item.matches[0].key]:[])]));
 const incomingEdges=new Map(roots.map(item=>[item.root,new Map()]));
 let changed=true;
 while(changed){
  changed=false;
  for(const item of roots){
   for(const name of dependencyNames(item.metadata)){
    const traced=resolvePackageDirectory(serverRoot,item.root,name);if(!traced)continue;
    const dependency=outputByRoot.get(traced);assert(dependency,'TRACE_RESOLVED_UNREGISTERED_PACKAGE');
    for(const origin of origins.get(item.root)){
     const source=item.matches.find(value=>value.key===origin);
     const resolved=resolvePackageDirectory(sourceRoot,source.root,name);
     assert(resolved,'TRACE_SOURCE_REQUIRED_EDGE_MISSING');
     const key=portable(relative(sourceRoot,resolved));
     assert(dependency.matches.some(value=>value.key===key),`TRACE_PARENT_RESOLUTION_MISMATCH:${item.key}:${name}`);
     const selected=origins.get(traced);
     const evidence={traceParent:item.key,sourceParent:source.key,name,sourceDependency:key,
      observation:'PRESENT_DECLARED_PARENT_DIRECTORY_LOOKUP'};
     incomingEdges.get(traced).set(JSON.stringify(evidence),evidence);
     if(!selected.has(key)){selected.add(key);changed=true;}
    }
   }
  }
 }
 for(let index=0;index<roots.length;index++){
  const item=roots[index],selected=origins.get(item.root);
  const matches=selected.size?item.matches.filter(value=>selected.has(value.key)):item.matches;
  for(const candidate of matches.slice(1))assertSourceContextEquivalent(sourceRoot,lock,matches[0].root,candidate.root);
  item.matches=matches;
  records[index].installedEquivalenceClass=matches.map(value=>value.key).sort();
  const evidence=[...incomingEdges.get(item.root).values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  records[index].originBinding=evidence.length?'ACTUAL_PARENT_SELECTED_LOCKED_ORIGINS':
   matches.length===1?'UNIQUE_LOCKED_BODY_MATCH':'COMPLETE_SOURCE_BODY_AND_EFFECTIVE_DECLARED_CONTEXT_EQUIVALENCE';
  records[index].incomingParentEvidence=evidence;
  if(matches.length>1){
   records[index].completeSourceBodySha256=digest(JSON.stringify(completePackageBody(matches[0].root)));
   records[index].effectiveDeclaredContextCompared=true;
  }
 }
 for(let index=0;index<roots.length;index++){
  const item=roots[index],record=records[index];
  for(const name of dependencyNames(item.metadata)){
   const traced=resolvePackageDirectory(serverRoot,item.root,name);
   if(!traced){
    record.edges.push({name,status:'DECLARED_NOT_EMITTED_NOT_ATTESTED'});continue;
   }
   const dependency=outputByRoot.get(traced);
   assert(dependency,'TRACE_RESOLVED_UNREGISTERED_PACKAGE');
   const sourceEdges=item.matches.map(source=>{
    const resolved=resolvePackageDirectory(sourceRoot,source.root,name);
    assert(resolved,'TRACE_SOURCE_REQUIRED_EDGE_MISSING');
    const key=portable(relative(sourceRoot,resolved));
    assert(dependency.matches.some(candidate=>candidate.key===key),
     `TRACE_PARENT_RESOLUTION_MISMATCH:${item.key}:${name}`);
    return {parent:source.key,dependency:key};
   });
   record.edges.push({name,status:'EMITTED_PARENT_EDGE_VERIFIED',
    dependency:portable(relative(serverRoot,traced)),sourceEdges});
  }
 }
 // Every file under node_modules must be owned by a verified package, including
 // files with no extension. Aliases are separately bound by the complete seal.
 for(const entry of seal.entries.filter(entry=>entry.type==='file'&&entry.path.startsWith('node_modules/')))
  assert(comparedFiles.has(entry.path),'TRACE_UNCOMPARED_EMITTED_FILE');
 return {format:'myapps.emitted-package-bodies.v1',
  status:'EMITTED_BODIES_AND_PRESENT_PARENT_EDGES_ONLY',lockSha256:digest(lockBytes),
  outputSealSha256:seal.sha256,packages:records,
  scope:'Installed input authenticity, bundled derivation, required closure, runtime and release not attested'};
}
