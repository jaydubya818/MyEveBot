import { qualificationEnabled, qualificationFetch } from './client.ts';
import type { FederationStore } from '../relay/store.ts';
export const artifactInsertSql = "INSERT INTO myeve_relay_artifacts(id,owner_id,request_id,content_encrypted,metadata,audience,audience_public_key,expires_at) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8)";
export async function insertFederationArtifact(store: FederationStore, values: unknown[]) {
  if(!qualificationEnabled())return store.database.query(artifactInsertSql,values);
  if(values[1]!==store.ownerId||store.ownerId!==process.env.FQ_OWNER_ID)throw new Error('Qualification owner denied.');
  const response=await qualificationFetch(new URL('/api/relay/qualification-artifacts',process.env.MYEVE_RELAY_ARTIFACT_ORIGIN),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'insert',values})},'artifact-store');
  if(!response.ok)throw new Error('Qualification artifact storage denied.');
}
export async function updateFederationArtifactAudience(store: FederationStore,id:string,audience:string,key:string){
 if(!qualificationEnabled())return store.database.query('UPDATE myeve_relay_artifacts SET audience=$3,audience_public_key=$4 WHERE owner_id=$1 AND id=$2',[store.ownerId,id,audience,key]);
 const response=await qualificationFetch(new URL('/api/relay/qualification-artifacts',process.env.MYEVE_RELAY_ARTIFACT_ORIGIN),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'audience',ownerId:store.ownerId,id,audience,key})},'artifact-store');
 if(!response.ok)throw new Error('Qualification artifact publication denied.');
}

export async function revokeFederationArtifact(store: FederationStore,id:string){
 if(!qualificationEnabled())return store.database.query('UPDATE myeve_relay_artifacts SET revoked=true WHERE owner_id=$1 AND id=$2',[store.ownerId,id]);
 const response=await qualificationFetch(new URL('/api/relay/qualification-artifacts',process.env.MYEVE_RELAY_ARTIFACT_ORIGIN),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'revoke',ownerId:store.ownerId,id})},'artifact-store');
 if(!response.ok)throw new Error('Qualification artifact revocation denied.');
}
