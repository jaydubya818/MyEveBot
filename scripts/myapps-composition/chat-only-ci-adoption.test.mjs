import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateCiMetadata,validateFileWitness,validateFinalizationMetadata,validatePublicProjection,
 metadataLimits} from '../../apps/eve/test/owner-chat-only/ci-entry.mts';

const hash=value=>createHash('sha256').update(value).digest('hex');
const h=letter=>letter.repeat(64),commit='a'.repeat(40),tree='b'.repeat(40);
function classified(value,code='MATCHED_SUPPLIED_METADATA'){
 assert.equal(value.code,code);assert.equal(value.scope,'SUPPLIED_METADATA_ONLY');
 assert.equal(value.executionAuthorized,false);assert.equal(value.runtimeQualified,false);
 assert.equal(value.artifactPublicationAuthorized,false);assert(Object.isFrozen(value));
 assert.equal(value.status,code==='MATCHED_SUPPLIED_METADATA'?'MATCHED_SUPPLIED_METADATA':'UNKNOWN_HOLD');
}
function ci(){
 const reference={profile:'CHAT_ONLY_V1',sourceCommit:commit,sourceTree:tree,lockSha256:h('c'),runId:'12345',attempt:1,
  serviceId:h('d'),pinnedImageDigest:'sha256:'+h('e'),actualImageId:'sha256:'+h('f'),
  hostPort:55491,containerPort:5432,systemIdentifier:'1234567890123456789',dataDirectory:'/owned/pgdata',
  role:'ux_fixture',database:'blocker_fixes',postgresMajor:17,toolInventorySha256:h('1'),scopeReviewSha256:h('2')};
 const observed={profile:'CHAT_ONLY_V1',declaredSource:commit,eventSourceOrigin:'REVIEWED_EVENT_SOURCE',checkoutCommit:commit,checkoutTree:tree,checkoutClean:true,lockSha256:h('c'),
  runId:'12345',attempt:1,declaredServiceId:h('d'),inspectedServiceId:h('d'),
  pinnedImageDigest:reference.pinnedImageDigest,actualImageId:reference.actualImageId,
  hostPort:55491,containerPort:5432,containerSystemIdentifier:reference.systemIdentifier,
  tcpSystemIdentifier:reference.systemIdentifier,containerDataDirectory:reference.dataDirectory,
  tcpDataDirectory:reference.dataDirectory,role:'ux_fixture',database:'blocker_fixes',postgresMajor:17,
  toolInventorySha256:h('1'),scopeReviewSha256:h('2'),capturedAtMs:1000,selectorOrigin:'DECLARED_CI_SERVICE_CONTEXT'};
 return {reference,observed};
}
test('matching supplied source/service/container-to-TCP metadata is classification only, never authority',()=>{
 const {reference,observed}=ci();classified(validateCiMetadata(reference,observed,1100));
 assert.notEqual(reference.hostPort,reference.containerPort);
});
test('checkout cleanliness must be explicitly true in the same fresh supplied observation',()=>{
 const {reference,observed}=ci();
 for(const checkoutClean of [false,'true','CLEAN','UNKNOWN',1,null,undefined])
  classified(validateCiMetadata(reference,{...observed,checkoutClean},1100),'SOURCE_MISMATCH');
 const missing={...observed};delete missing.checkoutClean;
 classified(validateCiMetadata(reference,missing,1100),'CONTRACT_INVALID');
 classified(validateCiMetadata(reference,{...observed,capturedAtMs:0},300001),'STALE_OBSERVATION');
 let reads=0;const accessor={...observed};Object.defineProperty(accessor,'checkoutClean',{get(){reads++;return true;}});
 classified(validateCiMetadata(reference,accessor,1100),'CONTRACT_INVALID');assert.equal(reads,0);
});
for(const field of ['declaredSource','checkoutCommit','checkoutTree','lockSha256'])test('source mismatch: '+field,()=>{
 const {reference,observed}=ci();observed[field]='0'.repeat(field==='lockSha256'?64:40);
 classified(validateCiMetadata(reference,observed,1100),'SOURCE_MISMATCH');
});
for(const field of ['runId','attempt','declaredServiceId','inspectedServiceId','pinnedImageDigest','actualImageId','hostPort','containerPort','selectorOrigin'])
 test('run/service/image/mapping mismatch: '+field,()=>{
  const {reference,observed}=ci();observed[field]=typeof observed[field]==='number'?observed[field]+1:'unmatched-private-input';
  classified(validateCiMetadata(reference,observed,1100),'SERVICE_MISMATCH');
 });
