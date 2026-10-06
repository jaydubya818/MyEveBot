import {successorIntakePolicy,assertSuccessorPredecessor} from './production-successor-intake.ts';
import {assertProductionApproval} from '../lib/engineering/production-approval.ts';
import {digest} from '../lib/engineering/contract.ts';
import {FactoryValidationLifecycle, type ValidationClaim} from '../lib/engineering/factory-validation-lifecycle.ts';
import {WorkStore} from '../lib/engineering/store.ts';

/** Operator-only. Not imported by a request handler, build or worker. Both clients
 * must be dedicated, unpooled sessions; the caller owns connection/read-only cleanup. */
export interface OperatorClient {
  query(sql:string, params?:unknown[]):Promise<{rows:Record<string,any>[]}>
}
export interface GrantApproval {
  workVersion:number;
  configurationHash:string;
  environmentBinding:Record<string,unknown>;
  criteria:unknown[];
  canonicalSpendPlan:Record<string,unknown>;
  manifestTemplate:Record<string,any>;
  ownerBinding?:Record<string,unknown>;
  successorIntake?:Record<string,unknown>;
  installation:{projectId:string;databaseResourceId:string;custodyStoreId:string;ownerScope?:string};
  historicalGrants:{requestId:string;workId:string;manifestSha256:string;consumedAt?:string|null}[];
}
export type GrantAudit = (event:Record<string,unknown>)=>Promise<void>;
class BoundaryFailure extends Error {}
function fail(predicate:string):never {throw new BoundaryFailure(predicate);}
const same=(a:unknown,b:unknown)=>digest(a)===digest(b);
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const iso=(value:any)=>value==null?null:new Date(value).toISOString();

/** Never logs preparation bodies, credentials, manifests, bearer values or raw
 * exception text. xmin + transaction id distinguish an intervening transaction. */
function snapshot(row:Record<string,any>|undefined){
  if(!row)return null;
  return {decisionId:row.decision_id,workId:row.work_id,workVersion:row.work_version,
    workGeneration:row.work_generation,requestId:row.request_id,state:row.state,
    epoch:String(row.claim_epoch),fencingTokenDigest:row.claim_token?digest(row.claim_token):null,
    rowVersion:row.row_version,updatedAt:iso(row.updated_at),deadline:iso(row.deadline),
    leaseUntil:iso(row.lease_until),transactionId:row.transaction_id,backendPid:row.backend_pid,
    observedAt:iso(row.observed_at),preparationDigest:row.factory_preparation?digest(row.factory_preparation):null};
}

