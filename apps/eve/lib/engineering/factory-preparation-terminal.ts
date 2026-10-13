import {canonical,digest} from './factory-producer-protocol.ts';
import {parseFactoryPreparationTerminal,verifyFactoryPreparationTerminal,type FactoryPreparationTerminal,type TerminalBinding} from '../../../../packages/capability-enforcement/src/factory-preparation-terminal.ts';
import type {SignedPolicyMessage,PolicyKey} from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import type {WorkStore} from './store.ts';

/** Carries a candidate terminal receipt; the durable seal verifies it independently. */
export class FactoryPreparationTerminalReceived extends Error {
  constructor(readonly receipt: FactoryPreparationTerminal, readonly envelope: SignedPolicyMessage) {
    super('FACTORY_PREPARATION_TERMINAL');
  }
}
export async function sealFactoryPreparationTerminal(store: WorkStore, decision: Record<string,any>,
  terminal: FactoryPreparationTerminalReceived, verification:{key:PolicyKey;expected:TerminalBinding;originalRequest:Record<string,any>;nativeRequest:Record<string,any>}) {
  if(store.principal.scopeKind!=='personal'||store.principal.scopeId!==terminal.receipt.ownerId||typeof decision.id!=='string'||decision.work_id!==terminal.receipt.workId||!decision.factory_preparation)throw Error('FACTORY_TERMINAL_SEAL_CONFLICT');
  // The error object carries no authority. Reverify using the original adapter's
  // enrolled key and request binding immediately before the durable mutation.
  if(!verification)throw Error('FACTORY_TERMINAL_VERIFICATION_REQUIRED');
  if(canonical(verification.originalRequest)!==canonical(decision.factory_preparation.request)
    ||digest(verification.nativeRequest)!==verification.expected.nativeRequestDigest
    ||verification.expected.requestId!==decision.factory_preparation.request.requestId
    ||verification.expected.workId!==decision.work_id||verification.expected.generation!==decision.factory_preparation.request.workGeneration)
    throw Error('FACTORY_TERMINAL_SEAL_CONFLICT');
  const verified=await verifyFactoryPreparationTerminal(terminal.envelope,verification.key,verification.expected);
  if(canonical(verified)!==canonical(terminal.receipt))throw Error('FACTORY_TERMINAL_SEAL_CONFLICT');
  const scope = [store.principal.scopeId,store.principal.scopeKind,decision.work_id,decision.id];
  const value = {accounting:'HOLD',receipt:terminal.receipt,envelope:terminal.envelope};
  // The exact preparation comparison prevents stop/resume or config changes from
  // turning a receipt for one request into a terminal assertion for another.
  const [saved] = await store.database.query(`UPDATE engineering_routing_decisions
    SET factory_preparation=jsonb_set(factory_preparation,'{terminal}',$5::jsonb,true)
    WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND id=$4
      AND factory_preparation=$6::jsonb AND NOT (factory_preparation ? 'terminal') RETURNING factory_preparation`,
    [...scope,JSON.stringify(value),JSON.stringify(decision.factory_preparation)]);
  if (saved?.factory_preparation?.terminal) return saved.factory_preparation.terminal;
  const [current] = await store.database.query(`SELECT factory_preparation FROM engineering_routing_decisions
    WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND id=$4`,scope);
  if (canonical(current?.factory_preparation?.terminal) !== canonical(value)) throw Error('FACTORY_TERMINAL_SEAL_CONFLICT');
  return current.factory_preparation.terminal;
}

/** A version change cannot create another request for a retained generation. */
export async function factoryPreparationForGeneration(store:WorkStore,workId:string,generation:number){
 const rows=await store.database.query(`SELECT * FROM engineering_routing_decisions
  WHERE scope_id=$1 AND scope_kind=$2 AND work_id=$3 AND factory_preparation IS NOT NULL
    AND factory_preparation#>>'{request,workGeneration}'=$4 ORDER BY created_at LIMIT 2`,
  [store.principal.scopeId,store.principal.scopeKind,workId,String(generation)]);
 if(rows.length>1)throw Error('FACTORY_PREPARATION_GENERATION_CONFLICT');
 return rows[0]??null;
}

export function factoryTerminalActivity(value:unknown){
 if(!value)return null;
 const receipt=parseFactoryPreparationTerminal((value as {receipt:unknown}).receipt);
 if((value as {accounting:unknown}).accounting!=='HOLD')throw Error('FACTORY_TERMINAL_SEAL_CONFLICT');
 return receipt.outcome==='ADMISSION_UNCERTAIN'
  ?{status:'Needs reconciliation',activity:'Factory admission remains uncertain. Its reservation stays held.',nextStep:'Reconcile this exact Work and request with the backend. Do not resend preparation or release its reservation.'}
  :{status:'Not admitted',activity:'Factory confirmed that this request was not admitted. Its reservation stays held.',nextStep:'Review the terminal receipt. Reservation release requires a separately qualified canonical operation.'};
}