for(const field of ['toolInventorySha256','scopeReviewSha256'])test('tool/scope mismatch: '+field,()=>{
 const {reference,observed}=ci();observed[field]=h('0');classified(validateCiMetadata(reference,observed,1100),'TOOL_OR_SCOPE_MISMATCH');
});
for(const field of ['containerSystemIdentifier','tcpSystemIdentifier','containerDataDirectory','tcpDataDirectory','role','database','postgresMajor'])
 test('cluster witness mismatch: '+field,()=>{
  const {reference,observed}=ci();observed[field]='unmatched';classified(validateCiMetadata(reference,observed,1100),'CLUSTER_MISMATCH');
 });
test('missing/stale/future/nonfinite observations and caller-created activation flags fail closed',()=>{
 const {reference,observed}=ci();
 classified(validateCiMetadata(reference,{...observed,capturedAtMs:0},300001),'STALE_OBSERVATION');
 classified(validateCiMetadata(reference,{...observed,capturedAtMs:1101},1100),'STALE_OBSERVATION');
 classified(validateCiMetadata(reference,observed,Infinity),'CONTRACT_INVALID');
 for(const changed of [{...observed,attempt:undefined},{...observed,sourceClaim:'selfHEAD'},{...observed,GITHUB_ACTIONS:true}])
  classified(validateCiMetadata(reference,changed,1100),Object.hasOwn(changed,'attempt')&&changed.attempt===undefined?'SERVICE_MISMATCH':'CONTRACT_INVALID');
 const missing={...observed};delete missing.tcpSystemIdentifier;classified(validateCiMetadata(reference,missing,1100),'CONTRACT_INVALID');
 classified(validateCiMetadata({...reference,attempt:0},observed,1100),'CONTRACT_INVALID');
 classified(validateCiMetadata(reference,{...observed,profile:'FUTURE_WORK'},1100),'CONTRACT_INVALID');
 classified(validateCiMetadata(reference,{...observed,eventSourceOrigin:'SELF_OBSERVED_HEAD'},1100),'SOURCE_MISMATCH');
});

function identity(purpose='TOOL'){
 return {path:'/owned/copied/node',realPath:'/owned/copied/node',purpose,kind:'REGULAR',ownerUid:1001,
  mode:purpose==='TOOL'?0o755:0o444,links:1,device:'1',inode:'2',size:10,sha256:h('a'),mtimeNs:'1000',ctimeNs:'1000'};
}
test('matching supplied physical tool identity is not an executable-selection or launch grant',()=>{
 const file=identity();classified(validateFileWitness(file,{...file},{...file}));
});
for(const [key,value] of [['realPath','/alias/copied/node'],['kind','SYMLINK'],['ownerUid',0],['mode',0o666],['links',2],
 ['device','9'],['inode','99'],['size',11],['sha256',h('b')],['mtimeNs','1001'],['ctimeNs','1001']])
 test('alias/replacement/ownership/tool-byte mismatch: '+key,()=>{
  const file=identity();classified(validateFileWitness(file,file,{...file,[key]:value}),'FILE_WITNESS_INVALID');
 });

