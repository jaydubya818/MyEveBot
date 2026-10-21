import { digest } from '../engineering/contract.ts';
import { factoryExecutionConfigurationHash } from '../engineering/factory-configuration-hash.ts';
import type { FactoryRuntime } from '../engineering/factory-routing.ts';
import { WorkStore, type WorkDatabase } from '../engineering/store.ts';
import type { Work } from '../engineering/types.ts';
import { ownerEnrollmentSchema, type OwnerEnrollment } from './execution-permit.ts';

const denied = (): never => { throw Error('MISSIONCONTROL_OWNER_FACTORY_BINDING_DENIED'); };
export function ownerFactoryWorkMaterial(work: Work, enrollment: OwnerEnrollment) {
  const pins = enrollment.ownerFactoryAdapter;
  if (!pins || work.scopeId !== enrollment.ownerId || work.repository !== pins.repository) return denied();
  return {schema:'mc-owner-factory-work/v1',ownerId:work.scopeId,installationId:enrollment.installationId,
    connectionId:enrollment.connectionId,workId:work.id,version:work.version,generation:work.generation,
    criteriaVersion:work.criteriaVersion,title:work.title,objective:work.objective,criteria:work.criteria,
    repository:work.repository,maxCostUsd:work.maxCostUsd,maxDurationSeconds:work.maxDurationSeconds,
    factoryVersion:enrollment.factoryVersion,executionContractSha256:enrollment.executionContractSha256,
    capabilityPolicySha256:enrollment.capabilityPolicySha256,pins};
}

export const ownerFactoryWorkTuple=(work:Work,enrollment:OwnerEnrollment)=>digest(ownerFactoryWorkMaterial(work,enrollment));

/** Checks existing operator configuration. Does not create a profile, account, grant or alpha slot. */
export function assertOwnerFactoryConfiguration(work: Work, enrollment: OwnerEnrollment, config: FactoryRuntime, now=Date.now()) {
  const pins=enrollment.ownerFactoryAdapter,c=config.connection,q=c.qualification;
  if(!pins || enrollment.revokedAt!==null || enrollment.activeFrom>now || enrollment.expiresAt<=now
    || config.engineering.ownerId!==enrollment.ownerId || config.engineering.agentId!==pins.agentId
    || pins.repository!==work.repository || config.engineering.profile.repository!==work.repository
    || pins.factoryId!==c.factoryId || pins.sourceDigest!==c.sourceDigest || pins.configurationDigest!==c.configurationDigest
    || enrollment.factoryVersion!==c.factoryVersion || c.factoryVersion!==digest({sourceDigest:c.sourceDigest,configurationDigest:c.configurationDigest})
    || pins.configurationHash!==factoryExecutionConfigurationHash(config) || pins.profileHash!==digest(config.engineering.profile)
    || q.profileHash!==pins.profileHash || q.scopeId!==work.scopeId || Date.parse(q.qualifiedAt)>now || Date.parse(q.expiresAt)<=now
    || !Number.isSafeInteger(work.maxCostUsd*1e6) || work.maxCostUsd*1e6>enrollment.maxCostMicrousd
    || work.maxDurationSeconds>enrollment.maxDurationSeconds) return denied();
  return ownerFactoryWorkTuple(work,enrollment);
}

export async function ownerFactoryOrigin(database:WorkDatabase,ownerId:string,workId:string) {
  const rows=await database.query(`SELECT * FROM missioncontrol_owner_work_origins WHERE owner_id=$1 AND work_id=$2
    ORDER BY work_version DESC,work_generation DESC LIMIT 1`,[ownerId,workId]);
  return rows[0]??null;
}

/** Unenrolled legacy stores retain their existing behavior. Enrolled owners
 * require transactions even if optional adapter metadata was later removed.
 * The canonical enrollment lookup avoids interpreting an RLS-hidden origin as absence. */
export async function hasMissionControlEnrollment(database:WorkDatabase,ownerId:string) {
  const [row]=await database.query(`WITH context AS MATERIALIZED (
    SELECT set_config('myeve.missioncontrol_owner',$1,true) AS owner_id)
    SELECT missioncontrol_enrollment_document(context.owner_id) AS document FROM context`,[ownerId]);
  return Boolean(row?.document);
}

/** Persist provenance before asking MissionControl for owner approval. The Work lock
 * serializes this marker with every writer admission, including native fallback. */
export async function prepareOwnerFactoryOrigin(store:WorkStore,work:Work,config:FactoryRuntime,input:{proposalId:string;
  workOrderId:string;expectedWorkOrderRevisionId:string;expectedPlanDigest:string}) {
  const ownerId=store.principal.scopeId;
  if(!store.database.atomic || store.principal.scopeKind!=='personal'||store.principal.actorId!==ownerId) return denied();
  return store.database.atomic(async database=>{
    await database.query("SELECT set_config('myeve.missioncontrol_owner',$1,true)",[ownerId]);
    const [e]=await database.query('SELECT missioncontrol_enrollment_document($1) AS document',[ownerId]);
    const enrollment=ownerEnrollmentSchema.parse(e?.document);
    await database.query("SELECT id FROM engineering_work WHERE scope_id=$1 AND scope_kind='personal' AND id=$2 FOR UPDATE",[ownerId,work.id]);
    const current=await new WorkStore(store.principal,database).get(work.id);
    if(current.version!==work.version||current.generation!==work.generation||current.lifecycle!=='active'||current.control!=='agent')return denied();
    const tupleSha256=assertOwnerFactoryConfiguration(current,enrollment,config);
    const document={schema:'mc-owner-factory-origin/v1',installationId:enrollment.installationId,connectionId:enrollment.connectionId,
      tupleSha256,tupleMaterial:ownerFactoryWorkMaterial(current,enrollment),factoryVersion:enrollment.factoryVersion,pins:enrollment.ownerFactoryAdapter,proposalId:input.proposalId,workOrderId:input.workOrderId,
      expectedWorkOrderRevisionId:input.expectedWorkOrderRevisionId,expectedPlanDigest:input.expectedPlanDigest};
    await database.query(`INSERT INTO missioncontrol_owner_work_origins(owner_id,installation_id,work_id,work_version,work_generation,document)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[ownerId,enrollment.installationId,work.id,work.version,work.generation,document]);
    const origin=await ownerFactoryOrigin(database,ownerId,work.id);
    if(!origin||digest(origin.document)!==digest(document))return denied();
    return {enrollment,tupleSha256};
  });
}
