import {randomUUID} from 'node:crypto';
import {WorkStore,type WorkDatabase} from './store.ts';

export interface ValidationClaim {token:string;epoch:number}
/** A controller lease, never a Factory execution grant. The exact request_id is
 * also the Factory grant/attempt reference; authority stays in Factory. */
export class FactoryValidationLifecycle {
 constructor(readonly store:WorkStore,readonly decisionId:string){}
 private scope(){return [this.store.principal.scopeId,this.store.principal.scopeKind,this.decisionId];}
 async read(){const [row]=await this.store.database.query('SELECT * FROM engineering_factory_validation_lifecycle WHERE scope_id=$1 AND scope_kind=$2 AND decision_id=$3',this.scope());return row??null;}
 async claim():Promise<{state:'CLAIMED';claim:ValidationClaim}|{state:'BUSY'|'HALTED'|'COMPLETED'}>{
  // Recovery fences only. An uncertain external call is never productively replayed.
  await this.store.database.query(`UPDATE engineering_factory_validation_lifecycle SET state='HALTED',failure='VALIDATION_EXPIRED_OR_INTERRUPTED',claim_token=NULL,lease_until=NULL,claim_epoch=claim_epoch+1
   WHERE scope_id=$1 AND scope_kind=$2 AND decision_id=$3 AND state NOT IN ('HALTED','COMPLETED')
   AND (deadline<=clock_timestamp() OR (state='IN_FLIGHT' AND lease_until<=clock_timestamp()))`,this.scope());
  const token=randomUUID();
  const [row]=await this.store.database.query(`UPDATE engineering_factory_validation_lifecycle SET state='IN_FLIGHT',claim_token=$4,claim_epoch=claim_epoch+1,lease_until=least(deadline,clock_timestamp()+interval '45 seconds')
   WHERE scope_id=$1 AND scope_kind=$2 AND decision_id=$3 AND state IN ('IDLE','WAITING_GRANT') AND deadline>clock_timestamp() RETURNING claim_epoch`,[...this.scope(),token]);
  if(row)return {state:'CLAIMED',claim:{token,epoch:Number(row.claim_epoch)}};
  const current=await this.read();
  if(!current)throw Error('VALIDATION_LIFECYCLE_MISSING');
  return {state:current.state==='COMPLETED'?'COMPLETED':current.state==='HALTED'?'HALTED':'BUSY'};
 }
 async assertActive(claim:ValidationClaim,lock=false){
  const [row]=await this.store.database.query(`SELECT l.decision_id FROM engineering_factory_validation_lifecycle l
   JOIN engineering_work w ON w.scope_id=l.scope_id AND w.scope_kind=l.scope_kind AND w.id=l.work_id
   WHERE l.scope_id=$1 AND l.scope_kind=$2 AND l.decision_id=$3 AND l.state='IN_FLIGHT' AND l.claim_token=$4 AND l.claim_epoch=$5
   AND l.lease_until>clock_timestamp() AND l.deadline>clock_timestamp() AND w.version=l.work_version AND w.generation=l.work_generation AND w.lifecycle='active' AND w.control='agent'
   AND NOT EXISTS(SELECT 1 FROM engineering_factory_commands c WHERE c.scope_id=l.scope_id AND c.scope_kind=l.scope_kind AND c.work_id=l.work_id AND c.work_generation=l.work_generation AND c.work_version=l.work_version AND c.operation IN ('stop','takeover')) ${lock?'FOR UPDATE OF l':''}`,[...this.scope(),claim.token,claim.epoch]);
  if(!row)throw Error('VALIDATION_CLAIM_FENCED');
 }
 fencedStore(claim:ValidationClaim){
  const atomic=this.store.database.atomic?.bind(this.store.database);
  if(!atomic)throw Error('VALIDATION_ATOMIC_DATABASE_REQUIRED');
  // Every SQL operation, including CTE/function writes, checks and locks the
  // lifecycle in its own transaction. Never hold the lock across remote I/O.
  const database:WorkDatabase={query:(sql,args)=>atomic(async db=>{
   const guard=new FactoryValidationLifecycle(new WorkStore(this.store.principal,db),this.decisionId);
   await guard.assertActive(claim,true);
   const rows=await db.query(sql,args);
   await guard.assertActive(claim);
   return rows;
  })};
  return new WorkStore(this.store.principal,database);
 }
 async finish(claim:ValidationClaim,state:'IDLE'|'WAITING_GRANT'|'COMPLETED',grantSha256?:string){
  await this.assertActive(claim);
  const [row]=await this.store.database.query(`UPDATE engineering_factory_validation_lifecycle SET state=$6,claim_token=NULL,lease_until=NULL,grant_sha256=coalesce($7,grant_sha256)
   WHERE scope_id=$1 AND scope_kind=$2 AND decision_id=$3 AND state='IN_FLIGHT' AND claim_token=$4 AND claim_epoch=$5 AND lease_until>clock_timestamp() AND deadline>clock_timestamp() RETURNING decision_id`,[...this.scope(),claim.token,claim.epoch,state,grantSha256??null]);
  if(!row)throw Error('VALIDATION_CLAIM_FENCED');
 }
 async halt(reason:string,claim?:ValidationClaim){
  const [row]=await this.store.database.query(`UPDATE engineering_factory_validation_lifecycle SET state='HALTED',failure=$4,claim_token=NULL,lease_until=NULL,claim_epoch=claim_epoch+1
   WHERE scope_id=$1 AND scope_kind=$2 AND decision_id=$3 AND state NOT IN ('HALTED','COMPLETED')
   AND ($5::uuid IS NULL OR (claim_token=$5 AND claim_epoch=$6)) RETURNING decision_id`,[...this.scope(),reason.slice(0,300),claim?.token??null,claim?.epoch??null]);
  return !!row;
 }
}

