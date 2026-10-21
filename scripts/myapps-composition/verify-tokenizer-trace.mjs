import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync,writeFileSync,existsSync,realpathSync,lstatSync} from 'node:fs';
import {dirname,join,resolve,relative} from 'node:path';
import {execFileSync} from 'node:child_process';
import {reviewedAgentPackaging as reviewed} from './agent-packaging.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function packageRoot(require,name){
 let current=dirname(require.resolve(name));
 for(;;){
  const file=join(current,'package.json');
  if(existsSync(file)&&JSON.parse(readFileSync(file)).name===name)return current;
  const parent=dirname(current);assert.notEqual(parent,current,`Missing package root: ${name}`);current=parent;
 }
}
function within(root,path){
 const rel=relative(root,path);return rel!==''&&!rel.startsWith('../')&&rel!=='..';
}
function runtimeFiles(root,current=root){
 return readdirSync(current,{withFileTypes:true}).flatMap(entry=>{
  const path=join(current,entry.name);
  assert(!entry.isSymbolicLink(),`Symlink in traced runtime: ${path}`);
  if(entry.isDirectory())return entry.name==='node_modules'?[]:runtimeFiles(root,path);
  assert(entry.isFile(),`Nonregular package file: ${path}`);
  return /\.(?:cjs|mjs|js|json)$/.test(entry.name)?[relative(root,path)]:[];
 }).sort();
}
function regularParents(root,path){
 assert(within(root,realpathSync(path)),'Traced dependency escaped output');
 for(let current=path;current!==root;current=dirname(current)){
  assert(within(root,current),'Traced dependency escaped output');
  assert(lstatSync(current).isDirectory(),`Nonregular package parent: ${current}`);
 }
}

/** Verify the actual parent-resolved package closure, before loading any traced code. */
export function verifyTokenizerPackages(sourceRoot,serverRoot){
 sourceRoot=realpathSync(sourceRoot);serverRoot=realpathSync(serverRoot);
 const sourceRequire=createRequire(join(sourceRoot,'package.json'));
 const traceRequire=createRequire(join(serverRoot,'package.json'));
 const sourceLock=readFileSync(join(sourceRoot,'package-lock.json'));
 const locks=JSON.parse(sourceLock).packages;
 const lock=locks['node_modules/'+reviewed.dependency.name];
 assert.equal(lock.version,reviewed.dependency.version);assert.equal(lock.integrity,reviewed.dependency.integrity);
 const packages={},pending=[{name:reviewed.dependency.name,sourceRequire,traceRequire}];
 while(pending.length){
  const edge=pending.pop(),name=edge.name;
  const original=packageRoot(edge.sourceRequire,name),traced=packageRoot(edge.traceRequire,name);
  assert(within(sourceRoot,realpathSync(original)),'Source dependency escaped locked checkout');
  regularParents(serverRoot,traced);
  const key=relative(sourceRoot,original);
  if(packages[key]){assert.equal(packages[key].tracePath,relative(serverRoot,traced),'Inconsistent traced dependency resolution');continue;}
  const before=readFileSync(join(original,'package.json')),after=readFileSync(join(traced,'package.json'));
  const metadata=JSON.parse(before),locked=locks[key];
  assert(locked,`Dependency absent from lock: ${key}`);
  assert.equal(metadata.version,locked.version,`Installed package differs from lock: ${name}`);
  if(name===reviewed.dependency.name)assert.equal(metadata.version,reviewed.dependency.version);
  assert.deepEqual(JSON.parse(after),metadata,`Changed traced package metadata: ${name}`);
  const originalFiles=runtimeFiles(original),tracedFiles=runtimeFiles(traced);
  const omitted=[];
  // Node resolves index.js; this separate browserify UMD distribution has no Node import.
  if(name==='base64-js'&&!tracedFiles.includes('base64js.min.js')){
   assert.equal(metadata.version,'1.5.1');assert.equal(metadata.main,'index.js');
   assert.equal(metadata.browser,undefined);assert.equal(metadata.exports,undefined);
   const sha256=hash(readFileSync(join(original,'base64js.min.js')));
   assert.equal(sha256,'d2e82495607abf54f16e21de04d90ba9ce1605451667d88425babece988f148b');
   omitted.push({path:'base64js.min.js',sha256,reason:'Unused browserify UMD build; unchanged Node main index.js is traced'});
  }
  const requiredFiles=originalFiles.filter(path=>!omitted.some(file=>file.path===path));
  assert.deepEqual(tracedFiles,requiredFiles,`Changed traced runtime file set: ${name}`);
  const files={};
  for(const path of requiredFiles){
   if(path==='package.json')continue; // Nitro serializes identical metadata without a trailing newline.
   const a=readFileSync(join(original,path)),b=readFileSync(join(traced,path));
   assert(a.equals(b),`Changed or incomplete traced runtime bytes: ${name}/${path}`);files[path]=hash(a);
  }
  packages[key]={name,version:metadata.version,tracePath:relative(serverRoot,traced),files,omitted,sourceMetadataSha256:hash(before),traceMetadataSha256:hash(after),metadata:'JSON_IDENTICAL'};
  const parentSource=createRequire(join(original,'package.json')),parentTrace=createRequire(join(traced,'package.json'));
  pending.push(...Object.keys(metadata.dependencies??{}).map(name=>({name,sourceRequire:parentSource,traceRequire:parentTrace})));
 }
 return {packages,sourceLockSha256:hash(sourceLock)};
}

