import type {WorkDatabase} from '../engineering/store.ts';
import {canonicalWorkDatabase} from '../capability-control/admission.ts';
import {installedMissionControlConfig} from './installed-client.ts';
import {ownerEnrollmentSchema} from './execution-permit.ts';

/** Read the existing owner enrollment before selecting an installed adapter.
 * An unavailable store is an error, never evidence that an owner is unenrolled. */
export async function installedMissionControlEligibility(ownerId:string,env:NodeJS.ProcessEnv=process.env,
  purpose:'admission'|'control'='admission',database:Pick<WorkDatabase,'query'>=canonicalWorkDatabase()) {
  if(!ownerId||ownerId!==env.MYEVE_OWNER_ID)throw Error('MISSIONCONTROL_INSTALLATION_UNAVAILABLE');
  const [row]=await database.query(`WITH owner_scope AS MATERIALIZED (
    SELECT set_config('myeve.missioncontrol_owner',$1,true))
    SELECT missioncontrol_enrollment_document($1) AS document FROM owner_scope`,[ownerId]);
  if(!row)throw Error('MISSIONCONTROL_INSTALLATION_UNAVAILABLE');
  if(row.document===null)return null;
  const enrollment=ownerEnrollmentSchema.parse(row.document);
  const config=installedMissionControlConfig(enrollment,ownerId,env,purpose);
  return {enrollment,config};
}