function finalization(){
 // Supplied fake clock/operation data; no operation callback or timer is run.
 let now=100;const tick=()=>now+=100;
 const fakeOperations=[{name:'setup',settledAt:tick()},{name:'admission-stop',settledAt:tick()},
  {name:'writers',settledAt:tick()},{name:'model-drain',settledAt:tick()},{name:'processes',settledAt:tick()},
  {name:'final-snapshot',settledAt:tick()},{name:'pool-close',settledAt:tick()},{name:'cluster-recheck',settledAt:tick()},
  {name:'session-absence',settledAt:tick()},{name:'nonforce-drop',settledAt:tick()},{name:'admin-close',settledAt:tick()},
  {name:'source-recheck',settledAt:tick()},{name:'join',settledAt:tick()}];
 const at=Object.fromEntries(fakeOperations.map(item=>[item.name,item.settledAt]));
 return {startedAt:100,setupSettledAt:at.setup,admissionStoppedAt:at['admission-stop'],lastRegistrationAt:150,
  writersSettledAt:at.writers,modelDrainedAt:at['model-drain'],processesSettledAt:at.processes,
  snapshotAt:at['final-snapshot'],poolsClosedAt:at['pool-close'],clusterRecheckedAt:at['cluster-recheck'],
  sessionsAbsentAt:at['session-absence'],droppedAt:at['nonforce-drop'],adminsClosedAt:at['admin-close'],
  sourceRecheckedAt:at['source-recheck'],joinedAt:at.join,spawnedGroups:5,registeredGroups:5,closedGroups:5,
  slot1MaxActive:3,slot2MaxActive:2,totalMaxActive:5,pendingSetup:0,pendingOperations:0,activeModelHandlers:0,
  commandLogBytesMax:100,firstFailure:'NONE',registryState:'PRESENT',noSpawnProven:false,identityState:'MATCHED',
  returnedDatabaseNames:['fixture_central','fixture_slot_1','fixture_slot_2'],
  registeredDatabaseNames:['fixture_central','fixture_slot_1','fixture_slot_2'],
  droppedDatabaseNames:['fixture_central','fixture_slot_1','fixture_slot_2'],
  unclaimedDatabaseCreates:0,unknownDatabaseResources:0,databaseCleanupMode:'NONFORCE',
  writersClosed:true,modelClosed:true,sourceStable:true,outerOwnerSettled:true,diagnostics:'OFF'};
}
test('fake finalized snapshot precedes pool close/drop and is joined with later cleanup/source metadata',()=>{
 const data=finalization();classified(validateFinalizationMetadata(data));assert(data.snapshotAt<data.droppedAt);
});
test('database ownership compares exact names across returned, registered and nonforce-dropped sets',()=>{
 const data=finalization();
 classified(validateFinalizationMetadata({...data,registeredDatabaseNames:[...data.registeredDatabaseNames].reverse()}));
 classified(validateFinalizationMetadata({...data,returnedDatabaseNames:[],registeredDatabaseNames:[],droppedDatabaseNames:[]}));
});
for(const [label,change] of [
 ['unclaimed partial create',{unclaimedDatabaseCreates:1}],
 ['unknown database resource',{unknownDatabaseResources:1}],
 ['force cleanup',{databaseCleanupMode:'FORCE'}],
 ['unknown cleanup mode',{databaseCleanupMode:'UNKNOWN'}],
 ['unregistered returned target',{registeredDatabaseNames:['fixture_central','fixture_slot_1']}],
 ['unregistered dropped target',{droppedDatabaseNames:['fixture_central','fixture_slot_1','unregistered_target']}],
 ['registered target never returned',{returnedDatabaseNames:['fixture_central','fixture_slot_1','other_returned']}],
 ['registered target not dropped',{droppedDatabaseNames:['fixture_central','fixture_slot_1']}],
])test('database finalization stays HOLD: '+label,()=>
 classified(validateFinalizationMetadata({...finalization(),...change}),'IDENTITY_UNKNOWN'));
