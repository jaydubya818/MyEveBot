import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {signPolicyMessage,verifyPolicyMessage,policyMessageHash} from '../../../packages/capability-enforcement/src/ordering-wire.ts';
import {FactoryCapabilityClient} from '../lib/engineering/factory-capability-client.ts';
import {LiveFactoryAdapter} from '../lib/engineering/factory-live-adapter.ts';
import {digest} from '../lib/engineering/factory-producer-protocol.ts';
import {FactoryStageAdmitter} from '../lib/qualification/factory-stage-admission.ts';
import {LiveFactoryPort} from '../lib/qualification/factory-live-port.ts';

/**
 * Cross-service contract: the ACTUAL MyEve ordered clients against the ACTUAL MyFactory local supervisor with the
 * local ordered-admission receiver (disposable checkout named by MYFACTORY_RECEIVER_CHECKOUT). Synthetic only: throwaway
 * keys, a temporary git repository, fixture worker, loopback. Skipped when no checkout is supplied (hosted CI).
 */
const checkout=process.env.MYFACTORY_RECEIVER_CHECKOUT;
const maybe=checkout?test:test.skip;
const token='a'.repeat(64),scope={ownerId:'owner:fixture',organizationId:'org',installationId:'install',backendId:'backend',incarnation:'epoch',enrollmentVersion:1};
const policyKey=async keyId=>{const p=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);return {keyId,jwk:await crypto.subtle.exportKey('jwk',p.privateKey)};};
const load=async path=>import(pathToFileURL(join(checkout,path)).href);

async function supervisorFixture(t,{enroll}={}){
  const {createLocalV4Supervisor}=await load('apps/supervisor/src/server.ts'),{FileReceiverWitness}=await load('apps/supervisor/src/local-ordered-admission.ts');
  const dir=mkdtempSync(join(realpathSync(tmpdir()),'myeve-real-receiver-')),repo=join(dir,'repo'),dataDir=join(dir,'data');mkdirSync(repo);mkdirSync(dataDir);
  const git=(...a)=>execFileSync('git',['-C',repo,...a],{encoding:'utf8'}).trim();git('init','-q');git('config','user.name','F');git('config','user.email','f@example.invalid');
  writeFileSync(join(repo,'quantity.mjs'),'console.log(0);\n');git('add','.');git('commit','-qm','base');
  const pair=generateKeyPairSync('ed25519'),key={factoryId:'factory-fixture',keyId:'fixture',publicKey:pair.publicKey.export({type:'spki',format:'pem'}).toString(),activeFrom:'2020-01-01T00:00:00Z',notAfter:'2099-01-01T00:00:00Z'};
  writeFileSync(join(dataDir,'connections.json'),JSON.stringify({clients:[{id:'myeve',name:'MyEve',tokenSha256:createHash('sha256').update(token).digest('hex'),repositoryPaths:[repo],ownerScope:scope.ownerId,actions:['factory.prepare','factory.dispatch','factory.observe','factory.stop']}]}));
  const jobDependencies={preflightCodex:async()=>({binaryAvailable:true,authenticated:true,version:'s',workerProfile:'mac',error:null}),runCodex:async()=>({success:false,status:'failed',eventsPath:'x',usage:null}),verifyCandidate:async()=>({checks:[],reason:null})};
  const keys={myeve:await policyKey('myeve'),relay:await policyKey('relay'),signer:await policyKey('receiver')};
  const orderedAdmission=enroll?{enrollment:{scope,agentId:'agent',registryVersion:'r1',clientId:'myeve',sourceKeys:{myeve:keys.myeve,relay:keys.relay},signer:keys.signer,factory:enroll},
    witness:new FileReceiverWitness(join(dir,'witness','head.json'),'e1'),witnessPath:join(dir,'witness','head.json')}:undefined;
  const supervisor=createLocalV4Supervisor({dataDir,resultSigning:{factoryId:key.factoryId,currentKeyId:key.keyId,privateKey:pair.privateKey.export({type:'pkcs8',format:'pem'}).toString(),keys:[key]},jobDependencies,localFactoryFixture:true,orderedAdmission});
  await new Promise((resolve,reject)=>{supervisor.server.once('error',reject);supervisor.server.listen(0,'127.0.0.1',resolve)});
  t.after(async()=>{try{await supervisor.close();}catch{}rmSync(dir,{recursive:true,force:true});});
  return {dir,repo,base:git('rev-parse','HEAD'),supervisor,origin:'http://127.0.0.1:'+supervisor.server.address().port,keys,key};
}
const requestFor=(repo,base)=>({requestId:randomUUID(),workId:randomUUID(),workGeneration:1,repository:'fixture/golden',deadline:new Date(Date.now()+600000).toISOString(),maxSpendUsd:1,
  input:{title:'Bounded fixture',description:'Change only quantity',kind:'feature',repositoryPath:repo,baseRef:base,acceptanceCriteria:['Print two'],reproductionCommand:null,expectedFailureText:null,checkCommands:['node quantity.mjs'],allowedPaths:['quantity.mjs'],workerProfile:'mac'}});

