import {randomUUID} from 'node:crypto';
import type {WorkPrincipal} from './types.ts';
import type {WorkDatabase} from './store.ts';
import {canonical,sha256, type ResultManifest, type ResultKey} from './factory-producer-protocol.ts';

export interface FactoryBinding {
 workId: string; workVersion: number; workGeneration: number; criteriaVersion: number; agentId: string;
 factoryId: string; factoryVersion: string; requestId: string; requestDigest: string;
 sourceDigest: string; configurationDigest: string; workOrderId: string; runId: string;
 attemptNumber: number; inputCommit: string; operationId: string;
}
export type ReceiptState = 'RECEIVED'|'AUTHENTICATED'|'ATTESTED'|'INTEGRITY_VERIFIED'|'ADMITTED'|'REJECTED'|'STALE'|'CONFLICT';
export interface FactoryReceipt {
 id: string; request_id: string; envelope: string; envelope_digest: string; received_at: string;
 state: ReceiptState; reason: string|null; history: {state: ReceiptState; at?: string}[];
 provenance: {manifest: ResultManifest; manifestDigest: string; keyFingerprint: string; keyId: string; protocol: string; key: ResultKey}|null;
}
export interface FactoryRequest { id: string; binding: FactoryBinding; current: boolean; cancelled: boolean; eligible: boolean }
/** Only a server-authenticated principal and trusted backend DB enter this store.
 * All mutations use one Work-row-serialized SQL statement; no writer store calls. */
export class FactoryReceiptStore {
 constructor(readonly principal: WorkPrincipal, readonly database: WorkDatabase) {}
 private async call<T>(value: Record<string,unknown>): Promise<T> {
  const [row]=await this.database.query('SELECT engineering_factory_receipt($1::jsonb) value',
   [JSON.stringify({...value,...this.principal})]);
  if (!row?.value) throw new Error('Factory receipt persistence failed');
  return row.value as T;
 }
 async register(binding: FactoryBinding) {
  return this.call<FactoryRequest>({action:'register',id:randomUUID(),binding});
 }
 async request(id: string): Promise<FactoryRequest> {
  const [row]=await this.database.query(`SELECT q.id,q.binding,q.current,q.cancelled,
   (q.current AND NOT q.cancelled AND w.lifecycle='active' AND w.control='agent'
    AND w.version=(q.binding->>'workVersion')::integer AND w.generation=(q.binding->>'workGeneration')::integer
    AND w.criteria_version=(q.binding->>'criteriaVersion')::integer
    AND EXISTS(SELECT 1 FROM agents WHERE id=q.agent_id AND owner_id=q.scope_id AND status='active')) eligible
   FROM engineering_factory_requests q JOIN engineering_work w ON w.scope_id=q.scope_id AND w.scope_kind=q.scope_kind AND w.id=q.work_id
   WHERE q.id=$1 AND q.scope_id=$2 AND q.scope_kind=$3 AND q.actor_id=$4`,[id,this.principal.scopeId,this.principal.scopeKind,this.principal.actorId]);
  if(!row) throw new Error('Factory request not found in this scope');
  return row as FactoryRequest;
 }
 async cancel(requestId: string) { return this.call<FactoryRequest>({action:'cancel',requestId}); }
 async receive(requestId: string, value: unknown) {
  const envelope=canonical(value);
  if(Buffer.byteLength(envelope)>12*1024*1024) throw new Error('Result size limit');
  return this.call<FactoryReceipt>({action:'receive',requestId,id:randomUUID(),envelope,envelopeDigest:sha256(envelope)});
 }
 async get(requestId: string, receiptId: string): Promise<FactoryReceipt> {
  await this.request(requestId);
  const [row]=await this.database.query('SELECT * FROM engineering_factory_receipts WHERE request_id=$1 AND id=$2',[requestId,receiptId]);
  if(!row) throw new Error('Factory receipt not found in this request');
  return row as FactoryReceipt;
 }
 async transition(receipt: FactoryReceipt, state: ReceiptState, extra: {provenance?: FactoryReceipt['provenance'];reason?: string;keyCurrent?: boolean;key?: ResultKey}={}) {
  return this.call<FactoryReceipt>({action:'transition',requestId:receipt.request_id,receiptId:receipt.id,state,...extra});
 }
 async admission(requestId: string) {
  await this.request(requestId);
  const [row]=await this.database.query('SELECT receipt_id,manifest_digest,admitted_at FROM engineering_factory_admissions WHERE request_id=$1',[requestId]);
  return row ?? null;
 }
 /** Recovery callers enumerate durable pending receipts, then call resume with
  * current trusted keys. There is no Factory submission capability here. */
 async pending() {
  return this.database.query(`SELECT r.id,r.request_id FROM engineering_factory_receipts r
   JOIN engineering_factory_requests q ON q.id=r.request_id
   WHERE q.scope_id=$1 AND q.scope_kind=$2 AND q.actor_id=$3
   AND r.state IN ('RECEIVED','AUTHENTICATED','ATTESTED','INTEGRITY_VERIFIED') ORDER BY r.received_at,r.id LIMIT 100`,
   [this.principal.scopeId,this.principal.scopeKind,this.principal.actorId]);
 }
}
