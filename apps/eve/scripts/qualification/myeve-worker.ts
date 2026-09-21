import { setTimeout as delay } from 'node:timers/promises';
import { assertQualificationConfiguration, qualificationRpc } from '../../lib/qualification/client.ts';
import { FederationStore } from '../../lib/relay/store.ts';
import { ownerCommand } from '../../lib/relay/owner-api.ts';
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
  const {job}=await qualificationRpc('job-take',{},shutdown.signal);
  if(job){
   try{
    const command=job.command.operation==='connect'?{...job.command,input:{...job.command.input,email:process.env.FQ_RELAY_OWNER_EMAIL,password:process.env.FQ_RELAY_OWNER_PASSWORD}}:job.command;
    const result=await ownerCommand(store,command);
    await qualificationRpc('job-complete',{id:job.id,state:'COMPLETED',result},shutdown.signal);
   }catch{
    await qualificationRpc('job-complete',{id:job.id,state:'FAILED',result:{error:'QUALIFICATION_COMMAND_DENIED'}},shutdown.signal);
   }
  }
  const connected=await store.database.query("SELECT 1 FROM myeve_relay_connections WHERE owner_id=$1 AND status='active'",[store.ownerId]);
  if(connected.length)await pollRelay(store);
  await delay(5000,undefined,{signal:shutdown.signal});
 }
}catch(error){if(!shutdown.signal.aborted)throw error;}