/** Real traced package closure plus pure tokenizer equivalence; no provider calls. */
export function verifyTokenizerTrace(sourceRoot,serverRoot){
 const closure=verifyTokenizerPackages(sourceRoot,serverRoot);
 assert.equal(hash(readFileSync(join(sourceRoot,reviewed.path))),reviewed.afterSha256,'Unreviewed authored packaging source');
 const sourceRequire=createRequire(join(resolve(sourceRoot),'package.json'));
 const traceRequire=createRequire(join(resolve(serverRoot),'package.json'));
 const source=sourceRequire(reviewed.dependency.name),traced=traceRequire(reviewed.dependency.name);
 const texts=['','Hello, world!','café e\u0301','日本語と中文','👩🏽‍💻👨‍👩‍👧‍👦','مرحبا שלום','line one\r\nconst x = 42;','https://example.invalid/a?b=1','\ud800'];
 const encodings=['gpt2','r50k_base','p50k_base','p50k_edit','cl100k_base','o200k_base'];
 const tokenDigests={};
 for(const encoding of encodings){
  const a=source.getEncoding(encoding),b=traced.getEncoding(encoding);
  tokenDigests[encoding]=texts.map(text=>{
   const expected=a.encode(text),actual=b.encode(text);assert.deepEqual(actual,expected,`Changed tokens: ${encoding}`);
   assert.equal(b.decode(actual),a.decode(expected),`Changed token decoding: ${encoding}`);
   return hash(JSON.stringify(actual));
  });
 }
 return {format:'myapps.tokenizer-trace.v1',status:'PASS',...closure,agentSha256:reviewed.afterSha256,encodings,unicodeCases:encodings.length*texts.length,tokenDigests,paidOperations:0,production:'NOT_RUN'};
}

if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const [sourceRoot,serverRoot,receipt]=process.argv.slice(2);assert(sourceRoot&&serverRoot&&receipt,'Usage: verify-tokenizer-trace.mjs SOURCE_ROOT OUTPUT_SERVER NEW_RECEIPT');
 const result=verifyTokenizerTrace(sourceRoot,serverRoot);
 result.source=execFileSync('git',['-C',sourceRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 writeFileSync(receipt,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(`Tokenizer trace PASS: ${Object.keys(result.packages).length} exact packages, ${result.unicodeCases} token/Unicode cases`);
}
