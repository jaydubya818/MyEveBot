// Synthetic qualification records in the existing capability-control schema.
// This does not author production policy or bypass admission checks.
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {capabilityRegistry} from '@mission-control/capability-control';

export async function sessionCapabilityFixture(adminPool, url, ownerId, agentId) {
 const parsed=new URL(url);
 if(parsed.hostname!=='127.0.0.1'||!/^\/factory_beta_[a-f0-9]+$/.test(parsed.pathname))throw Error('DISPOSABLE_FACTORY_DATABASE_ONLY');
 for(const file of ['migration.sql','ordering.sql','lifecycle.sql','enforcement.sql'])
  await adminPool.query(await readFile(new URL('../../../docs/capability-control/'+file,import.meta.url),'utf8'));
 const role='session_runtime_'+randomBytes(6).toString('hex'),installation='synthetic-session-installation';
 await adminPool.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
 await adminPool.query(`GRANT USAGE ON SCHEMA public,capability_control TO ${role}`);
 await adminPool.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${role}`);
 await adminPool.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);
 await adminPool.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${role}`);
 await adminPool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA capability_control TO ${role}`);
 await adminPool.query(`GRANT EXECUTE ON FUNCTION capability_control.lock_admission_policy(text,text,text) TO ${role}`);
 const required=new Set();
 function include(id){if(required.has(id))return;required.add(id);for(const dep of capabilityRegistry.capabilities.find(c=>c.id===id).dependencies)include(dep);}
 for(const id of ['work','myfactory','development-tools','deepagents','sofie.local-harness'])include(id);
 const preferences=Object.fromEntries([...required].map(id=>[id,'ENABLED']));
 const facts=Object.fromEntries(capabilityRegistry.capabilities.filter(c=>required.has(c.id)).map(c=>[c.id,{
  supported:true,deployed:true,entitled:true,administrator:'ALLOW',lifecycle:'ACTIVE',
  setup:Object.fromEntries(c.setupRequirements.map(key=>[key,true])),
  qualification:Object.fromEntries(c.qualificationRequirements.map(key=>[key,'QUALIFIED'])),
 }]));
 facts.deepagents.selectedAlternative='sofie.local-harness';
 await adminPool.query("INSERT INTO capability_control.installations(id,organization_id,environment) VALUES($1,'synthetic-session-organization','qualification')",[installation]);
 await adminPool.query('INSERT INTO capability_control.owner_state(installation_id,owner_id,preferences) VALUES($1,$2,$3)',[installation,ownerId,preferences]);
 await adminPool.query(`INSERT INTO capability_control.evidence(installation_id,organization_id,owner_id,registry_version,facts,observed_at,expires_at,source_record_id)
  VALUES($1,'synthetic-session-organization',$2,$3,$4,clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 hour','synthetic-qualified-fixture')`,[installation,ownerId,capabilityRegistry.version,facts]);
 await adminPool.query(`INSERT INTO capability_control.relay_agent_evidence(installation_id,owner_id,organization_id,agent_id,revision,capability_ids,status,expires_at,source_record_id)
  VALUES($1,$2,'synthetic-session-organization',$3,1,$4,'ACTIVE',clock_timestamp()+interval '1 hour','synthetic-relay-fixture')`,[installation,ownerId,agentId,JSON.stringify([...required])]);
 parsed.username=role;
 const runtimeUrl=parsed.href,runtime=new Pool({connectionString:runtimeUrl,max:12});
 const query=async(sql,params)=>(await runtime.query(sql,params)).rows;
 const database={query,atomic:async action=>{
  const client=await runtime.connect();
  try{await client.query('BEGIN');const result=await action({query:async(sql,params)=>(await client.query(sql,params)).rows});await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }};
 Object.assign(process.env,{MYEVE_CAPABILITY_CONTROL_ENABLED:'true',MYEVE_CAPABILITY_INSTALLATION_ID:installation,
  MYEVE_CAPABILITY_ENVIRONMENT:'qualification',MYEVE_CAPABILITY_DATABASE_URL:runtimeUrl,
  MYEVE_CAPABILITY_ORIGIN:'http://127.0.0.1:3000',DATABASE_URL:runtimeUrl});
 return {database,url:runtimeUrl,close:()=>runtime.end()};
}