test('database cleanup evidence is required, bounded and never defaulted from missing or malformed facts',()=>{
 const data=finalization();
 const fields=['returnedDatabaseNames','registeredDatabaseNames','droppedDatabaseNames','unclaimedDatabaseCreates','unknownDatabaseResources','databaseCleanupMode'];
 for(const field of fields){const missing={...data};delete missing[field];classified(validateFinalizationMetadata(missing),'CONTRACT_INVALID');}
 for(const change of [{unclaimedDatabaseCreates:-1},{unknownDatabaseResources:'0'},{databaseCleanupMode:true},
  {returnedDatabaseNames:['fixture_central','fixture_central']},{registeredDatabaseNames:'fixture_central'},
  {droppedDatabaseNames:['fixture_central','fixture_slot_1','fixture_slot_2','fourth_target']},{returnedDatabaseNames:['unsafe;DROP']},
  {returnedDatabaseNames:['a'.repeat(64)]}])
  classified(validateFinalizationMetadata({...data,...change}),'CONTRACT_INVALID');
 let reads=0;const names=[...data.returnedDatabaseNames];Object.defineProperty(names,'0',{get(){reads++;return 'fixture_central';}});
 classified(validateFinalizationMetadata({...data,returnedDatabaseNames:names}),'CONTRACT_INVALID');assert.equal(reads,0);
});
test('original failures survive missing or malformed database cleanup evidence',()=>{
 for(const firstFailure of ['OPERATION_FAILED','DEADLINE','CLEANUP_UNKNOWN','IDENTITY_UNKNOWN']){
  const missing={...finalization(),firstFailure};delete missing.registeredDatabaseNames;
  for(const data of [missing,{...finalization(),firstFailure,returnedDatabaseNames:null},
   {...finalization(),firstFailure,unknownDatabaseResources:'unknown'}]){
   const result=validateFinalizationMetadata(data);classified(result,'CONTRACT_INVALID');assert.equal(result.firstFailure,firstFailure);
  }
  const result=validateFinalizationMetadata({...finalization(),firstFailure,databaseCleanupMode:'FORCE'});
  classified(result,'FIRST_FAILURE_RETAINED');assert.equal(result.firstFailure,firstFailure);
 }
});
for(const [label,change] of [
 ['reviewed zero-total/no-spawn counterexample',{totalMaxActive:0,noSpawnProven:true}],
 ['total peak below slot 1',{totalMaxActive:2}],
 ['total peak below slot 2',{slot1MaxActive:1,slot2MaxActive:3,totalMaxActive:2}],
 ['peak exceeds total spawned',{spawnedGroups:2,registeredGroups:2,closedGroups:2,slot1MaxActive:2,slot2MaxActive:1,totalMaxActive:3}],
 ['zero spawn with positive activity',{spawnedGroups:0,registeredGroups:0,closedGroups:0,slot1MaxActive:1,slot2MaxActive:0,totalMaxActive:1,registryState:'ABSENT_NO_SPAWN',noSpawnProven:true}],
 ['positive spawn proven no-spawn',{noSpawnProven:true}],
 ['positive spawn with zero activity',{slot1MaxActive:0,slot2MaxActive:0,totalMaxActive:0}],
])test('contradictory process-group evidence stays HOLD: '+label,()=>
 classified(validateFinalizationMetadata({...finalization(),...change}),'IDENTITY_UNKNOWN'));
for(const change of [{admissionStoppedAt:1000001},{adminsClosedAt:1000001},{joinedAt:2000001},
 {slot1MaxActive:4},{slot2MaxActive:4},{totalMaxActive:6},{commandLogBytesMax:metadataLimits.commandLogBytes+1},{diagnostics:'ON'}])
 test('fake deadline/resource exhaustion stays HOLD: '+Object.keys(change)[0],()=>classified(validateFinalizationMetadata({...finalization(),...change}),'DEADLINE_OR_RESOURCE_LIMIT'));
test('late setup/registration cannot disappear behind a raced failure or ownership snapshot',()=>{
 const data=finalization();
 classified(validateFinalizationMetadata({...data,setupSettledAt:data.admissionStoppedAt+1}),'LATE_SETUP_OR_REGISTRATION');
 classified(validateFinalizationMetadata({...data,lastRegistrationAt:data.setupSettledAt+1}),'LATE_SETUP_OR_REGISTRATION');
});
for(const change of [{pendingSetup:1},{pendingOperations:1},{activeModelHandlers:1},{writersClosed:false},{modelClosed:false},{outerOwnerSettled:false}])
 test('unsettled fake operation: '+Object.keys(change)[0],()=>classified(validateFinalizationMetadata({...finalization(),...change}),'OPERATION_NOT_SETTLED'));
