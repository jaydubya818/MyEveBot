import assert from 'node:assert/strict';
import {FactoryReceiptStore} from '../lib/engineering/factory-receipt-store.ts';
import {prepareAuthenticatedFactoryInput} from '../lib/engineering/factory-authenticated-result.ts';
import {admitFactoryResult} from '../lib/engineering/factory-result-consumer.ts';
import {golden,manifest} from './factory-receipt-fixture.mjs';

async function snapshot(pool,factory) {
  const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const rows={};
  for(const {tablename:name} of tables) {
    if(name.startsWith('engineering_factory_')!==factory)continue;
    rows[name]=(await pool.query('SELECT to_jsonb(t) row FROM "'+name.replaceAll('"','""')+'" t ORDER BY to_jsonb(t)::text')).rows;
  }
  return rows;
}

// Called during the existing native golden journey, after its real admission.
// The fixed expected producer binding comes from the independently pinned fixture.
export async function assertReceiptDoesNotGrantAuthority(pool,workStore,work,agentId) {
  const binding=prepareAuthenticatedFactoryInput({factoryId:golden.expected.factoryId,factoryVersion:golden.expected.factoryVersion,requestId:golden.expected.requestId,workOrderId:golden.expected.workOrderId,runId:golden.expected.runId,
    workId:work.id,workVersion:work.version,workGeneration:work.generation,criteriaVersion:work.criteriaVersion,agentId,
    attemptNumber:1,inputCommit:'ec416827d4369a29f7e9c7217e418b0d8e322e94',
    requestDigest:'8f3f2c729a35137852cba03f3fe51fd3912e7c321d10ebedd9bff5f555928d5d',
    sourceDigest:'4576765e211cc628fdb690bbf3b8d0cacaaac334545d7c745bf8eb724b84f5d2',
    configurationDigest:'82ebecc0cf0ea3b4775aae497035b8a49129de190338e492ddf64e07a14a2b63'});
  const store=new FactoryReceiptStore(workStore.principal,workStore.database);
  const before=await snapshot(pool,false);
  const request=await store.register(binding);
  const receipt=await admitFactoryResult(store,request.id,golden.result,{keys:async()=>golden.expected.keys});
  assert.equal(receipt.status,'ADMITTED');assert.equal(receipt.factoryGrantedAuthority,0);
  assert.equal(receipt.readiness,'NOT_READY');assert.equal(receipt.independentVerification,'NOT_RUN');
  assert.deepEqual(await snapshot(pool,false),before,'Factory receipt modified native authority, budget, approval, publication or verification state');
  const history=await snapshot(pool,true);
  console.log('PASS: same-Work Factory receive/admit leaves every non-Factory table byte-equivalent; writer, Run, budget, approval, publication and protected verification unchanged');
  return async()=>{
    assert.deepEqual(await snapshot(pool,true),history,'Native lifecycle rewrote Factory provenance or signed history');
    const proofs=(await pool.query('SELECT proof FROM engineering_native_results WHERE work_id=$1',[work.id])).rows;
    assert(proofs.length>=2);
    assert(proofs.every(({proof})=>proof.resultRevision!==manifest.candidate.commit && proof.evidence.every(e=>e.producer==='trusted-verifier')));
    console.log('PASS: native failure/repair/protected verification preserves all Factory tables and never treats Factory PASS as independent evidence; crossBoundaryAuthorityViolations=0 falseReady=0');
  };
}
