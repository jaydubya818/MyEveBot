/** Explicit current-QE profile. SOURCE ONLY until exact source/operator review.
 * Never selected as a fallback from the historical tokenizer verifier. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareCurrentBuild,buildPreparedCurrent} from './current-build-producer.mjs';
import {verifyBuildInputs} from './build-input-inventory.mjs';
import {verifyRuntimeOutput} from './runtime-output-seal.mjs';
import {createBenignModelProbe} from './benign-model-probe.mjs';
import {createOwnedRuntimeProcesses} from './owned-runtime-processes.mjs';
import {validateCurrentRuntimeAccounting,assertFinalModelObservation} from './current-runtime-accounting.mjs';
import {currentQESeams} from './current-qe-seams.mjs';
import {validateCurrentLoadedClosure} from './current-runtime-closure.mjs';
import {observeOwnedListener,validateProxyRouteWitnesses} from './owned-listener-observation.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const PROFILE='eve-0.66.3-current-qe-public-chat-v1';
const json=(path,value)=>writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
function approvedFiles(build){
 const files=new Map();
 for(const [root,entries] of [[build.copiedRoot,build.inputs.entries],[build.output.root.path,build.output.entries],[build.nextOutput.root.path,build.nextOutput.entries]])
  for(const entry of entries)if(entry.type==='file'){
   const path=join(root,entry.path),record={path,sha256:entry.sha256,mode:entry.mode};
   assert.equal(realpathSync(path),path,'RUNTIME_APPROVAL_ALIAS');
   if(files.has(path))assert.deepEqual(files.get(path),record);else files.set(path,record);
  }
 return [...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
}
function moduleObservations(path,approved){
 const bytes=readFileSync(path);assert(bytes.length>0&&bytes.length<=16*1024**2,'RUNTIME_MODULE_WITNESS_REQUIRED');
 const rows=bytes.toString().trimEnd().split('\n').map(line=>JSON.parse(line));
 const map=new Map(approved.map(row=>[row.path,row]));
 const loads=rows.filter(row=>row.kind==='load');assert(loads.length>0,'RUNTIME_NO_LOADED_FILES');
 for(const row of loads){
  const selected=map.get(fileURLToPath(row.url));assert(selected,'RUNTIME_FOREIGN_LOADED_FILE');
  assert.equal(row.sha256,selected.sha256);assert.equal(row.mode,selected.mode);
  assert(['RETURNED_SOURCE_BYTES_VERIFIED','FILE_AND_RESOLUTION_ONLY'].includes(row.observation));
 }
 return {sha256:hash(bytes),loads,httpRequests:rows.filter(row=>row.kind==='http-request'),listeners:rows.filter(row=>row.kind==='listener'),resolutions:rows.filter(row=>row.kind==='resolution')};
}

export async function runCurrentQEProof(spec){
 assert.deepEqual(Object.keys(spec).sort(),['profile','sourceRoot','sourceCommit','workRoot','sdkArchive','toolchain','font','native','ports'].sort(),'CURRENT_OPERATOR_SPEC_FIELDS');
 assert.equal(spec.profile,PROFILE,'CURRENT_PROFILE_MUST_BE_EXPLICIT');
 assert.deepEqual(spec.ports,{model:3184,web:3188,eve:3185},'CURRENT_REVIEWED_TOPOLOGY');
 assert.deepEqual(Object.keys(spec.native).sort(),['adminUrl','systemIdentifier','dataDirectory','port','operatorPreflightSha256'].sort());
 assert.match(spec.native.operatorPreflightSha256,/^[a-f0-9]{64}$/,'CURRENT_NATIVE_PREFLIGHT_REQUIRED');
 assert.equal(spec.toolchain.node.path,realpathSync(process.execPath));
 assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
 const font=readFileSync(spec.font.path);assert.equal(hash(font),spec.font.sha256);
 const overlays=currentQESeams(spec.sourceRoot,font);
 const prepared=await prepareCurrentBuild({sourceRoot:spec.sourceRoot,sourceCommit:spec.sourceCommit,workRoot:spec.workRoot,
  sdkArchive:spec.sdkArchive,toolchain:spec.toolchain,overlays});
 const copy=prepared.copiedRoot,app=join(copy,'apps/eve'),privateRoot=join(spec.workRoot,'private');mkdirSync(privateRoot,{mode:0o700});
 const require=createRequire(join(app,'package.json'));
 // Documented tsImport from the newly installed selected dependency graph.
 // The control fixture's TypeScript transforms are separate from app load proof.
 const tsxPath=realpathSync(require.resolve('tsx/esm/api'));assert(tsxPath.startsWith(copy+sep),'CURRENT_TSX_INPUT_ESCAPE');
 const {tsImport}=await import(pathToFileURL(tsxPath).href);
 const controlImports=[];
 const fixtureModule=await tsImport(join(app,'test/owner-journey/current-runtime-fixture.ts'),{
  parentURL:pathToFileURL(join(copy,'scripts/myapps-composition/current-qe-runtime.mjs')).href,tsconfig:false,
  onImport(url){if(url.startsWith('file:')){const path=realpathSync(fileURLToPath(url));assert(path.startsWith(copy+sep),'CURRENT_CONTROL_IMPORT_ESCAPE');controlImports.push(relative(copy,path));}},
 });
 verifyBuildInputs(copy,prepared.inputs);
 let fixture,modelServer,build,processOwner,firstFailure,proof,processes,cleanup,modelFailure;
 const marker='CURRENT_RUNTIME_'+randomBytes(16).toString('hex'),model=createBenignModelProbe(marker);
 let httpRequests=0,failedRequests=0,unexpectedPaths=0,modelActive=0;
 try{
  const {operatorPreflightSha256,...native}=spec.native;fixture=await fixtureModule.createCurrentRuntimeFixture(native);
  await fixture.assertOnlyOwnedDatabases();
  const transportFile=join(privateRoot,'transport.json');
  json(transportFile,{appUrl:fixture.app.url,centralUrl:fixture.central.url,pgPort:spec.native.port,
   webPort:spec.ports.web,evePort:spec.ports.eve,modelPort:spec.ports.model,ipcDirectory:join(spec.workRoot,'tmp')});
  modelServer=createServer(async(req,res)=>{
   modelActive++;res.on('error',error=>{modelFailure??=error;});
   try{
    if(req.url!=='/model'||req.method!=='POST'){unexpectedPaths++;throw Error('CURRENT_MODEL_ENDPOINT');}
    httpRequests++;assert(httpRequests<=2,'CURRENT_MODEL_HTTP_LIMIT');
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;assert(size<=2*1024**2,'CURRENT_MODEL_BODY_LIMIT');chunks.push(chunk);}
    const body=JSON.parse(Buffer.concat(chunks));
    fixtureModule.validateCurrentModelEnvelope(body);
    assert(Array.isArray(body.prompt),'CURRENT_MODEL_PROMPT_REQUIRED');
    assert(!body.tools?.some(tool=>['engineering_work','engineering_factory'].includes(tool.name)),'CURRENT_DISABLED_WORK_TOOL_EXPOSED');
    const reply=model.replyFor(body.prompt);assert(reply!==null,'CURRENT_NONBENIGN_MODEL_REQUEST');
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify({content:[{type:'text',text:reply}],usage:{inputTokens:{total:0,noCache:0,cacheRead:0,cacheWrite:0},outputTokens:{total:0,text:0,reasoning:0}},warnings:[],
     finishReason:{unified:'stop',raw:'stop'},providerMetadata:{gateway:{cost:0}}}));
   }catch(error){
    failedRequests++;modelFailure??=error;
    try{if(!res.headersSent&&!res.destroyed){res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"Current runtime model request rejected"}');}
     else if(!res.destroyed)res.destroy();}catch(responseError){modelFailure??=responseError;if(!res.destroyed)res.destroy();}
   }finally{modelActive--;}
  });
  modelServer.on('error',error=>{modelFailure??=error;});
  await new Promise((resolve,reject)=>{modelServer.once('error',reject);modelServer.listen(spec.ports.model,'127.0.0.1',resolve);});
  const environment=fixture.environment(app,transportFile);
  build=await buildPreparedCurrent(prepared,environment);
  json(join(privateRoot,'build-observation.json'),build);
  const approved=approvedFiles(build),scriptRoot=join(copy,'scripts/myapps-composition');
  const node=spec.toolchain.node.path,bootstrap=join(scriptRoot,'current-runtime-bootstrap.mjs'),transport=join(app,'test/owner-journey/transport.cjs');
  const nextPackage=require.resolve('next/package.json'),nextMeta=JSON.parse(readFileSync(nextPackage)),next=join(dirname(nextPackage),nextMeta.bin.next);
  const runtimeEnvironment={...environment,PATH:dirname(node)+':/usr/bin:/bin',HOME:join(spec.workRoot,'home'),TMPDIR:join(spec.workRoot,'tmp'),
   WORKFLOW_LOCAL_DATA_DIR:join(privateRoot,'workflow'),WORKFLOW_LOCAL_BASE_URL:'http://127.0.0.1:'+spec.ports.eve,WORKFLOW_TARGET_WORLD:'local'};
  delete runtimeEnvironment.NODE_OPTIONS;mkdirSync(runtimeEnvironment.WORKFLOW_LOCAL_DATA_DIR,{mode:0o700});
  processOwner=createOwnedRuntimeProcesses({path:join(spec.workRoot,'evidence/owned-groups.ndjson'),ps:spec.toolchain.ps});
  const specs=[];
  function launch(kind,entry,args,extra={}){
   const moduleLog=join(privateRoot,kind+'-module-loads.ndjson');writeFileSync(moduleLog,'',{flag:'wx',mode:0o600});
   const processSpec={kind,entry,args,transport,approvedFiles:approved,moduleLog,outputRoot:build.output.root.path,clientWorkspace:copy,httpProbeMarker:marker,...extra};
   const file=join(privateRoot,kind+'-launch.json');json(file,processSpec);specs.push({kind,file,moduleLog,sha256:hash(readFileSync(file))});
   return processOwner.launch({node,args:['--max-old-space-size=5120',bootstrap,file],cwd:app,
    env:{...runtimeEnvironment,...(kind==='eve'?{HOST:'127.0.0.1',PORT:String(spec.ports.eve),NITRO_HOST:'127.0.0.1',NITRO_PORT:String(spec.ports.eve)}:{})},
    log:join(privateRoot,kind+'-console.log'),kind,expectedToExit:kind==='client'});
  }
  const eveEntry=join(app,'.output/server/index.mjs'),eveProcess=launch('eve',eveEntry,[]);
  const health=await processOwner.guard(processOwner.readiness('http://127.0.0.1:'+spec.ports.eve+'/eve/v1/health',value=>value.ok===true&&value.status==='ready'&&value.workflowId==='workflow//eve//workflowEntry'));
  const listenersBefore=[observeOwnedListener(eveProcess,spec.ports.eve,spec.toolchain)];
  const nextProcess=launch('next',next,['start','--hostname','127.0.0.1','--port',String(spec.ports.web)]);
  await processOwner.guard(processOwner.readiness('http://127.0.0.1:'+spec.ports.web+'/api/auth/status',value=>value.authenticated===false));
  listenersBefore.push(observeOwnedListener(nextProcess,spec.ports.web,spec.toolchain));
  verifyBuildInputs(copy,build.inputs);verifyRuntimeOutput(build.output.root.path,build.output);verifyRuntimeOutput(build.nextOutput.root.path,build.nextOutput);
  const result=join(privateRoot,'public-observation.json');
  const client=launch('client',join(scriptRoot,'current-public-runtime.mjs'),[],{result,config:{webOrigin:'http://127.0.0.1:'+spec.ports.web,
   eveOrigin:'http://127.0.0.1:'+spec.ports.eve,clientWorkspace:copy,ownerId:fixture.app.owner,password:fixture.app.password,marker}});
  await processOwner.guard(processOwner.completed(client),90000);
  if(modelFailure)throw modelFailure;
  const publicProof=JSON.parse(readFileSync(result)),database=await fixture.observe();
  assert.equal(httpRequests,2);assert.equal(failedRequests,0);assert.equal(unexpectedPaths,0);
  const modelProof={...model.snapshot(),httpRequests,failedRequests,unexpectedPaths};
  const joinProof=validateCurrentRuntimeAccounting(publicProof,database,modelProof);
  const listenersAfter=[observeOwnedListener(eveProcess,spec.ports.eve,spec.toolchain),observeOwnedListener(nextProcess,spec.ports.web,spec.toolchain)];
  for(let i=0;i<2;i++)for(const key of ['pid','pgid','start'])assert.equal(listenersBefore[i].identity[key],listenersAfter[i].identity[key],'RUNTIME_LISTENER_CHANGED_DURING_PROBE');
  await fixture.assertOnlyOwnedDatabases();
  try{processes=await processOwner.close();}finally{processOwner=undefined;}
  const witnesses=specs.map(item=>{
   assert.equal(hash(readFileSync(item.file)),item.sha256,'RUNTIME_LAUNCH_SPEC_CHANGED');
   return {kind:item.kind,launchSpecSha256:item.sha256,...moduleObservations(item.moduleLog,approved)};
  });
  const required={eve:[eveEntry,join(app,'.output/server/_libs/eve.mjs')],next:[next],client:[realpathSync(require.resolve('eve/client'))]};
  for(const [kind,paths] of Object.entries(required))for(const path of paths)
   assert(witnesses.find(witness=>witness.kind===kind).loads.some(row=>fileURLToPath(row.url)===path),'RUNTIME_REQUIRED_MODULE_NOT_OBSERVED:'+kind+':'+relative(copy,path));
  verifyBuildInputs(copy,build.inputs);verifyRuntimeOutput(build.output.root.path,build.output);verifyRuntimeOutput(build.nextOutput.root.path,build.nextOutput);
  const proxyRoute=validateProxyRouteWitnesses(witnesses,{evePid:eveProcess.pid,webPid:nextProcess.pid,evePort:spec.ports.eve,webPort:spec.ports.web,marker});
  const closure=validateCurrentLoadedClosure(build,witnesses.find(witness=>witness.kind==='eve'));
  proof={format:'myapps.current-qe-functional-proof.v1',profile:PROFILE,status:'CURRENT_PUBLIC_FUNCTIONAL_CHAIN_OBSERVED_OPERATOR_CLEANUP_REQUIRED',
   sourceCommit:build.sourceCommit,sourceTree:build.sourceTree,platform:process.platform,arch:process.arch,
   nativePreflightSha256:spec.native.operatorPreflightSha256,build,health,publicProof,database,modelProof,joinProof,closure,proxyRoute,listenersBefore,listenersAfter,processes,witnesses,controlImports,
   historicalTokenizerParity:'NOT_CLAIMED',positiveWorkQualification:'ORIGINAL_FAIL_HOLD_UNCHANGED',
   scope:'Current QE production-build seams, deterministic local model, two benign messages, owned synthetic PG; no provider/paid Work/tester/deployment action'};
 }catch(error){firstFailure=error;}
 const failures=[];
 if(processOwner)try{processes=await processOwner.close();}catch(error){failures.push(error);}
 if(modelServer)try{await new Promise((resolve,reject)=>{modelServer.close(error=>error?reject(error):resolve());modelServer.closeAllConnections();});}catch(error){failures.push(error);}
 // Close and await all model handlers BEFORE taking final counters/SQL evidence.
 // A late request/error during process shutdown must invalidate the earlier join.
 if(modelServer)try{
  for(let attempt=0;attempt<100&&modelActive;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(modelActive,0,'CURRENT_MODEL_HANDLER_CLEANUP_UNKNOWN');
  if(modelFailure)throw modelFailure;
  if(proof&&!firstFailure){
   const finalModel={...model.snapshot(),httpRequests,failedRequests,unexpectedPaths};
   assertFinalModelObservation(proof.modelProof,finalModel,modelFailure);
   const finalDatabase=await fixture.observe();
   proof.joinProof=validateCurrentRuntimeAccounting(proof.publicProof,finalDatabase,finalModel);
   proof.database=finalDatabase;proof.modelProof=finalModel;proof.modelLifecycleFinalized=true;
  }
 }catch(error){failures.push(error);}
 if(fixture)try{await fixture.assertOnlyOwnedDatabases();cleanup=await fixture.close();}catch(error){failures.push(error);}
 if(build)try{verifyBuildInputs(copy,build.inputs);verifyRuntimeOutput(build.output.root.path,build.output);verifyRuntimeOutput(build.nextOutput.root.path,build.nextOutput);}catch(error){failures.push(error);}
 if(proof&&!firstFailure)try{assertFinalModelObservation(proof.modelProof,{...model.snapshot(),httpRequests,failedRequests,unexpectedPaths},modelFailure);}catch(error){failures.push(error);}
 if(firstFailure||failures.length){
  // Private first error retained. Public result exposes no database credential.
  json(join(privateRoot,'failure.json'),{status:'FAIL_FIRST_ATTEMPT_PRESERVED',firstFailure:firstFailure?{name:firstFailure.name,message:firstFailure.message,stack:firstFailure.stack}:null,
   cleanupFailures:failures.map(error=>({name:error.name,message:error.message,stack:error.stack}))});
  throw new AggregateError([...(firstFailure?[firstFailure]:[]),...failures],'Current QE proof failed; inspect private first failure; do not retry');
 }
 assert(proof&&cleanup,'CURRENT_PROOF_OR_CLEANUP_MISSING');
 proof.databaseCleanup=cleanup;json(join(spec.workRoot,'evidence/current-qe-functional-proof.json'),proof);
 return {status:proof.status,profile:PROFILE,sourceCommit:proof.sourceCommit,sourceTree:proof.sourceTree,
  proofFile:join(spec.workRoot,'evidence/current-qe-functional-proof.json'),proofSha256:hash(readFileSync(join(spec.workRoot,'evidence/current-qe-functional-proof.json')))};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--spec');
 const result=await runCurrentQEProof(JSON.parse(readFileSync(process.argv[3],'utf8')));
 process.stdout.write(JSON.stringify(result)+'\n');
}