test('missing registry after spawn is UNKNOWN; absence is accepted only with explicit proven no-spawn data',()=>{
 const data=finalization();classified(validateFinalizationMetadata({...data,registryState:'MISSING_AFTER_SPAWN'}),'IDENTITY_UNKNOWN');
 classified(validateFinalizationMetadata({...data,closedGroups:4}),'IDENTITY_UNKNOWN');
 classified(validateFinalizationMetadata({...data,identityState:'EPERM'}),'IDENTITY_UNKNOWN');
 const none={...data,spawnedGroups:0,registeredGroups:0,closedGroups:0,slot1MaxActive:0,slot2MaxActive:0,totalMaxActive:0,
  registryState:'ABSENT_NO_SPAWN',noSpawnProven:true};classified(validateFinalizationMetadata(none));
 classified(validateFinalizationMetadata({...none,noSpawnProven:false}),'IDENTITY_UNKNOWN');
 const missing={...data};delete missing.pendingOperations;classified(validateFinalizationMetadata(missing),'CONTRACT_INVALID');
});
test('final snapshots cannot be invented after drop, before writer drain or from a reopened database',()=>{
 const data=finalization();
 for(const change of [{snapshotAt:data.droppedAt+1},{snapshotAt:data.modelDrainedAt-1},
  {sourceRecheckedAt:data.droppedAt-1},{sessionsAbsentAt:data.droppedAt+1}])
  classified(validateFinalizationMetadata({...data,...change}),'SNAPSHOT_ORDER_INVALID');
});
test('fixed original failure remains retained even if later fake cleanup facts are incomplete',()=>{
 const value=validateFinalizationMetadata({...finalization(),firstFailure:'OPERATION_FAILED',pendingOperations:1});
 classified(value,'FIRST_FAILURE_RETAINED');assert.equal(value.firstFailure,'OPERATION_FAILED');
});
test('a known original failure survives malformed or missing cleanup evidence without treating that evidence as settled',()=>{
 const data={...finalization(),firstFailure:'DEADLINE'};delete data.pendingOperations;
 const result=validateFinalizationMetadata(data);classified(result,'CONTRACT_INVALID');assert.equal(result.firstFailure,'DEADLINE');
 const unknown={...data,firstFailure:'PRIVATE_ERROR_TEXT'};
 const safe=validateFinalizationMetadata(unknown);classified(safe,'CONTRACT_INVALID');assert.equal(safe.firstFailure,'NONE');assert(!JSON.stringify(safe).includes('PRIVATE_ERROR_TEXT'));
});