/** One SQL statement: a failed lifecycle insert rolls the preparation back too. */
export async function saveValidationPreparation(store:WorkStore,workId:string,decisionId:string,preparation:string){
 const [saved]=await store.database.query(`WITH saved AS (
  UPDATE engineering_routing_decisions SET factory_preparation=$5::jsonb
  WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND id=$4 AND status='PROPOSED' AND factory_preparation IS NULL RETURNING *)
  INSERT INTO engineering_factory_validation_lifecycle(decision_id,scope_id,scope_kind,work_id,work_version,work_generation,request_id,configuration_hash,factory_version,environment_binding,deadline)
  SELECT id,scope_id,scope_kind,work_id,work_version,(factory_preparation#>>'{request,workGeneration}')::integer,
   (factory_preparation#>>'{request,requestId}')::uuid,factory_preparation->>'configurationHash',factory_preparation#>>'{environment,binding,factoryVersion}',
   factory_preparation#>'{environment,binding}',(factory_preparation#>>'{request,deadline}')::timestamptz FROM saved RETURNING decision_id`,
  [store.principal.scopeId,store.principal.scopeKind,workId,decisionId,preparation]);
 return saved;
}

/** Gate classification is separate from durable evidence readback. A retained
 * Proof alone cannot turn an interrupted lifecycle into a successful release. */
export async function readValidationGate(store:WorkStore,work:{id:string;version:number;generation:number}){
 const [row]=await store.database.query(`SELECT l.state,l.request_id,l.factory_version,d.factory_preparation->>'validationProtocol' AS protocol
  FROM engineering_routing_decisions d LEFT JOIN engineering_factory_validation_lifecycle l
   ON l.decision_id=d.id AND l.scope_id=d.scope_id AND l.scope_kind=d.scope_kind AND l.work_generation=$5
  WHERE d.scope_id=$1 AND d.scope_kind=$2 AND d.work_id=$3 AND d.work_version=$4`,
  [store.principal.scopeId,store.principal.scopeKind,work.id,work.version,work.generation]);
 if(!row)return {state:'AWAITING_EVIDENCE' as const};
 if(row.protocol!=='2'||!row.state||row.state==='HALTED')return {state:'BLOCKED' as const};
 if(row.state!=='COMPLETED')return {state:'AWAITING_EVIDENCE' as const};
 return {state:'COMPLETED' as const,requestId:String(row.request_id),factoryVersion:String(row.factory_version)};
}
