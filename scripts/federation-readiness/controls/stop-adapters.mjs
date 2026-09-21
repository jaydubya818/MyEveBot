/** These emergency SQL operations apply ONLY to the isolated synthetic Relay DB.
 * The operator supplies exact owner IDs; no wildcard or personal tenant lookup.
 * Evidence is exported by emergencyStop before its separate NOLOGIN brake. */
export function relayRevocationAdapters(pool,{database,ownerIds}) {
 if(!/^fq_relay_[a-f0-9]{12}$/.test(database)||ownerIds.length!==2||ownerIds.some(x=>!/^(?:fq[-_]|acct_)[A-Za-z0-9_-]+$/.test(x)))throw Error('SYNTHETIC_SCOPE_REQUIRED');
 async function run(update,verify){const db=await pool.connect();try{await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='1500ms'");const current=await db.query('SELECT current_database() AS name');if(current.rows[0].name!==database)throw Error();await db.query(update,[ownerIds]);const result=await db.query(verify,[ownerIds]);if(Number(result.rows[0].remaining)!==0)throw Error();await db.query('COMMIT');return true;}catch{await db.query('ROLLBACK').catch(()=>{});return false;}finally{db.release();}}
 return {
  revokeCredentials:()=>run('UPDATE agent_credentials SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE account_id=ANY($1::text[])','SELECT count(*) AS remaining FROM agent_credentials WHERE account_id=ANY($1::text[]) AND revoked_at IS NULL'),
  revokeGrants:()=>run("UPDATE federation_grants SET status='REVOKED',updated_at=clock_timestamp() WHERE account_id=ANY($1::text[]) OR grantee_account_id=ANY($1::text[])","SELECT count(*) AS remaining FROM federation_grants WHERE (account_id=ANY($1::text[]) OR grantee_account_id=ANY($1::text[])) AND status='ACTIVE'"),
  denyQueuedWork:()=>run("UPDATE federation_requests SET status='DENIED',inbox_status='REJECTED',encrypted_payload=NULL,encrypted_result=NULL,updated_at=clock_timestamp() WHERE (account_id=ANY($1::text[]) OR target_account_id=ANY($1::text[])) AND status IN ('CREATED','AUTHORIZED','DELIVERED','WAITING','ACCEPTED','RUNNING')","SELECT count(*) AS remaining FROM federation_requests WHERE (account_id=ANY($1::text[]) OR target_account_id=ANY($1::text[])) AND status IN ('CREATED','AUTHORIZED','DELIVERED','WAITING','ACCEPTED','RUNNING')"),
 };
}
