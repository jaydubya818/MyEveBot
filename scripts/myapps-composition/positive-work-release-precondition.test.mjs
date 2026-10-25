import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {types} from 'node:util';
import {archivePath,archiveSha256,archivedWorkFiles,releaseGuardFiles,
 evaluatePositiveWorkPrecondition,parsePreconditionArguments} from './positive-work-release-precondition.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/\/$/,'');
const hash=body=>createHash('sha256').update(body).digest('hex');
const declared='a'.repeat(40),tree='b'.repeat(40);
function facts(){return {declaredSource:declared,checkoutSource:declared,checkoutTree:tree,
 sourceClean:true,profile:'golden',releaseMode:'CHAT_ONLY_V1',observedArchiveSha256:archiveSha256,
 workFileHashes:{...archivedWorkFiles},guardFileHashes:{...releaseGuardFiles}};}
function denied(value,code){assert.equal(value.status,'BLOCKED_NOT_QUALIFIED');assert.equal(value.positiveWorkQualified,false);if(code)assert.equal(value.code,code);}
for(const profile of ['golden','e3','independent'])test(profile+' remains a failed positive Work obligation even with all source facts matched',()=>{
 const value=evaluatePositiveWorkPrecondition({...facts(),profile});
 denied(value,'POSITIVE_WORK_CHAT_ONLY_RELEASE');assert.equal(value.sourceBinding,'MATCHED_CHECKOUT');assert(Object.isFrozen(value));
});
test('source mismatch, dirty or malformed source facts never qualify',()=>{
 for(const change of [{checkoutSource:'c'.repeat(40)},{sourceClean:false},{sourceClean:'true'},
  {declaredSource:'private-secret'},{checkoutTree:'missing'}])denied(evaluatePositiveWorkPrecondition({...facts(),...change}),'POSITIVE_WORK_SOURCE_BINDING_MISMATCH');
});
test('unknown/future profiles, release modes and source guards fail closed',()=>{
 denied(evaluatePositiveWorkPrecondition({...facts(),profile:'future-work'}),'POSITIVE_WORK_PROFILE_UNSUPPORTED');
 for(const releaseMode of ['WORK_ENABLED','',true,undefined])denied(evaluatePositiveWorkPrecondition({...facts(),releaseMode}),'POSITIVE_WORK_RELEASE_REQUALIFICATION_REQUIRED');
 for(const path of Object.keys(releaseGuardFiles))denied(evaluatePositiveWorkPrecondition({...facts(),guardFileHashes:{...releaseGuardFiles,[path]:'0'.repeat(64)}}),'POSITIVE_WORK_RELEASE_REQUALIFICATION_REQUIRED');
});
test('every historical Work body and exact archive bytes are required, not replaced by a chat assertion',()=>{
 assert.equal(Object.keys(archivedWorkFiles).length,10);
 const archive=readFileSync(join(root,archivePath));assert.equal(hash(archive),archiveSha256);
 const parsed=JSON.parse(archive);assert.equal(parsed.sourceCommit,'95cbd216d09724b1a0e346e7076c92aae99cb09b');
 assert.deepEqual(parsed.files,archivedWorkFiles);assert.deepEqual(parsed.releaseGuardFiles,releaseGuardFiles);
 for(const [path,expected] of Object.entries({...archivedWorkFiles,...releaseGuardFiles}))assert.equal(hash(readFileSync(join(root,path))),expected);
 for(const path of Object.keys(archivedWorkFiles))denied(evaluatePositiveWorkPrecondition({...facts(),workFileHashes:{...archivedWorkFiles,[path]:'0'.repeat(64)}}),'POSITIVE_WORK_ARCHIVE_DRIFT');
 denied(evaluatePositiveWorkPrecondition({...facts(),observedArchiveSha256:'0'.repeat(64)}),'POSITIVE_WORK_ARCHIVE_DRIFT');
});
test('config/client grants and extra contract keys cannot authorize Work',()=>{
 for(const change of [{allowWork:true},{fixtureBypass:true},{clientText:'approved'}, {configuration:{workEnabled:true}}])denied(evaluatePositiveWorkPrecondition({...facts(),...change}),'POSITIVE_WORK_DECLARED_CONTRACT_INVALID');
 const value=facts();value.guardFileHashes={...value.guardFileHashes,allowWork:true};denied(evaluatePositiveWorkPrecondition(value),'POSITIVE_WORK_RELEASE_REQUALIFICATION_REQUIRED');
});
test('getters, opaque values and proxies are never traversed or coerced',()=>{
 let touched=0;const error=()=>{touched++;throw Error('private');};
 const proxy=new Proxy({},{get:error,getOwnPropertyDescriptor:error,getPrototypeOf:error,ownKeys:error});
 const revoked=Proxy.revocable({},{});revoked.revoke();
 const accessor={...facts()};Object.defineProperty(accessor,'releaseMode',{get:error});
 for(const input of [undefined,null,proxy,revoked.proxy,accessor,{toJSON:error},'private'])denied(evaluatePositiveWorkPrecondition(input));
 const value=facts();value.guardFileHashes=proxy;denied(evaluatePositiveWorkPrecondition(value));assert.equal(touched,0);
});
test('CLI argument shape is exact and unknown config/profile/source flags do not create a success mode',()=>{
 assert.deepEqual(parsePreconditionArguments(['--source-commit',declared,'--journey','e3']),{declaredSource:declared,profile:'e3'});
 for(const args of [[],['--source-commit',declared,'--journey','future'],['--source-commit','secret','--journey','golden'],
  ['--source-commit',declared,'--journey','golden','--allow-work'],['--release','WORK','--journey','golden']])assert.equal(parsePreconditionArguments(args),null);
});