export async function materializeValidationGrant(
  owner:OperatorClient, factory:OperatorClient, approved:GrantApproval, audit:GrantAudit,
  bounds:{maxAttempts?:number;maxWaitMs?:number;waitMs?:number}={},
  productionApproval?:{envelope:unknown;sha256:string},
){
  const a=structuredClone(approved),t=a.manifestTemplate,r=t.request;
  if(productionApproval){
   const exact=assertProductionApproval(productionApproval.envelope,productionApproval.sha256);
   if(!same(exact,a))fail('APPROVAL_MISMATCH');
  }
  if(!productionApproval&&(t.version!==1||t.clientId!=='sofie-production-validation'||t.environment!=='CLOUD_PRODUCTION'||t.publication!==false||
    t.contractSha256!=='cbbcdfb560bf24c41ed1be83a5a06e5ba42610cbce9b8caccd272392337e27d3'||
    t.configurationDigest!=='d7486299b1470e1c70b35a838f1e11b458ca70d37426d3a15adca2e96f7357b3'||
    t.candidateSha256!=='30d9b2af5a611565dffebcc3d35510c3975067284ac2ff52db81fc4201ab99a6'||
    r.requestId!==null||r.deadline!==null||r.protocol!=='MYFACTORY_EXECUTION_V2'||
    !Number.isInteger(a.workVersion)||a.workVersion<1||!Number.isInteger(r.workGeneration)||r.workGeneration<1||
    t.factoryVersion!==digest({sourceDigest:t.sourceDigest,configurationDigest:t.configurationDigest})))fail('APPROVAL_INVALID');
  if(a.ownerBinding&&(!productionApproval||typeof a.installation.ownerScope!=='string'||!a.installation.ownerScope||a.installation.ownerScope===t.ownerScope))fail('ALPHA_HOST_INSTALLATION_BOUNDARY');
  const successor=successorIntakePolicy(a);
  if(successor&&!productionApproval)fail('SUCCESSOR_APPROVAL_REQUIRED');
  const maxAttempts=bounds.maxAttempts??60,maxWaitMs=bounds.maxWaitMs??30000,waitMs=bounds.waitMs??250;
  if(!Number.isFinite(maxWaitMs)||!Number.isFinite(waitMs)||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>120||maxWaitMs<0||maxWaitMs>30000||waitMs<1||waitMs>500)fail('WAIT_BOUND_INVALID');
  const started=performance.now(),key='myeve:factory-worker:'+t.ownerScope;
  const store=new WorkStore({scopeId:t.ownerScope,scopeKind:'personal',actorId:t.ownerScope},
    {query:async(sql,args)=>(await owner.query(sql,args)).rows});
  const sample=async(lock=false)=>(await owner.query(`SELECT l.*,l.xmin::text AS row_version,d.factory_preparation,
      txid_current()::text AS transaction_id,pg_backend_pid() AS backend_pid,clock_timestamp() AS observed_at
    FROM engineering_factory_validation_lifecycle l JOIN engineering_routing_decisions d ON d.id=l.decision_id
    WHERE l.scope_id=$1 AND l.scope_kind='personal' AND l.work_id=$2 AND l.work_generation=$3 ${lock?'FOR UPDATE OF l':''}`,
    [t.ownerScope,r.workId,r.workGeneration])).rows[0];
  let claim:ValidationClaim|undefined,lifecycle:FactoryValidationLifecycle|undefined;
  let locked=false,ownerTransaction=false,factoryTransaction=false,phase='PRE_EFFECT',manifest:Record<string,any>|undefined;
  async function emit(event:Record<string,unknown>){await audit({workId:r.workId,workVersion:a.workVersion,workGeneration:r.workGeneration,phase,...event});}
  async function rollback(client:OperatorClient){try{await client.query('ROLLBACK');}catch{/* uncertain clients are never reused for installation */}}
  async function unlock(){if(locked){await owner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);locked=false;}}
  try{
    // These are bounded database waits, never model/execution retries.
    await owner.query("SET lock_timeout='250ms'");await owner.query("SET statement_timeout='2000ms'");
    await factory.query("SET lock_timeout='250ms'");await factory.query("SET statement_timeout='2000ms'");
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      const preliminary=await sample();
      if(preliminary&&new Date(preliminary.deadline).getTime()<=new Date(preliminary.observed_at).getTime())fail('DEADLINE_EXPIRED');
      locked=(await owner.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked',[key])).rows[0].locked;
      let waiting='OWNER_LOCK_BUSY';
      if(locked){
        await owner.query('BEGIN');ownerTransaction=true;
        const [work]=(await owner.query(`SELECT * FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE`,[t.ownerScope,r.workId])).rows;
        const current=await sample(true),p=current?.factory_preparation;
        const stopped=(await owner.query(`SELECT 1 FROM engineering_factory_commands WHERE scope_id=$1 AND scope_kind='personal' AND work_id=$2 AND work_version=$3 AND work_generation=$4 AND operation IN ('stop','takeover') LIMIT 1`,[t.ownerScope,r.workId,a.workVersion,r.workGeneration])).rows.length>0;
        const predicates={work_present:!!work,work_version:work?.version===a.workVersion,work_generation:work?.generation===r.workGeneration,
          work_active:work?.lifecycle==='active'&&work?.control==='agent',no_stop_command:!stopped,
          lifecycle_present:!!current,protocol:p?.validationProtocol===2,no_mutable_preparation:!!p&&!('validationState'in p),
          lifecycle_work_version:current?.work_version===a.workVersion,lifecycle_work_generation:current?.work_generation===r.workGeneration,
          request_identity:!!p&&current?.request_id===p.request.requestId,
          lifecycle_state_is_waiting:current?.state==='WAITING_GRANT',deadline_live:!!current&&new Date(current.deadline)>new Date(current.observed_at),
          lease_live:current?.state!=='IN_FLIGHT'||new Date(current.lease_until)>new Date(current.observed_at)};
        const failed=Object.entries(predicates).filter(([,pass])=>!pass).map(([name])=>name);
        await emit({event:'LOCKED_DECISION',attempt,preliminary:snapshot(preliminary),authoritative:snapshot(current),failedPredicates:failed,
          changedBetweenReads:!!preliminary&&!!current&&preliminary.row_version!==current.row_version});
        // Only absence before preparation, IDLE and a LIVE controller claim are
        // transient. Terminal, stale, cancelled or expired states never wait.
        const allowedWait=new Set(current?['lifecycle_state_is_waiting']:['lifecycle_present','protocol','no_mutable_preparation','lifecycle_work_version','lifecycle_work_generation','request_identity','lifecycle_state_is_waiting','deadline_live']);
        if(failed.some(name=>!allowedWait.has(name)))fail(failed.find(name=>!allowedWait.has(name))!);
        if(current&&['HALTED','COMPLETED'].includes(current.state))fail('TERMINAL_ATTEMPT');
        if(current&&current.state==='WAITING_GRANT'){
          if(productionApproval){
           assertProductionApproval(productionApproval.envelope,productionApproval.sha256,new Date(current.observed_at).getTime());
           if(new Date(current.deadline).getTime()>Date.parse((productionApproval.envelope as any).expiresAt)||p.authorizationEnvelopeSha256!==productionApproval.sha256||current.grant_sha256)fail('APPROVAL_OR_REPLAY_BINDING');
          }
          const canonical=await store.get(r.workId);
          if(!same(canonical.criteria,a.criteria)||work.repository!==r.repository||work.title!==r.input.title||work.objective!==r.input.description)fail('WORK_BINDING');
          const expectedRequest={spendContract:a.canonicalSpendPlan,requestId:p.request.requestId,workId:r.workId,workGeneration:r.workGeneration,repository:r.repository,deadline:iso(current.deadline),maxSpendUsd:r.maxSpendUsd,
            input:{...r.input,reproductionCommand:null,expectedFailureText:null,baseRef:r.source.commit,workerProfile:'container'}};
          if(!same(p.request,expectedRequest)||p.configurationHash!==a.configurationHash||!same(p.environment.binding,a.environmentBinding)||
            current.factory_version!==t.factoryVersion||current.configuration_hash!==a.configurationHash||!same(current.environment_binding,a.environmentBinding))fail('PREPARATION_BINDING');
          const remaining=new Date(current.deadline).getTime()-new Date(current.observed_at).getTime();
          if(remaining>180000)fail('DEADLINE_EXCEEDS_APPROVAL');
          manifest={...t,request:{...r,requestId:current.request_id,deadline:iso(current.deadline)}};
          if(productionApproval)manifest={...manifest,version:2,authorizationEnvelope:productionApproval.envelope,authorizationEnvelopeSha256:productionApproval.sha256};
          lifecycle=new FactoryValidationLifecycle(store,current.decision_id);
          const claimed=await lifecycle.claim();if(claimed.state!=='CLAIMED')fail('CLAIM_NOT_ACQUIRED');
          claim=claimed.claim;phase='CLAIM_COMMIT_PENDING';
          await owner.query('COMMIT');ownerTransaction=false;phase='CLAIM_DURABLE';
          await emit({event:'CLAIM_DURABLE',claim:snapshot(await sample())});
          break;
        }
        waiting=current?'LIFECYCLE_GRANT_WAIT_REQUIRED':'AWAITING_CANONICAL_PREPARATION';
        await owner.query('ROLLBACK');ownerTransaction=false;await unlock();
      }
      await emit({event:'BOUNDED_WAIT',attempt,predicate:waiting,preliminary:snapshot(preliminary)});
      if(attempt===maxAttempts||performance.now()-started>=maxWaitMs)fail('WAIT_BOUND_EXHAUSTED');
      await sleep(Math.min(waitMs,Math.max(1,maxWaitMs-(performance.now()-started))));
    }
    if(!claim||!lifecycle||!manifest)fail('NO_AUTHORITATIVE_CLAIM');
    // A committed lifecycle lease outlives this connection. No controller can
    // intake this request until the final successful release below.
    await factory.query('BEGIN');factoryTransaction=true;phase='FACTORY_TRANSACTION';
    await factory.query('SELECT pg_advisory_xact_lock(81427601)');
    await factory.query('SELECT pg_advisory_xact_lock(81427603)');
    await factory.query('LOCK TABLE factory.production_work_authority IN SHARE ROW EXCLUSIVE MODE');
    const env=(await factory.query('SELECT * FROM factory.environment WHERE singleton')).rows[0];
    if(!env||env.environment!=='production'||env.owner_scope!==(a.ownerBinding?a.installation.ownerScope:t.ownerScope)||env.project_id!==a.installation.projectId||env.database_resource_id!==a.installation.databaseResourceId||env.custody_store_id!==a.installation.custodyStoreId)fail('PRODUCTION_DATABASE_BOUNDARY');
    const rows=(await factory.query('SELECT * FROM factory.production_work_authority ORDER BY request_id FOR UPDATE')).rows;
    for(const h of a.historicalGrants){if(!rows.some(row=>row.request_id===h.requestId&&row.work_id===h.workId&&row.state==='REVOKED'&&iso(row.consumed_at)===(h.consumedAt??null)&&row.manifest_sha256===h.manifestSha256&&digest(row.manifest)===h.manifestSha256))fail('HISTORICAL_AUTHORITY_CHANGED');}
    const existing=rows.find(row=>row.request_id===manifest!.request.requestId);
    if(rows.some(row=>row!==existing&&!a.historicalGrants.some(h=>row.request_id===h.requestId&&row.work_id===h.workId&&row.state==='REVOKED'&&iso(row.consumed_at)===(h.consumedAt??null)&&row.manifest_sha256===h.manifestSha256&&digest(row.manifest)===h.manifestSha256)))fail('UNEXPECTED_AUTHORITY');
    if(existing&&(existing.state!=='AUTHORIZED'||existing.consumed_at!==null||existing.manifest_sha256!==digest(manifest)||!same(existing.manifest,manifest)))fail('EXISTING_AUTHORITY_NOT_REUSABLE');
    // A new alpha slot may coexist with preserved settled history. It may not
    // reuse its own slot, or overlap another unresolved paid operation.
    if(successor){
      await assertSuccessorPredecessor(factory,a);
      const receipts=(await factory.query('SELECT request_id FROM factory.intake_receipts WHERE client_id=$1',[t.clientId])).rows;
      if(receipts.length!==1||receipts[0].request_id!==successor.predecessor.requestId)fail('SUCCESSOR_INTAKE_HISTORY');
    }
    const priorExecution=a.ownerBinding
      ?(await factory.query(`SELECT 1 FROM factory.work_spend_operations o
          LEFT JOIN factory.intake_receipts i ON i.run_id=o.run_id
          WHERE i.client_id=$1 OR i.run_id IS NULL OR o.state IN ('reserved','dispatched','unknown') LIMIT 1`,[t.clientId])).rows.length
        ||(!successor&&(await factory.query('SELECT 1 FROM factory.intake_receipts WHERE client_id=$1 LIMIT 1',[t.clientId])).rows.length)
      :(await factory.query('SELECT 1 FROM factory.work_spend_operations LIMIT 1')).rows.length;
    if(priorExecution||
      (await factory.query('SELECT 1 FROM factory.intake_receipts WHERE request_id=$1 LIMIT 1',[manifest.request.requestId])).rows.length)fail('UNEXPECTED_EXECUTION');
    await owner.query('BEGIN');ownerTransaction=true;
    await owner.query(`SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE`,[t.ownerScope,r.workId]);
    await lifecycle.assertActive(claim,true);
    const clock=async()=>{if(productionApproval)assertProductionApproval(productionApproval.envelope,productionApproval.sha256);const [row]=(await factory.query('SELECT clock_timestamp()<$1::timestamptz AS live',[manifest!.request.deadline])).rows;if(!row.live)fail('DEADLINE_EXPIRED');};
    await clock();
    if(!existing)await factory.query(`INSERT INTO factory.production_work_authority(request_id,work_id,client_id,manifest,manifest_sha256,state) VALUES($1,$2,$3,$4,$5,'AUTHORIZED')`,[manifest.request.requestId,r.workId,t.clientId,manifest,digest(manifest)]);
    await lifecycle.assertActive(claim);await clock();
    await emit({event:'FACTORY_COMMIT_DECISION',authorityDigest:digest(manifest),authoritative:snapshot(await sample())});
    await lifecycle.assertActive(claim);await clock();
    phase='FACTORY_COMMIT_PENDING';await factory.query('COMMIT');factoryTransaction=false;phase='FACTORY_COMMITTED';
    const [readback]=(await factory.query('SELECT state,manifest_sha256,manifest,consumed_at FROM factory.production_work_authority WHERE request_id=$1',[manifest.request.requestId])).rows;
    if(!readback||readback.state!=='AUTHORIZED'||readback.consumed_at!==null||readback.manifest_sha256!==digest(manifest)||!same(readback.manifest,manifest))fail('FACTORY_READBACK_MISMATCH');
    await lifecycle.assertActive(claim);await clock();
    await emit({event:'ACTIVATION_COMMIT_DECISION',authorityDigest:digest(manifest)});
    await lifecycle.assertActive(claim);await clock();
    await lifecycle.finish(claim,'WAITING_GRANT',productionApproval?digest(manifest):undefined);
    phase='ACTIVATION_COMMIT_PENDING';await owner.query('COMMIT');ownerTransaction=false;phase='ACTIVATED';
    await emit({event:'INSTALLED',authorityDigest:digest(manifest),alreadyPresent:!!existing});
    return {state:'INSTALLED' as const,requestId:manifest.request.requestId,deadline:manifest.request.deadline,manifestSha256:digest(manifest),alreadyPresent:!!existing};
  }catch(error){
    const failedPhase=phase;
    if(factoryTransaction)await rollback(factory);if(ownerTransaction)await rollback(owner);
    // A post-claim failure NEVER returns to polling, reinserts authority, renews
    // the lease or releases WAITING_GRANT. Best effort cleanup; exact independent
    // readback is still mandatory when either connection is unavailable.
    let haltConfirmed=false,revocationConfirmed=false;
    if(claim&&lifecycle){
      try{await lifecycle.halt('GRANT_MATERIALIZATION_INTERRUPTED');haltConfirmed=(await lifecycle.read())?.state==='HALTED';}catch{}
      if(manifest)try{
        await factory.query(`UPDATE factory.production_work_authority SET state='REVOKED' WHERE request_id=$1 AND manifest_sha256=$2 AND state='AUTHORIZED'`,[manifest.request.requestId,digest(manifest)]);
        revocationConfirmed=!(await factory.query("SELECT 1 FROM factory.production_work_authority WHERE request_id=$1 AND state='AUTHORIZED'",[manifest.request.requestId])).rows.length;
      }catch{}
    }
    const predicate=error instanceof BoundaryFailure?error.message:'DATABASE_OR_AUDIT_FAILURE';
    await emit({event:claim?'UNKNOWN_REQUIRES_READBACK':'DENIED',predicate,failedPhase,haltConfirmed,revocationConfirmed,
      possiblyActivated:['ACTIVATION_COMMIT_PENDING','ACTIVATED'].includes(failedPhase)}).catch(()=>{});
    throw new Error(claim?'GRANT_UNKNOWN_REQUIRES_READBACK':predicate);
  }finally{
    // Never release a lifecycle claim here. Only a session lock is released.
    await unlock().catch(()=>{});
  }
}
