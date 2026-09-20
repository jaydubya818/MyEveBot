import { setTimeout as delay } from 'node:timers/promises';
import { assertQualificationConfiguration, qualificationRpc } from '../../lib/qualification/client.ts';
import { FederationStore } from '../../lib/relay/store.ts';
import { pollRelay } from '../../lib/relay/inbox.ts';

assertQualificationConfiguration();
if(process.env.MYEVE_RELAY_ENABLED!=='true'||!/^fq[-_]/.test(process.env.FQ_OWNER_ID??''))throw new Error('Synthetic opt-in required.');
const store=new FederationStore(process.env.FQ_OWNER_ID!);
const [privileges]=await store.database.query("SELECT has_table_privilege(current_user,'myeve_relay_artifacts','INSERT') AS insert_allowed, has_table_privilege(current_user,'myeve_relay_artifacts','UPDATE') AS update_allowed, has_table_privilege(current_user,'myeve_relay_artifacts','TRUNCATE') AS truncate_allowed");
if(!privileges||Object.values(privileges).some(value=>value!==false))throw new Error('Artifact writer credential forbidden in worker.');
const shutdown=new AbortController();
process.once('SIGTERM',()=>shutdown.abort());
process.once('SIGINT',()=>shutdown.abort());
try {
 while(!shutdown.signal.aborted){
  await qualificationRpc('active',{},shutdown.signal);
  await pollRelay(store);
  await delay(5000,undefined,{signal:shutdown.signal});
 }
}catch(error){if(!shutdown.signal.aborted)throw error;}