const pure=readFileSync(new URL('./positive-work-release-precondition.mjs',import.meta.url),'utf8');
const cli=readFileSync(new URL('./check-positive-work-release.mjs',import.meta.url),'utf8');
function cliHarness({argv=['--source-commit',declared,'--journey','golden'],gitFailure=false,dirty=false,drift=false}={}){
 const writes=[],commands=[],reads=[];
 const fakeRoot='/synthetic/repo';
 const files=Object.fromEntries([archivePath,...Object.keys(archivedWorkFiles),...Object.keys(releaseGuardFiles)].map(path=>[join(fakeRoot,path),readFileSync(join(root,path))]));
 if(drift)files[join(fakeRoot,Object.keys(releaseGuardFiles)[0])]=Buffer.from('changed guard');
 const process={argv:['node','/synthetic/check.mjs',...argv],env:{PATH:'/synthetic/bin',MYEVE_ALLOW_WORK:'true',CLIENT_APPROVED:'true'},stdout:{write(line){writes.push(line);}},exitCode:0};
 const scope={types,createHash,join,fileURLToPath:()=>fakeRoot,URL,process,
  realpathSync:path=>path,lstatSync(path){if(!files[path])throw Error('private-path');return {isFile:()=>true,isSymbolicLink:()=>false,size:files[path].length};},
  readFileSync(path){reads.push(path);if(!files[path])throw Error('private-path');return files[path];},
  execFileSync(file,args,options){commands.push({file,args,options});if(gitFailure)throw Error('private-environment-secret');
   return args[0]==='rev-parse'?declared+'\n'+tree+'\n':dirty?' M changed\n':'';}};
 const imports=/^import[\s\S]*?;\n/gm;
 const body=pure.replace(imports,'').replace(/\bexport /g,'')+'\n'+cli.replace(imports,'').replaceAll('import.meta.url',"'file:///synthetic/repo/scripts/myapps-composition/check.mjs'");
 runInNewContext(body,scope);
 assert.equal(process.exitCode,1);assert.equal(writes.length,1);
 const value=JSON.parse(writes[0]);denied(value);assert(Buffer.byteLength(writes[0])<2048);
 assert(!writes[0].includes('private-'));return {value,commands,reads};
}
test('thin CLI is always nonzero, observes only fixed owned files/Git metadata and never launches setup',()=>{
 const h=cliHarness();denied(h.value,'POSITIVE_WORK_CHAT_ONLY_RELEASE');
 assert.deepEqual(h.commands.map(value=>value.file),['/usr/bin/git','/usr/bin/git']);
 assert(h.commands.every(value=>value.options.timeout===10000&&value.options.env.GIT_OPTIONAL_LOCKS==='0'));
 assert(h.reads.every(path=>path.startsWith('/synthetic/repo/')));
 assert(!cli.includes('process.env.MYEVE_ALLOW_WORK'));
});
test('CLI invalid args or unavailable/dirty/drifted observations remain nonzero without leaking errors',()=>{
 const invalid=cliHarness({argv:['--allow-work']});assert.equal(invalid.commands.length,0);
 denied(cliHarness({gitFailure:true}).value,'POSITIVE_WORK_OBSERVATION_UNAVAILABLE');
 denied(cliHarness({dirty:true}).value,'POSITIVE_WORK_SOURCE_BINDING_MISMATCH');
 denied(cliHarness({drift:true}).value,'POSITIVE_WORK_RELEASE_REQUALIFICATION_REQUIRED');
});
test('required job names/matrix and old steps persist, with one always-run nonzero obligation before dependency/app setup',()=>{
 const workflow=readFileSync(new URL('../../.github/workflows/owner-ux.yml',import.meta.url),'utf8');
 const job=workflow.slice(workflow.indexOf('  owner-golden-journey:\n'));
 const at=job.indexOf('      - name: Required positive Work release preflight\n');
 const end=job.indexOf('      - run:',at);const block=job.slice(at,end);
 assert(at>0&&end>at);assert(block.includes('if: ${{ always() }}'));
 assert(block.includes('check-positive-work-release.mjs'));assert(!block.includes('continue-on-error'));assert(!block.includes('||'));
 assert(at<job.indexOf('npm ci'));assert(at<job.indexOf('Start isolated unpaid journey fixture'));
 assert(job.includes('journey: [golden, e3, independent]'));assert(job.includes('Private acceptance, completion, and same-conversation readback'));
 assert(job.includes('golden) npx playwright test'));assert(job.includes('e3) npx playwright test'));assert(job.includes('independent) npx playwright test'));
 const before=workflow.replace(block,'');assert.equal(hash(before),'1f6b53de61aee2cb43c3593855c4898ca4bed706162ccfdcf401a1c4984a23a9');
});
