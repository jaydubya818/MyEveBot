import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {chmodSync,existsSync,lstatSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {captureBuildInputs,verifyBuildInputs} from './build-input-inventory.mjs';
import {sealRuntimeOutput} from './runtime-output-seal.mjs';
import {verifyEmittedPackages} from './verify-emitted-packages.mjs';
import {registerOwnedProcess,closeOwnedProcess} from './owned-process-registry.mjs';
import {assertEveDerivedInputsAbsent,retainFailedBuildInputSnapshot,summarizeInputDifference,validateEveDerivedInputTransition,writePrivateInputInventory} from './eve-derived-inputs.mjs';

const LOCK='debed795a8e948e1829e15097e32b90c73f779747d11d986159eb6879a9ca892';
const AGENT='ad1d1ca8159bff6b0815ba3495b63a960250e27a727652f24914f9b22f4a1bd5';
const SDK={name:'eve',version:'0.66.3',integrity:'sha512-oJkQdVrlmb1GFeaSUNY6IF71ttXjQdFnkKQP+84Qlvs/M+fUqMjGTqnwevQ+qFvc8KCswo3cbBohKOCGdgZPFg=='};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=path=>readFileSync(path);
const pathKey=value=>{
 assert(typeof value==='string'&&!isAbsolute(value)&&!value.includes('\\')
  &&value.split('/').every(part=>part&&part!=='.'&&part!=='..'),'BUILD_SOURCE_PATH');return value;
};
const git=(root,...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:128*1024**2}).trim();

const BUILD_ENV_KEYS=new Set(['USER','NODE_ENV','NODE_OPTIONS','NEXT_TELEMETRY_DISABLED','DATABASE_URL','MYEVE_TEST_DATABASE_URL',
 'MYEVE_OWNER_ID','MYEVE_ACCESS_PASSWORD','MYEVE_SESSION_SECRET','MYEVE_APPLICATION_PASSWORDS','MYEVE_DURABLE_WEB_SESSIONS',
 'OWNER_NAME','NEXT_PUBLIC_OWNER_NAME','NEXT_PUBLIC_AGENT_NAME','OWNER_TIMEZONE','EVE_PROJECT_NAME','MYEVE_BETA_MODE',
 'MYEVE_ALPHA_REPOSITORY','MYEVE_ALPHA_MAX_WORK_USD','MYEVE_ALPHA_MAX_WORK_SECONDS','VERCEL_ENV','VERCEL_PROJECT_ID',
 'VERCEL_OIDC_TOKEN','MYEVE_EXTERNAL_ALPHA_POLICY','MYEVE_EXTERNAL_ALPHA_POLICY_SHA256','MYEVE_EXTERNAL_ALPHA_AUTHORITY_SIGNING_KEY',
 'MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL','MYEVE_EXTERNAL_ALPHA_ACCOUNTING_TOKEN','MYEVE_ENGINEERING_MODE',
 'MYEVE_FACTORY_WORKER_ENABLED','MYEVE_EXTERNAL_ALPHA_WORK_CONFIG','MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN',
 'MYEVE_EXTERNAL_ALPHA_FACTORY_PIN_SHA256','MYEVE_EXTERNAL_ALPHA_FACTORY_TOKEN','MYEVE_CHAT_ONLY_TRANSPORT_FILE',
 'MYEVE_CHAT_ONLY_MODEL_ORIGIN','WORKFLOW_LOCAL_BASE_URL']);

/** Key allowlist and local-only bindings; concrete ownership/identity of these
 * declared resources remains an exact operator preflight, not inferred from localhost.
 */
