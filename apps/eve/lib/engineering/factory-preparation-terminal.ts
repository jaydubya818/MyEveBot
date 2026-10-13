import {canonical} from './factory-producer-protocol.ts';
import {parseFactoryPreparationTerminal,type FactoryPreparationTerminal} from '../../../../packages/capability-enforcement/src/factory-preparation-terminal.ts';
import type {SignedPolicyMessage} from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import type {WorkStore} from './store.ts';

/** Constructed only after strict signed readback verification by the enrolled adapter. */
export class FactoryPreparationTerminalReceived extends Error {
  constructor(readonly receipt: FactoryPreparationTerminal, readonly envelope: SignedPolicyMessage) {
    super('FACTORY_PREPARATION_TERMINAL');
  }
}
export async function sealFactoryPreparationTerminal(store: WorkStore, decision: Record<string,any>,
  terminal: FactoryPreparationTerminalReceived) {
  if(store.principal.scopeKind!=='personal'||store.principal.scopeId!==terminal.receipt.ownerId||typeof decision.id!=='string'||decision.work_id!==terminal.receipt.workId||!decision.factory_preparation)throw Error('FACTORY_TERMINAL_SEAL_CONFLICT');
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

export function factoryTerminalActivity(value:unknown){
 if(!value)return null;
 const receipt=parseFactoryPreparationTerminal((value as {receipt:unknown}).receipt);
 if((value as {accounting:unknown}).accounting!=='HOLD')throw Error('FACTORY_TERMINAL_SEAL_CONFLICT');
 return receipt.outcome==='ADMISSION_UNCERTAIN'
  ?{status:'Needs reconciliation',activity:'Factory admission remains uncertain. Its reservation stays held.',nextStep:'Reconcile this exact Work and request with the backend. Do not resend preparation or release its reservation.'}
  :{status:'Not admitted',activity:'Factory confirmed that this request was not admitted. Its reservation stays held.',nextStep:'Review the terminal receipt. Reservation release requires a separately qualified canonical operation.'};
}