function projection(){
 const reference={sourceCommit:commit,sourceTree:tree,lockSha256:h('c'),codeSha256:h('d'),codeReviewSha256:h('e'),
  codeOrigin:'REVIEWED_RUNTIME_INDEPENDENT_TRANSFORM',publicDirectory:'/owned/public',ownerUid:1001,
  writersSettledAt:1000,finalizedAt:1100};
 const common={version:1,profile:'CHAT_ONLY_V1',scope:'SUPPLIED_METADATA_ONLY'};
 const bodies={
  'chat-only-v1-result.json':{...common,slot1SyntheticCalls:3,slot2SyntheticCalls:3,workEffects:0,
   executionAuthorized:false,runtimeQualified:false,artifactPublicationAuthorized:false},
  'source-identity.json':{...common,sourceCommit:commit,sourceTree:tree,lockSha256:h('c'),codeSha256:h('d'),codeReviewSha256:h('e'),runtimeIndependent:true},
  'assertion-results.json':{...common,source:'SUPPLIED_MATCH',service:'SUPPLIED_MATCH',cluster:'SUPPLIED_MATCH',tool:'SUPPLIED_MATCH',finalization:'SUPPLIED_MATCH'},
 };
 return {reference,files:Object.entries(bodies).map(([name,body])=>publicFile(name,body))};
}
function publicFile(name,body,pad=0){
 const utf8Body=JSON.stringify(body)+' '.repeat(pad),file={...identity('PUBLIC_ARTIFACT'),
  path:'/owned/public/'+name,realPath:'/owned/public/'+name,size:Buffer.byteLength(utf8Body),sha256:hash(utf8Body)};
 return {name,reference:file,before:{...file},after:{...file},utf8Body};
}
test('three exact immutable bounded public metadata records remain nonauthorizing',()=>{
 const {reference,files}=projection();classified(validatePublicProjection(reference,files));
});
test('unknown or secret/runtime-derived projection fields never become public through a harmless key name',()=>{
 for(const extra of [{password:'PRIVATE_SECRET'},{promptSha256:h('f')},{environmentSha256:h('f')},{context:'private'}]){
  const {reference,files}=projection(),body={...JSON.parse(files[0].utf8Body),...extra};files[0]=publicFile(files[0].name,body);
  const result=validatePublicProjection(reference,files);classified(result,'PUBLIC_PROJECTION_INVALID');
  assert(!JSON.stringify(result).includes('PRIVATE_SECRET'));assert(!JSON.stringify(result).includes(h('f')));
 }
 for(const codeOrigin of ['RUNTIME_PORT_DEPENDENT','ENVIRONMENT_HASH','PROMPT_HASH','UNKNOWN']){
  const {reference,files}=projection();classified(validatePublicProjection({...reference,codeOrigin},files),'CODE_PROVENANCE_UNREVIEWED');
 }
 const {reference,files}=projection(),body=JSON.parse(files[1].utf8Body);body.runtimeIndependent=false;
 files[1]=publicFile(files[1].name,body);classified(validatePublicProjection(reference,files),'CODE_PROVENANCE_UNREVIEWED');
});
test('public artifact filename, size, aggregate, owner/inode replacement and writer-finalization checks fail closed',()=>{
 const {reference,files}=projection();
 for(const bad of [files.slice(1),[files[0],files[0],files[2]],[...files,files[0]]])classified(validatePublicProjection(reference,bad),'PUBLIC_PROJECTION_INVALID');
 const renamed=projection();renamed.files[0].name='raw-context.json';classified(validatePublicProjection(reference,renamed.files),'PUBLIC_PROJECTION_INVALID');
 const alias=projection();alias.files[0].after.inode='999';classified(validatePublicProjection(reference,alias.files),'PUBLIC_PROJECTION_INVALID');
 const wrongPath=projection();wrongPath.files[0].reference.path='/owned/private/raw.json';classified(validatePublicProjection(reference,wrongPath.files),'PUBLIC_PROJECTION_INVALID');
 const owner=projection();owner.files[0].after.ownerUid=0;classified(validatePublicProjection(reference,owner.files),'PUBLIC_PROJECTION_INVALID');
 const huge=projection();huge.files[0].utf8Body=' '.repeat(65537);classified(validatePublicProjection(reference,huge.files),'PUBLIC_PROJECTION_INVALID');
 const padded=files.map(f=>publicFile(f.name,JSON.parse(f.utf8Body),50000));classified(validatePublicProjection(reference,padded),'PUBLIC_PROJECTION_INVALID');
 classified(validatePublicProjection({...reference,finalizedAt:999},files),'PUBLIC_PROJECTION_INVALID');
 const granted=projection(),body=JSON.parse(granted.files[0].utf8Body);body.executionAuthorized=true;
 granted.files[0]=publicFile(granted.files[0].name,body);classified(validatePublicProjection(reference,granted.files),'PUBLIC_PROJECTION_INVALID');
});
test('public bytes cannot hide discarded duplicate values, noncanonical text or unreviewed code provenance',()=>{
 const {reference,files}=projection();
 const target=files[0],raw=target.utf8Body.replace('"scope":"SUPPLIED_METADATA_ONLY"','"scope":"PRIVATE_SECRET","scope":"SUPPLIED_METADATA_ONLY"');
 const file={...target.reference,size:Buffer.byteLength(raw),sha256:hash(raw)};
 files[0]={...target,utf8Body:raw,reference:file,before:{...file},after:{...file}};
 const result=validatePublicProjection(reference,files);classified(result,'PUBLIC_PROJECTION_INVALID');assert(!JSON.stringify(result).includes('PRIVATE_SECRET'));
 const other=projection();other.files[1]=publicFile(other.files[1].name,{...JSON.parse(other.files[1].utf8Body),codeSha256:h('f')});
 classified(validatePublicProjection(other.reference,other.files),'CODE_PROVENANCE_UNREVIEWED');
});
test('opaque/getter/proxy/coercion inputs do not run user hooks or leak arbitrary errors',()=>{
 let touched=0;const trap=()=>{touched++;throw Error('PRIVATE_SECRET');};
 const proxy=new Proxy({},{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap,ownKeys:trap});
 const revoked=Proxy.revocable({},{});revoked.revoke();
 const {reference,observed}=ci(),accessor={...observed};Object.defineProperty(accessor,'runId',{get:trap});
 for(const value of [proxy,revoked.proxy,accessor])assert.equal(validateCiMetadata(reference,value,1100).status,'UNKNOWN_HOLD');
 classified(validateFileWitness(proxy,proxy,proxy),'FILE_WITNESS_INVALID');
 classified(validateFinalizationMetadata(proxy),'CONTRACT_INVALID');
 classified(validatePublicProjection(proxy,proxy),'PUBLIC_PROJECTION_INVALID');
 const p=projection(),arrayProxy=new Proxy(p.files,{get:trap});classified(validatePublicProjection(p.reference,arrayProxy),'PUBLIC_PROJECTION_INVALID');
 assert.equal(touched,0);
});
test('module has only pure builtin imports and no runner/observer/CLI wiring',()=>{
 const source=readFileSync(new URL('../../apps/eve/test/owner-chat-only/ci-entry.mts',import.meta.url),'utf8');
 assert.deepEqual([...source.matchAll(/^import .* from '([^']+)';$/gm)].map(match=>match[1]),['node:util','node:crypto']);
 for(const forbidden of ['process.','readFile','writeFile','execFile','spawn(','fetch(','setTimeout(','Date.now','Env.create','execute('])assert(!source.includes(forbidden));
 assert(!existsSync(new URL('../../.github/workflows/chat-only-v1.yml',import.meta.url)));
 assert(!existsSync(new URL('../../apps/eve/test/owner-chat-only/public-result.mjs',import.meta.url)));
});

const protectedSourceHashes={
  "scripts/myapps-composition/owned-browser-fixture.mjs": "b873c207448a7162d78feafec02cb9c78f6562769152c19a9c60aae563db07af",
  "scripts/myapps-composition/owned-runtime-processes.mjs": "e999663888d36d4ff6f709a823cdc9b65f877281f28eb6ea120643fc8d7181bb",
  "scripts/myapps-composition/owned-process-registry.mjs": "b0a7bef82eed6274930d1a6bf35000eaac844f0df2c4c20183c4155bda88fa52",
  "scripts/myapps-composition/owned-listener-observation.mjs": "0a081e2de944171dfc74566aab245f297087b929e8913711d980545ba663d873",
  "scripts/myapps-composition/current-build-producer.mjs": "e768a3964d073715031daf24dd6c44e404fa38e72c591b80149d7954538e6b2e",
  "scripts/myapps-composition/current-native-operator.py": "e88c46f99935c255c03823c61e8ad6629b88d71ed1df6c349ca7781672bf60b5",
  "scripts/myapps-composition/fixture-dependencies.mjs": "e229e86b169d491d884345b14aa345342495b068ed1a56815f0e403b63a73c98",
  "scripts/myapps-composition/current-qe-runtime.mjs": "e7dfa89796439cfa0d7bdb6663b4fbd47d8109ebd882af1ce64fa53c9646b390",
  "apps/eve/test/owner-chat-only/runner-prod.ts": "2de5516b2007f53a67935c7983c245acfb90160e97b45ff7a15a6a23a5a521c0",
  "apps/eve/test/owner-chat-only/setup.ts": "4c75850677f9843295e799ab07dc5b92d9b2d63030beba79b715d24732b35901",
  "apps/eve/test/owner-chat-only/chat-only.spec.cjs": "6ee78741f9ddfc74f3d638044cb4929a48706540119313804889cd80fa6d7151",
  "apps/eve/test/owner-chat-only/playwright.config.cjs": "9cbe5080fb5d2bce2f6f458fa5e2fadd703bd84b5aa9a045512d04aca3a0a674",
  "apps/eve/test/owner-chat-only/provenance.cjs": "974ef9c9cd232c3e474e11c7b5941320b31e38a64f3a7abe0e0291f98dc6305c",
  "apps/eve/lib/external-alpha/work-test-fixture.ts": "90f08f2f8097a3706b9204437c18fd5ed5ed939e42e58c7485300a989890f961",
  ".github/workflows/owner-ux.yml": "a32fc21f3c5350b9262d0b0e2ec08245203d326aeb4b51ea4690d09c7bc90d1d",
  ".github/workflows/myapps-composition.yml": "d3ee3d04970c3a5c47344aeec83c2e3c7b6fe780ba9e7deedf78f7f4049af4e9",
  "apps/eve/test/owner-chat-only/transport.cjs": "775ce4b368c59a0460ab67e3030b65f3c17129da65eb10326fa42c93d0d515ca",
  "apps/eve/test/owner-chat-only/gateway.ts": "f83d059cb527b34b7adfe1e10f394844f0eb4a5fc3936f4591e5372f08b943d6",
  "apps/eve/test/browser/mobile-conversation-layout.mjs": "b6395800153053674056c7e8f611b64f8a36e524b08be6f719db1a63d6978e4c",
  "package.json": "c07bb2bea18c4200ba28c87c4ddcb6a0d24b564645677be06af4ae6fbc635db4",
  "package-lock.json": "debed795a8e948e1829e15097e32b90c73f779747d11d986159eb6879a9ca892",
  "apps/eve/package.json": "1d7208cd290deead764daf05389ff8356e1d1162f5ddcae1423c2c6e04959f98",
  "apps/eve/app/layout.tsx": "d00342c793b7043d29c18c3d5b867c2365b9faf0c9b6f9a19e8dd7e5566d7d76",
  "apps/eve/next.config.ts": "da84803da77d30e8ffc15b81d0ddd8f031b21864d4b9f878172dd9d2e2dde8b2",
  "scripts/myapps-composition/current-runtime-bootstrap.mjs": "2d22685d6cbaa927d25fbeba7197f2757f431f1d7faaf0ff344b02bef28bc270",
  "scripts/myapps-composition/current-qe-seams.mjs": "759a6256ee29626a4bdd43408c5a4f731d74609a27e3c58cf5dfe24162ab60a9",
  "scripts/myapps-composition/positive-work-release-precondition.mjs": "89fbb070ff0a4d3243fd53c8428a1d942df81440acdb332f9ca796133a30ffd8",
  "scripts/myapps-composition/check-positive-work-release.mjs": "81b4d686407d8bd6128ca23c9175b5b3accd7396fc8efad55bfcca33783e8747",
  "apps/eve/test/owner-journey/positive-work-v1-archive.json": "de2275aaf38dc39645772c11d6068f72fc10a822e5f67272a10f275d0f84b86a",
  "apps/eve/test/owner-journey/POSITIVE_WORK_QUALIFICATION.md": "c5739e7711a2bb859c2d1643964d1153c651c8c1b6fc822582778ff64ef7777b"
};
test('required workflows and source/package inputs stay frozen after documented ordinary peer-pin reconciliation',()=>{
 for(const [path,expected] of Object.entries(protectedSourceHashes))assert.equal(hash(readFileSync(new URL('../../'+path,import.meta.url))),expected,path);
 const archive=JSON.parse(readFileSync(new URL('../../apps/eve/test/owner-journey/positive-work-v1-archive.json',import.meta.url)));
 assert.equal(Object.keys(archive.files).length,10);
 for(const [path,expected] of Object.entries({...archive.files,...archive.releaseGuardFiles}))assert.equal(hash(readFileSync(new URL('../../'+path,import.meta.url))),expected,path);
});
test('the original runner README is preserved verbatim before the metadata-only addendum',()=>{
 const body=readFileSync(new URL('../../apps/eve/test/owner-chat-only/README.md',import.meta.url));
 assert.equal(hash(body.subarray(0,9591)),"020d6f23d93c206298588fa65cea44fb3c151c83b30c2817f3be5876c2071007");
 assert(body.toString().includes('executionAuthorized:false'));
});