export function validateBuildEnvironment(value,app){
 assert(value&&Object.getPrototypeOf(value)===Object.prototype,'BUILD_ENV_REQUIRED');
 const unknown=Object.keys(value).filter(key=>!BUILD_ENV_KEYS.has(key)).sort();
 assert.equal(unknown.length,0,'BUILD_UNKNOWN_ENVIRONMENT_KEYS:'+unknown.join(','));
 assert(Object.values(value).every(item=>typeof item==='string'&&item.length<=64*1024&&!item.includes('\0')),'BUILD_ENV_STRING_VALUES');
 assert.equal(value.NODE_ENV,'production','BUILD_PRODUCTION_ENV_REQUIRED');
 assert.equal(value.VERCEL_ENV,'production','BUILD_AUTHENTICATED_FIXTURE_MODE_REQUIRED');
 assert.equal(value.MYEVE_BETA_MODE,'private-alpha','BUILD_ALPHA_FIXTURE_MODE_REQUIRED');
 assert.match(value.EVE_PROJECT_NAME??'',/^myeve-alpha-tester-[12]$/,'BUILD_FIXTURE_PROJECT_NAME');
 assert.match(value.VERCEL_PROJECT_ID??'',/^prj_fixture[A-Za-z0-9]+$/,'BUILD_FIXTURE_PROJECT_ID');
 assert.match(value.MYEVE_OWNER_ID??'',/^[a-f0-9-]{36}$/,'BUILD_FIXTURE_OWNER_ID');
 const allowedOptions=['owner-chat-only','owner-journey'].map(name=>'--max-old-space-size=5120 --require='+join(app,'test',name,'transport.cjs'));
 assert(allowedOptions.includes(value.NODE_OPTIONS),'BUILD_UNREVIEWED_LOADER');
 for(const name of ['DATABASE_URL','MYEVE_TEST_DATABASE_URL','MYEVE_EXTERNAL_ALPHA_ACCOUNTING_DATABASE_URL']){
  if(value[name]===undefined){assert(name!=='DATABASE_URL','BUILD_APP_DATABASE_REQUIRED');continue;}
  const url=new URL(value[name]);
  assert(url.protocol==='postgresql:'&&['127.0.0.1','localhost'].includes(url.hostname)
   &&url.port&&url.username==='ux_fixture'&&!url.search&&!url.hash
   &&/^\/ea_(?:work|chat_app|chat_central)_[a-f0-9]{32}$/.test(url.pathname),'BUILD_OWNED_DATABASE_SPEC_REQUIRED');
 }
 for(const name of ['MYEVE_CHAT_ONLY_MODEL_ORIGIN','WORKFLOW_LOCAL_BASE_URL']){
  if(value[name]===undefined)continue;
  const url=new URL(value[name]);
  assert(url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port&&url.pathname==='/'
   &&!url.search&&!url.hash&&!url.username&&!url.password,'BUILD_LOCAL_SERVICE_REQUIRED');
 }
 if(value.VERCEL_OIDC_TOKEN!==undefined)assert(value.VERCEL_OIDC_TOKEN.startsWith('fixture.')
  &&value.VERCEL_OIDC_TOKEN.endsWith('.fixture'),'BUILD_REAL_OIDC_CREDENTIAL_REJECTED');
 if(value.MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN!==undefined)
  assert.equal(value.MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN,'https://fixture-alpha-factory.vercel.app','BUILD_REAL_FACTORY_REJECTED');
 return {environmentKeys:Object.keys(value).sort(),
  bindingSha256:hash(JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))))),
  status:'LOCAL_BINDINGS_REQUIRE_EXACT_OPERATOR_OWNERSHIP'};
}

/** Only owned children; finite timeout, await close, retain first error and log.
 * This is not a process sandbox. The separately reviewed operator must constrain
 * transport/native/network resources and independently own any fixture database.
 */
