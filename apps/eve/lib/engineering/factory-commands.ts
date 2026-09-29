import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertBusinessEffect } from '../business-effects.ts';
import { WorkStore } from './store.ts';
import { WorkError } from './types.ts';
export const queuedFactoryActionSchema=z.object({operation:z.enum(['start','reconcile','stop','takeover']),expectedWorkVersion:z.number().int().positive(),expectedWorkGeneration:z.number().int().positive()}).strict();
export type FactoryCommand = z.infer<typeof queuedFactoryActionSchema>;
export interface FactoryQueuePolicy { ownerId:string;repository:string;maxCostUsd:number;maxDurationSeconds:number }
const policySchema=z.object({ownerId:z.string().min(1),repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),maxCostUsd:z.number().finite().positive().max(1.35),maxDurationSeconds:z.number().int().positive().max(600)}).strict();
/** Internal request transport. Caller authentication remains unchanged. */
export async function enqueueFactoryCommand(store:WorkStore,id:string,value:unknown,policy:FactoryQueuePolicy) {
 const input=queuedFactoryActionSchema.parse(value),limits=policySchema.parse(policy),p=store.principal;
 if(p.scopeKind!=='personal'||p.scopeId!==limits.ownerId||p.actorId!==p.scopeId)
  throw new WorkError('factory_scope','The configured owner is required.',403);
 const work=await store.get(id);
 if(work.version!==input.expectedWorkVersion||work.generation!==input.expectedWorkGeneration)
  throw new WorkError('factory_work_changed','Reload the current Work before acting.');
 if(input.operation==='start') {
  if(work.repository!==limits.repository||work.maxCostUsd>limits.maxCostUsd||work.maxDurationSeconds>limits.maxDurationSeconds)
   throw new WorkError('factory_limits','Work exceeds the reviewed repository or limits.',403);
  await assertBusinessEffect(store,id,{operation:'execute_factory'});
 }
 const [command]=await store.database.query(`INSERT INTO engineering_factory_commands(id,scope_id,scope_kind,work_id,work_version,work_generation,operation)
 SELECT $1,$2,$3,w.id,w.version,w.generation,$7 FROM engineering_work w
 WHERE w.scope_id=$2 AND w.scope_kind=$3 AND w.id=$4 AND w.version=$5 AND w.generation=$6
 ON CONFLICT(scope_id,scope_kind,work_id,work_version,work_generation,operation) DO UPDATE SET updated_at=engineering_factory_commands.updated_at
 RETURNING id,status,operation`,[randomUUID(),p.scopeId,p.scopeKind,id,work.version,work.generation,input.operation]);
 if(!command)throw new WorkError('factory_work_changed','Reload the current Work before acting.');
 return {state:'QUEUED',command,executionGranted:false};
}
/** Requires the owner's exclusive session advisory lock. Canonical driver still
 * checks all admission, writer, budget, custody and verification authority. */
export async function consumeFactoryCommands(store:WorkStore,execute:(id:string,input:FactoryCommand)=>Promise<unknown>) {
 const p=store.principal;
 const rows=await store.database.query(`SELECT * FROM engineering_factory_commands WHERE scope_id=$1 AND scope_kind=$2 AND status IN ('pending','running') ORDER BY CASE WHEN operation IN ('stop','takeover') THEN 0 ELSE 1 END,created_at LIMIT 20`,[p.scopeId,p.scopeKind]);
 for(const row of rows) {
  try {
   const work=await store.get(row.work_id);
   if(work.version!==Number(row.work_version)||work.generation!==Number(row.work_generation)) {
    await store.database.query("UPDATE engineering_factory_commands SET status='stale',updated_at=now() WHERE id=$1 AND scope_id=$2 AND scope_kind=$3",[row.id,p.scopeId,p.scopeKind]);continue;
   }
   if(row.operation==='start'||row.operation==='reconcile') {
    const stops=await store.database.query("SELECT id FROM engineering_factory_commands WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND work_version=$4 AND work_generation=$5 AND operation IN ('stop','takeover')",[p.scopeId,p.scopeKind,row.work_id,row.work_version,row.work_generation]);
    if(stops.length)throw new WorkError('factory_stop_requested','A stop request fences this revision.');
   }
   await store.database.query("UPDATE engineering_factory_commands SET status='running',updated_at=now() WHERE id=$1 AND scope_id=$2 AND scope_kind=$3",[row.id,p.scopeId,p.scopeKind]);
   await execute(row.work_id,queuedFactoryActionSchema.parse({operation:row.operation,expectedWorkVersion:Number(row.work_version),expectedWorkGeneration:Number(row.work_generation)}));
   await store.database.query("UPDATE engineering_factory_commands SET status='done',error_code=NULL,updated_at=now() WHERE id=$1 AND scope_id=$2 AND scope_kind=$3",[row.id,p.scopeId,p.scopeKind]);
  } catch(error) {
   await store.database.query("UPDATE engineering_factory_commands SET status='blocked',error_code=$4,updated_at=now() WHERE id=$1 AND scope_id=$2 AND scope_kind=$3",[row.id,p.scopeId,p.scopeKind,error instanceof WorkError?error.code:'factory_reconciliation_required']);
  }
 }
}
