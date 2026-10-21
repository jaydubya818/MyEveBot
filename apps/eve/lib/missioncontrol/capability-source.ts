import { z } from 'zod';
import type { WorkDatabase } from '../engineering/store.ts';
import { issueBackendOrderedPermit } from '../../../../packages/capability-enforcement/src/ordering-source.ts';
import { verifyPolicyMessage, type PolicyKey, type SignedPolicyMessage } from '../../../../packages/capability-enforcement/src/ordering-wire.ts';
import type { OwnerEnrollment } from './execution-permit.ts';

/** Reuses the canonical issuer and immutable decisions; no alternate policy cache. */
export async function issueMissionControlSourcePermit(database:WorkDatabase,enrollment:OwnerEnrollment,challenge:SignedPolicyMessage,
  env:NodeJS.ProcessEnv=process.env) {
  if(!database.atomic||env.MYEVE_MISSIONCONTROL_MODE!=='APPROVED_NONPRODUCTION'
    ||env.MYEVE_CAPABILITY_CONTROL_ENABLED!=='true'||env.MYEVE_CAPABILITY_ENVIRONMENT!=='qualification'
    ||env.MYEVE_CAPABILITY_INSTALLATION_ID!==enrollment.installationId||env.MYEVE_OWNER_ID!==enrollment.ownerId)
    throw Error('MISSIONCONTROL_CAPABILITY_UNAVAILABLE');
  const backendId=env.MYEVE_MISSIONCONTROL_CAPABILITY_BACKEND_ID,agentId=env.MYEVE_MISSIONCONTROL_CAPABILITY_AGENT_ID;
  if(!backendId||!agentId||!env.MYEVE_CAPABILITY_PROPAGATION_JSON)throw Error('MISSIONCONTROL_CAPABILITY_UNAVAILABLE');
  const transport=z.object({signer:z.object({keyId:z.string().min(1),jwk:z.record(z.string(),z.unknown())})}).loose()
    .parse(JSON.parse(env.MYEVE_CAPABILITY_PROPAGATION_JSON));
  return database.atomic(async database=>{
    await database.query("SELECT set_config('myeve.capability_owner',$1,true),set_config('myeve.capability_installation',$2,true)",[enrollment.ownerId,enrollment.installationId]);
    const [installation]=await database.query('SELECT organization_id FROM capability_control.installations WHERE id=$1 AND active',[enrollment.installationId]);
    const [destination]=await database.query(`SELECT key_id,public_jwk FROM capability_control.policy_destinations
      WHERE installation_id=$1 AND owner_id=$2 AND backend_id=$3`,[enrollment.installationId,enrollment.ownerId,backendId]);
    if(!installation||!destination)throw Error('MISSIONCONTROL_CAPABILITY_UNAVAILABLE');
    const authenticated=await verifyPolicyMessage(challenge,{keyId:destination.key_id,jwk:destination.public_jwk});
    if(authenticated.kind!=='CHALLENGE'||authenticated.agentId!==agentId)throw Error('MISSIONCONTROL_CAPABILITY_UNAVAILABLE');
    const connection={query:async(sql:string,values?:unknown[])=>({rows:await database.query(sql,values)})};
    return issueBackendOrderedPermit(connection,challenge,{ownerId:enrollment.ownerId,installationId:enrollment.installationId,
      organizationId:installation.organization_id,agentId,environment:'qualification'},backendId,transport.signer as PolicyKey);
  });
}