maybe('actual MyEve ordered clients against the actual MyFactory local ordered-admission receiver',async t=>{
  // 1. discover the deployment's Factory identity (per request profile) from an unenrolled supervisor
  const d=await supervisorFixture(t),discovery=requestFor(d.repo,d.base);
  const res=await fetch(d.origin+'/api/connect/v1/dispatches',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(discovery)});
  assert.equal(res.status,200);const s0=(await res.json()).snapshot;
  const factory={factoryId:s0.factoryId,factoryVersion:s0.factoryVersion,sourceDigest:s0.sourceDigest,configurationDigest:s0.configurationDigest};
  assert.equal(digest({sourceDigest:factory.sourceDigest,configurationDigest:factory.configurationDigest}),factory.factoryVersion);   // MyEve and MyFactory agree on the version digest
  // 2. enrolled supervisor, signed fences from both authorities
  const h=await supervisorFixture(t,{enroll:factory}),request=requestFor(h.repo,h.base);
  const fence=async(authority,version)=>(await fetch(h.origin+'/api/capability-admission/fence',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify({schema:'factory-capability-fence/v1',envelope:await signPolicyMessage({kind:'FENCE',authority,...scope,version,policyId:`${authority}-policy-${version}`,capabilityId:'work',operation:'enable'},h.keys[authority])})})).status;
  assert.equal(await fence('myeve',1),200);assert.equal(await fence('relay',1),200);
  // 3. the actual clients
  const config={origin:h.origin,token,factoryId:factory.factoryId,sourceDigest:factory.sourceDigest,configurationDigest:factory.configurationDigest,factoryVersion:factory.factoryVersion,repositoryPath:h.repo,
    keys:[h.key],qualification:{scopeId:scope.ownerId,profileHash:'e'.repeat(64),evidenceRef:'synthetic',qualifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z',mode:'LOCAL_FIXTURE',spendEnforced:true}};
  const binding={...scope,agentId:'agent',clientId:'myeve',missionId:'mission',...factory};
  const proofs=[];
  const capability=new FactoryCapabilityClient({origin:h.origin,binding,key:h.keys.signer,headers:async()=>({authorization:'Bearer '+token}),
    sourcePermit:async(envelope,req,proof)=>{proofs.push(proof);const {kind,...rest}=await verifyPolicyMessage(envelope,h.keys.signer);
      return signPolicyMessage({...rest,kind:'PERMIT',requiredCapabilities:['myfactory','work'],agentRevision:1,sourcePermitHash:'SELF'},h.keys.myeve);},
    relayPermit:async source=>{const m=await verifyPolicyMessage(source,h.keys.myeve),{kind,...rest}=m;
      return signPolicyMessage({...rest,authority:'relay',version:1,policyId:'relay-policy-1',kind:'PERMIT',sourcePermitHash:await policyMessageHash(m)},h.keys.relay);}});
  const adapter=new LiveFactoryAdapter(config,fetch,capability,{requireOrderedAdmission:true});
  const start={commit:h.base,tree:execFileSync('git',['-C',h.repo,'rev-parse',h.base+'^{tree}'],{encoding:'utf8'}).trim()};
  const work={id:request.workId,version:1,generation:1,criteriaVersion:1,agentId:'agent'};
  const admitter=new FactoryStageAdmitter({enabled:true,work:()=>work,request:()=>request,start:()=>start,missionControl:async()=>({proof:true}),prepare:(r,p)=>adapter.prepare(r,p),
    identity:(st,w,rb,rq)=>({runId:randomUUID(),writerGeneration:1,dispatchIdentity:randomUUID(),workId:w.id,workGeneration:1,factoryId:rb.snapshot.factoryId,factoryVersion:rb.snapshot.factoryVersion,requestId:rb.requestId,
      workOrderId:rb.workOrderId,remoteRunId:rb.runId,repository:rq.repository,baseSha:start.commit,allowedPaths:rq.input.allowedPaths,deadline:rq.deadline})});
  const retained=await admitter.retained(1);
  assert.deepEqual(proofs,[{proof:true}]);
  assert.equal(h.supervisor.storage.listWorkOrders().length,1);
  const port=new LiveFactoryPort({enabled:true,retained:()=>retained,live:{prepared:r=>adapter.prepared(r),dispatch:i=>adapter.dispatch(i),read:i=>adapter.read(i),result:b=>adapter.result(b)}});
  await port.preflight(1,start);                                                                    // capability readback through the actual receiver
  await assert.rejects(port.preflight(1,{commit:'3'.repeat(40),tree:start.tree}),/QDEV_FACTORY_START_MISMATCH/);
  assert.equal(h.supervisor.storage.listWorkOrders().length,1);
  // ordinary (unordered) preparation is refused by the same Factory
  const direct=await fetch(h.origin+'/api/connect/v1/dispatches',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(requestFor(h.repo,h.base))});
  assert.equal(direct.status,403);
});