export function observedCommand(binary,args,{cwd,env,log,timeoutMs,registry,cleanupGraceMs=3000}){
 assert(isAbsolute(binary)&&Array.isArray(args)&&args.every(arg=>typeof arg==='string'),'BUILD_COMMAND_ARRAY_REQUIRED');
 assert(Number.isInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=15*60_000,'BUILD_COMMAND_DEADLINE');
 assert(Number.isInteger(cleanupGraceMs)&&cleanupGraceMs>=3000&&cleanupGraceMs<=420000,'BUILD_COMMAND_CLEANUP_BUDGET');
 assert(['linux','darwin'].includes(process.platform),'BUILD_POSIX_OWNED_GROUP_REQUIRED');
 return new Promise((done,reject)=>{
  const child=spawn(binary,args,{cwd,env,detached:true,stdio:['ignore','pipe','pipe']});
  let registration,registrationFailure;
  if(registry)try{registration=registerOwnedProcess(registry,{pid:child.pid,binary,args,cwd});}catch(error){registrationFailure=error;}
  const chunks=[];let count=0,firstError,timer,killTimer,settleTimer,code,exitSignal,closed=false,exited=false,settling=false;
  const errors=[];let cleanupDeadline;
  function live(){
   if(!child.pid)return false;
   try{process.kill(-child.pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}
  }
  function kill(signal){
   if(!child.pid)return;
   try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')errors.push(error);}
  }
  function stop(error){
   firstError??=error;
   if(cleanupDeadline!==undefined)return;
   cleanupDeadline=performance.now()+cleanupGraceMs;kill('SIGTERM');
   killTimer=setTimeout(()=>kill('SIGKILL'),cleanupGraceMs);
   // Settlement is independent of close/stdio. An escaped descendant holding a
   // pipe can never keep this promise pending forever. It becomes UNKNOWN/fail;
   // this helper cannot claim to contain or stop escaped native descendants.
   clearTimeout(settleTimer);
   settleTimer=setTimeout(()=>finish(Error('BUILD_CHILD_EXIT_OR_STDIO_CLEANUP_UNKNOWN')),cleanupGraceMs+3000);
  }
  const interrupted=()=>stop(Error('BUILD_OPERATOR_INTERRUPTED'));
  process.on('SIGTERM',interrupted);process.on('SIGINT',interrupted);
  const collect=data=>{
   count+=data.length;
   if(count>16*1024**2)stop(Error('BUILD_LOG_LIMIT'));
   else chunks.push(Buffer.from(data));
  };
  child.stdout.on('data',collect);child.stderr.on('data',collect);
  child.once('error',error=>stop(error));
  timer=setTimeout(()=>stop(Error('BUILD_COMMAND_TIMEOUT')),timeoutMs);
  if(registrationFailure)stop(registrationFailure);
  child.once('exit',(value,signal)=>{
   exited=true;code=value;exitSignal=signal;
   settleTimer??=setTimeout(()=>finish(Error('BUILD_CHILD_STDIO_CLOSE_UNKNOWN')),3000);
  });
  child.once('close',(value,signal)=>{
   closed=true;code=value;exitSignal=signal;void finish();
  });
  async function finish(forcedError){
   if(settling)return;settling=true;
   if(forcedError)firstError??=forcedError;
   clearTimeout(timer);clearTimeout(settleTimer);
   try{
    const delay=()=>new Promise(resolve=>setTimeout(resolve,10));
    for(let attempt=0;attempt<100&&live();attempt++)await delay();
    if(live()){
     stop(Error('BUILD_CHILD_GROUP_DID_NOT_QUIESCE'));
     for(let attempt=0;attempt<Math.ceil(cleanupGraceMs/10)&&live()&&performance.now()<cleanupDeadline;attempt++)await delay();
     if(live())kill('SIGKILL');
     for(let attempt=0;attempt<300&&live();attempt++)await delay();
     if(live())errors.push(Error('BUILD_CHILD_GROUP_CLEANUP_UNKNOWN'));
    }
    if(!closed||(!exited&&child.pid))errors.push(Error('BUILD_CHILD_EXIT_OR_STDIO_CLEANUP_UNKNOWN'));
    // Destroy only our pipe handles. An unobserved/escaped process is explicitly
    // NOT declared stopped; the concrete operator must retain and resolve HOLD.
    child.stdout.destroy();child.stderr.destroy();child.unref();
    if(registration&&!live())closeOwnedProcess(registry,registration);
    writeFileSync(log,Buffer.concat(chunks),{flag:'wx',mode:0o600});
    if(errors.length)throw new AggregateError([...(firstError?[firstError]:[]),...errors],'Build child or cleanup failed');
    if(firstError)throw firstError;
    assert.equal(code,0,`BUILD_COMMAND_FAILED:${code??exitSignal}`);
    done({pid:child.pid,processGroupId:child.pid,exitCode:code,groupQuiescent:true,cleanupScope:'OWN_PROCESS_GROUP_ONLY',
     binary,args,cwd,logSha256:hash(bytes(log))});
   }catch(error){reject(firstError&&error!==firstError&&!(error instanceof AggregateError&&error.errors.includes(firstError))
    ?new AggregateError([firstError,error],'Build failed with cleanup/evidence failure'):error);
   }finally{
    child.stdout.destroy();child.stderr.destroy();child.unref();
    clearTimeout(killTimer);clearTimeout(settleTimer);process.removeListener('SIGTERM',interrupted);process.removeListener('SIGINT',interrupted);
   }
  }
 });
}

/** Prospective fresh-install/build producer. Inert until explicitly called by
 * an exact independently reviewed operator; no preexisting output/install reuse.
 * Returns only observed build derivation, NEVER complete packaging/runtime PASS.
 */
const preparedBuilds=new WeakMap();

export async function prepareCurrentBuild(spec){
 assert.deepEqual(Object.keys(spec).sort(),['sourceRoot','sourceCommit','workRoot','sdkArchive',
  'toolchain','overlays'].sort(),'BUILD_PREPARE_SPEC_FIELDS');
 assert.match(spec.sourceCommit,/^[a-f0-9]{40}$/);
 const sourceRoot=realpathSync(spec.sourceRoot);
 assert.equal(git(sourceRoot,'rev-parse','HEAD'),spec.sourceCommit,'BUILD_SELECTED_COMMIT');
 assert.equal(git(sourceRoot,'status','--porcelain'),'','BUILD_CLEAN_SOURCE_REQUIRED');
 const sourceTree=git(sourceRoot,'rev-parse','HEAD^{tree}');
 assert.equal(hash(bytes(join(sourceRoot,'package-lock.json'))),LOCK,'BUILD_UNKNOWN_LOCK_PROFILE');
 assert.equal(hash(bytes(join(sourceRoot,'apps/eve/agent/agent.ts'))),AGENT,'BUILD_UNKNOWN_AUTHORED_PROFILE');
 const archive=realpathSync(spec.sdkArchive),archiveStat=lstatSync(archive);
 assert.equal(archive,spec.sdkArchive,'BUILD_SDK_ARCHIVE_ALIAS');
 assert(archiveStat.isFile()&&archiveStat.size>0&&archiveStat.size<=64*1024**2,'BUILD_SDK_ARCHIVE_SIZE');
 assert.equal('sha512-'+createHash('sha512').update(bytes(archive)).digest('base64'),SDK.integrity,'BUILD_SDK_ARCHIVE_SRI');
 const sdkArchiveSha256=hash(bytes(archive));
 const workRoot=resolve(spec.workRoot);
 assert.match(workRoot,process.platform==='darwin'?/^\/private\/tmp\/myeve-current-proof-[a-f0-9]{32}$/:/^\/tmp\/myeve-current-proof-[a-f0-9]{32}$/,'BUILD_EXCLUSIVE_WORK_ROOT');
 assert.equal(realpathSync(dirname(workRoot)),dirname(workRoot),'BUILD_WORK_PARENT_ALIAS');
 assert(!existsSync(workRoot),'BUILD_WORK_ROOT_REUSE');
 assert.deepEqual(Object.keys(spec.toolchain).sort(),['node','npm','python','ps','lsof','platform','arch'].sort(),'BUILD_TOOLCHAIN_FIELDS');
 assert.equal(spec.toolchain.platform,process.platform,'BUILD_PLATFORM_MISMATCH');
 assert.equal(spec.toolchain.arch,process.arch,'BUILD_ARCH_MISMATCH');
 assert(['linux:x64','darwin:arm64'].includes(process.platform+':'+process.arch),'BUILD_UNREVIEWED_PLATFORM');
 for(const item of [spec.toolchain.node,spec.toolchain.npm,spec.toolchain.python,spec.toolchain.ps,spec.toolchain.lsof]){
  assert.deepEqual(Object.keys(item).sort(),['path','sha256'].sort(),'BUILD_BINARY_FIELDS');
  assert.equal(realpathSync(item.path),item.path,'BUILD_BINARY_CANONICAL_PATH');
  assert(lstatSync(item.path).isFile(),'BUILD_BINARY_REGULAR_REQUIRED');
  assert.equal(hash(bytes(item.path)),item.sha256,'BUILD_BINARY_DRIFT');
 }
 assert.equal(spec.toolchain.node.path,realpathSync(process.execPath),'BUILD_OWN_NODE_REQUIRED');
 assert(/^v24\./.test(process.version),'BUILD_NODE_24_REQUIRED');
 mkdirSync(workRoot,{mode:0o700});
 for(const name of ['source','home','cache','tmp','evidence'])mkdirSync(join(workRoot,name),{mode:0o700});
 const copy=join(workRoot,'source'),app=join(copy,'apps/eve'),evidence=join(workRoot,'evidence');
 const authored={};
 const tracked=execFileSync('git',['-C',sourceRoot,'ls-tree','-rz','--full-tree',spec.sourceCommit],{maxBuffer:8*1024**2})
  .toString().split('\0').filter(Boolean).map(line=>{
   const [identity,path]=line.split('\t'),[mode,type,blob]=identity.split(' ');pathKey(path);
   assert(['100644','100755'].includes(mode)&&type==='blob','BUILD_TRACKED_REGULAR_FILES_ONLY');
   assert(!path.split('/').includes('node_modules'),'BUILD_TRACKED_INSTALL_REJECTED');
   assert(!path.split('/').some(part=>part==='.npmrc'),'BUILD_PROJECT_NPM_CONFIG_REJECTED');
   return {mode,path,blob};
  }).filter(item=>!item.path.startsWith('output/')&&!item.path.split('/').some(part=>part.startsWith('.env')));
 const bodies=execFileSync('git',['-C',sourceRoot,'cat-file','--batch'],
  {input:tracked.map(item=>item.blob).join('\n')+'\n',maxBuffer:128*1024**2});
 let offset=0;
 for(const item of tracked){
  const end=bodies.indexOf(10,offset),[blob,type,length]=bodies.subarray(offset,end).toString().split(' ');
  assert.equal(blob,item.blob);assert.equal(type,'blob');
  const size=Number(length),body=bodies.subarray(end+1,end+1+size);offset=end+size+2;
  assert.equal(body.length,size,'BUILD_TRUNCATED_SOURCE_BLOB');
  mkdirSync(dirname(join(copy,item.path)),{recursive:true});
  writeFileSync(join(copy,item.path),body,{flag:'wx',mode:item.mode==='100755'?0o755:0o644});
  chmodSync(join(copy,item.path),item.mode==='100755'?0o755:0o644);authored[item.path]=hash(body);
 }
 assert.equal(offset,bodies.length,'BUILD_SOURCE_BATCH_TRAILING_BYTES');
 assert(Array.isArray(spec.overlays),'BUILD_EXPLICIT_SEAMS_REQUIRED');
 const allowed=new Set(['apps/eve/lib/external-alpha/model.ts','apps/eve/next.config.ts','apps/eve/app/layout.tsx',
  'apps/eve/test/owner-chat-only/fixture-geist-regular.ttf','apps/eve/test/owner-journey/transport.cjs']);
 const seen=new Set(),seams=[];
 for(const overlay of spec.overlays){
  assert.deepEqual(Object.keys(overlay).sort(),['path','beforeSha256','afterSha256','bodyBase64'].sort(),'BUILD_SEAM_FIELDS');
  const path=pathKey(overlay.path);assert(allowed.has(path)&&!seen.has(path),'BUILD_UNREVIEWED_SEAM');seen.add(path);
  assert.equal(authored[path]??null,overlay.beforeSha256,'BUILD_SEAM_PREIMAGE');
  const body=Buffer.from(overlay.bodyBase64,'base64');assert.equal(body.toString('base64'),overlay.bodyBase64,'BUILD_SEAM_ENCODING');
  assert.equal(hash(body),overlay.afterSha256,'BUILD_SEAM_POSTIMAGE');
  mkdirSync(dirname(join(copy,path)),{recursive:true});writeFileSync(join(copy,path),body,{mode:0o644});chmodSync(join(copy,path),0o644);
  authored[path]=overlay.afterSha256;seams.push({path,beforeSha256:overlay.beforeSha256,afterSha256:overlay.afterSha256});
 }
 assert.equal(hash(bytes(join(copy,'package-lock.json'))),LOCK);
 const lock=JSON.parse(bytes(join(copy,'package-lock.json')));
 assert.equal(lock.lockfileVersion,3);
 assert.equal(JSON.parse(bytes(join(app,'package.json'))).dependencies.eve,SDK.version,'BUILD_UNKNOWN_SDK_PROFILE');
 const sdkLock=lock.packages['node_modules/eve'];
 assert.equal(sdkLock.version,SDK.version);assert.equal(sdkLock.integrity,SDK.integrity);
 assert.equal(sdkLock.resolved,'https://registry.npmjs.org/eve/-/eve-0.66.3.tgz');
 for(const [key,dependency] of Object.entries(lock.packages)){
  if(!key||!key.split('/').includes('node_modules')||dependency.link)continue;
  const resolved=new URL(dependency.resolved);
  assert(resolved.protocol==='https:'&&resolved.hostname==='registry.npmjs.org'&&!resolved.username
   &&!resolved.password&&!resolved.search&&!resolved.hash,'BUILD_UNKNOWN_REGISTRY_SOURCE');
  assert.match(dependency.integrity??'',/^sha512-[A-Za-z0-9+/]{86}==$/,'BUILD_LOCKED_SRI_REQUIRED');
 }
 const emptyUser=join(workRoot,'empty-user-npmrc'),emptyGlobal=join(workRoot,'empty-global-npmrc');
 for(const path of [emptyUser,emptyGlobal])writeFileSync(path,'',{flag:'wx',mode:0o600});
 const installEnv={PATH:dirname(spec.toolchain.node.path)+':/usr/bin:/bin',HOME:join(workRoot,'home'),
  TMPDIR:join(workRoot,'tmp'),NPM_CONFIG_CACHE:join(workRoot,'cache'),
  NPM_CONFIG_USERCONFIG:emptyUser,NPM_CONFIG_GLOBALCONFIG:emptyGlobal,NPM_CONFIG_REGISTRY:'https://registry.npmjs.org/'};
 const registry={path:join(evidence,'owned-groups.ndjson'),ps:spec.toolchain.ps};writeFileSync(registry.path,'',{flag:'wx',mode:0o600});
 const commands=[];
 commands.push(await observedCommand(spec.toolchain.node.path,[spec.toolchain.npm.path,'ci','--ignore-scripts','--no-audit','--no-fund'],
  {cwd:copy,env:installEnv,registry,log:join(evidence,'install-private.log'),timeoutMs:10*60_000}));
 for(const args of [['scripts/security/apply-dependency-patches.mjs'],['scripts/security/apply-dependency-patches.mjs','--check']])
  commands.push(await observedCommand(spec.toolchain.node.path,args,{cwd:copy,env:installEnv,registry,
   log:join(evidence,args.length===1?'patch-private.log':'patch-check-private.log'),timeoutMs:60_000}));
 const sdkCheck=join(copy,'scripts/myapps-composition/verify-published-package.py');
 const pythonCode='import importlib.util,json,sys; s=importlib.util.spec_from_file_location("verified_input",sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.authenticate_package(sys.argv[2],sys.argv[3],name="eve",version="0.66.3",integrity=sys.argv[4])))';
 commands.push(await observedCommand(spec.toolchain.python.path,['-I','-B','-c',pythonCode,sdkCheck,spec.sdkArchive,join(copy,'node_modules/eve'),SDK.integrity],
  {cwd:copy,env:installEnv,registry,log:join(evidence,'sdk-published-input-private.json'),timeoutMs:60_000}));
 const rawRoots=[...new Set(Object.keys(lock.packages).filter(key=>key.split('/').includes('node_modules'))
  .map(key=>key.split('node_modules')[0]+'node_modules'))].filter(path=>existsSync(join(copy,path))).sort();
 const roots=rawRoots.filter(path=>!rawRoots.some(parent=>parent!==path&&path.startsWith(parent+'/')));
 const inputs=captureBuildInputs(copy,authored,roots);
 const initialInputRecord=writePrivateInputInventory(join(evidence,'initial-inputs-private.json'),inputs);
 for(const path of ['.output','.eve','.next','.nitro'])assert(!existsSync(join(app,path)),'BUILD_STALE_OUTPUT_REJECTED');
 const prepared={status:'FRESH_INPUTS_PREPARED_NOT_BUILT',copiedRoot:copy,sourceCommit:spec.sourceCommit,sourceTree,
  workRoot,toolchain:spec.toolchain,inputs,sdkArchiveSha256};
 preparedBuilds.set(prepared,{spec,sourceTree,copy,app,evidence,commands,installEnv,inputs,seams,sdkArchiveSha256,registry,initialInputRecord});
 return Object.freeze(prepared);
}

/** The fixture/controller may now use only this freshly installed input closure.
 * No build is allowed until its authored/installed inventory is rechecked. */
export async function buildPreparedCurrent(prepared,buildEnvironment){
 const state=preparedBuilds.get(prepared);assert(state,'BUILD_UNKNOWN_PREPARED_INPUT');
 preparedBuilds.delete(prepared); // One build attempt, never reuse a failed output.
 const {spec,sourceTree,copy,app,evidence,commands,installEnv,seams,sdkArchiveSha256,registry,initialInputRecord}=state;
 let inputs=state.inputs;
 verifyBuildInputs(copy,inputs);
 assertEveDerivedInputsAbsent(inputs);
 const environmentPolicy=validateBuildEnvironment(buildEnvironment,app);
 for(const path of ['.output','.eve','.next','.nitro'])assert(!existsSync(join(app,path)),'BUILD_STALE_OUTPUT_REJECTED');
 const buildEnv={...buildEnvironment,PATH:installEnv.PATH,HOME:installEnv.HOME,TMPDIR:installEnv.TMPDIR,NITRO_PRESET:'node-server'};
 assert(!('VERCEL' in buildEnv),'BUILD_VERCEL_HOST_PRESET_REJECTED');
 // Exact build environment/key/value policy and transport confinement MUST be
 // supplied by the independently reviewed concrete operator, never inherited.
 const eve=join(copy,'node_modules/eve/bin/eve.js');
 async function ownedBuild(binary,args,name,env){
  try{return await observedCommand(binary,args,{cwd:app,env,registry,log:join(evidence,name+'-build-private.log'),timeoutMs:10*60_000});}
  catch(first){
   try{retainFailedBuildInputSnapshot(copy,inputs,join(evidence,'failed-'+name));}
   catch(diagnostic){throw new AggregateError([first,diagnostic],'Build failed and input diagnostics could not be retained');}
   throw first;
  }
 }
 const eveCommand=await ownedBuild(spec.toolchain.node.path,[eve,'build'],'eve',buildEnv);
 commands.push(eveCommand);
 // Capture ALL installed/authored/native bytes again. Admit only the exact
 // fresh SDK-derived additions; every original entry remains unchanged.
 const afterEve=captureBuildInputs(copy,inputs.authoredFiles,inputs.installRoots);
 const afterEveInputRecord=writePrivateInputInventory(join(evidence,'post-eve-inputs-private.json'),afterEve);
 const inputDifference=summarizeInputDifference(inputs,afterEve);
 writeFileSync(join(evidence,'eve-input-difference-private.json'),JSON.stringify(inputDifference)+'\n',{flag:'wx',mode:0o600});
 const derivedInputs=validateEveDerivedInputTransition(copy,inputs,afterEve,eveCommand,spec.toolchain.node.path);
 writeFileSync(join(evidence,'eve-derived-inputs-private.json'),JSON.stringify(derivedInputs)+'\n',{flag:'wx',mode:0o600});
 inputs=afterEve;verifyBuildInputs(copy,inputs);
 const appRequire=createRequire(join(app,'package.json')),nextPackage=appRequire.resolve('next/package.json');
 const next=JSON.parse(bytes(nextPackage));assert.equal(next.version,'16.4.3','BUILD_UNKNOWN_NEXT_PROFILE');
 const nextCli=join(dirname(nextPackage),next.bin.next);
 assert(realpathSync(nextCli).startsWith(copy+sep),'BUILD_NEXT_CLI_ESCAPE');
 commands.push(await ownedBuild(spec.toolchain.node.path,[nextCli,'build','--webpack'],'next',{...buildEnv,NEXT_TELEMETRY_DISABLED:'1'}));
 const afterNext=captureBuildInputs(copy,inputs.authoredFiles,inputs.installRoots);
 const afterNextInputRecord=writePrivateInputInventory(join(evidence,'post-next-inputs-private.json'),afterNext);
 writeFileSync(join(evidence,'next-input-difference-private.json'),JSON.stringify(summarizeInputDifference(inputs,afterNext))+'\n',{flag:'wx',mode:0o600});
 verifyBuildInputs(copy,inputs);
 const output=sealRuntimeOutput(join(app,'.output/server'));
 const nextOutput=sealRuntimeOutput(join(app,'.next'));
 assert(output.entries.some(entry=>entry.path==='index.mjs'&&entry.type==='file'),'BUILD_ENTRY_REQUIRED');
 assert(output.entries.some(entry=>entry.path==='_libs/eve.mjs'&&entry.type==='file'),'BUILD_EVE_BUNDLE_REQUIRED');
 const external=verifyEmittedPackages(copy,join(app,'.output/server'));
 return {status:'CURRENT_BUILD_OBSERVED_NOT_RUNTIME_QUALIFIED',sourceCommit:spec.sourceCommit,sourceTree,
  copiedRoot:copy,sourceLockSha256:LOCK,authoredAgentSha256:AGENT,sdk:SDK,sdkArchiveSha256,
  toolchain:spec.toolchain,seams,commands,environmentPolicy,inputs,derivedInputs,
  inputRecords:{initial:initialInputRecord,afterEve:afterEveInputRecord,afterNext:afterNextInputRecord},output,nextOutput,external,
  limitations:['Source-only draft requires complete exact operator/source review before invocation',
   'Concrete environment/native/network/resource ownership policy required',
   'Required external/bundled closure and exact launched public functional/database/accounting witnesses still required']};
}

/** Compatibility entry for callers that already possess reviewed fixture bindings. */
export async function produceCurrentBuild(spec){
 assert.deepEqual(Object.keys(spec).sort(),['sourceRoot','sourceCommit','workRoot','sdkArchive',
  'toolchain','overlays','buildEnvironment'].sort(),'BUILD_SPEC_FIELDS');
 const {buildEnvironment,...inputSpec}=spec;
 // Preserve fail-before-spawn validation of all supplied environment bindings.
 validateBuildEnvironment(buildEnvironment,join(resolve(spec.workRoot),'source/apps/eve'));
 return buildPreparedCurrent(await prepareCurrentBuild(inputSpec),buildEnvironment);
}
