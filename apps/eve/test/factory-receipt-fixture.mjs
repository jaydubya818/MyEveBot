import {readFileSync} from 'node:fs';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {Pool} from 'pg';
import {FactoryReceiptStore} from '../lib/engineering/factory-receipt-store.ts';
import {prepareAuthenticatedFactoryInput} from '../lib/engineering/factory-authenticated-result.ts';
import {signResult} from '../lib/engineering/factory-producer-protocol.ts';
export const golden=JSON.parse(readFileSync(new URL('../../../docs/verification/2026-09-27-q37-integration/myfactory/gate-c/durable/producer-golden.json',import.meta.url)));
export const manifest=JSON.parse(Buffer.from(golden.result.encoded,'base64url').toString());
export const adminURL='postgresql://q37_admin@127.0.0.1:55479/postgres';
export function poolFor(url) {
 const u=new URL(url);
 if(u.hostname!=='127.0.0.1'||u.port!=='55479'||!/^\/q37_gatec_[a-f0-9]+$/.test(u.pathname))throw Error('Disposable Q37 database only');
 return new Pool({connectionString:url});
}
export function storeFor(pool,principal) {return new FactoryReceiptStore(principal,{query:async(s,p)=>(await pool.query(s,p)).rows});}
export async function fixture(pool) {
 const owner='q37-'+randomUUID(), agent='agent-'+randomUUID(),workId=randomUUID();
 const principal={scopeId:owner,scopeKind:'personal',actorId:owner};
 await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps)
 VALUES($1,$2,'Sofie','sofie','engineer','Local Gate C receipt fixture',true,'active',1,3600,30)`,[agent,owner]);
 await pool.query(`INSERT INTO engineering_work(id,scope_id,scope_kind,created_by,title,objective,repository,control,max_cost_usd,max_duration_seconds,idempotency_key,request_hash)
 VALUES($1,$2,'personal',$2,'Gate C','Admit provenance only','fixture/repository','agent',1,3600,$3,'fixture')`,[workId,owner,randomUUID()]);
 // Trusted expected values pinned independently of each delivered envelope.
 const binding=prepareAuthenticatedFactoryInput({workId,agentId:agent,workVersion:1,workGeneration:1,criteriaVersion:1,
  factoryId:golden.expected.factoryId,factoryVersion:golden.expected.factoryVersion,requestId:golden.expected.requestId,
  workOrderId:golden.expected.workOrderId,runId:golden.expected.runId,attemptNumber:1,
  inputCommit:'ec416827d4369a29f7e9c7217e418b0d8e322e94',
  requestDigest:'8f3f2c729a35137852cba03f3fe51fd3912e7c321d10ebedd9bff5f555928d5d',
  sourceDigest:'4576765e211cc628fdb690bbf3b8d0cacaaac334545d7c745bf8eb724b84f5d2',
  configurationDigest:'82ebecc0cf0ea3b4775aae497035b8a49129de190338e492ddf64e07a14a2b63'});
 const store=storeFor(pool,principal),request=await store.register(binding);
 return {principal,binding,store,request};
}
export function resign(change=()=>{}) {
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const key={...golden.expected.keys[0],publicKey:publicKey.export({type:'spki',format:'pem'}).toString()};
 const m=structuredClone(manifest),artifacts=structuredClone(golden.result.artifacts);
 change(m,artifacts);
 return {m,artifacts,key,privateKey,result:signResult(m,artifacts,privateKey)};
}
