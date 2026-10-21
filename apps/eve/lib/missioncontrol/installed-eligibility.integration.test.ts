import {it,expect} from 'vitest';
import {Env,connection} from '../external-alpha/work-test-fixture.ts';
import {permitFixture} from './permit-test-fixture.ts';
import {installedMissionControlEligibility} from './installed-eligibility.ts';
it.skipIf(!connection)('reads installed eligibility from full-schema PostgreSQL under a restricted role without treating expiry as cleanup authority loss',async()=>{
 const f=await Env.create(false),role='eligibility_'+f.name.slice(8),client=await f.pool.connect();
 try{
  await f.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await f.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await f.pool.query(`GRANT EXECUTE ON FUNCTION missioncontrol_enrollment_document(text) TO ${role}`);
  const {enrollment}=permitFixture({ownerId:f.owner,workId:'fixture',workVersion:1,workGeneration:1,tupleSha256:'a'.repeat(64),maxCostMicrousd:1300000,maxDurationSeconds:180});
  const env:NodeJS.ProcessEnv={NODE_ENV:'test',MYEVE_OWNER_ID:f.owner,MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',MYEVE_MISSIONCONTROL_INSTALLATION_ID:enrollment.installationId,
   MYEVE_MISSIONCONTROL_CONNECTION_ID:enrollment.connectionId,MYEVE_MISSIONCONTROL_URL:enrollment.issuer,MYEVE_MISSIONCONTROL_AUDIENCE:enrollment.audience,MYEVE_MISSIONCONTROL_SECRET:'s'.repeat(32)};
  await client.query('SET ROLE '+role);
  const database={query:async(sql:string,values?:unknown[])=>(await client.query(sql,values)).rows};
  expect(await installedMissionControlEligibility(f.owner,env,'admission',database)).toBeNull();
  await f.pool.query('INSERT INTO missioncontrol_owner_enrollments(owner_id,installation_id,revision,document) VALUES($1,$2,$3,$4)',[f.owner,enrollment.installationId,1,enrollment]);
  expect((await installedMissionControlEligibility(f.owner,env,'admission',database))?.enrollment.ownerId).toBe(f.owner);
  await expect(installedMissionControlEligibility('foreign',env,'admission',database)).rejects.toThrow();
  const revoked={...enrollment,revision:2,expiresAt:Date.now()-1,revokedAt:Date.now()};
  await f.pool.query('UPDATE missioncontrol_owner_enrollments SET revision=2,document=$2 WHERE owner_id=$1',[f.owner,revoked]);
  await expect(installedMissionControlEligibility(f.owner,env,'admission',database)).rejects.toThrow();
  expect((await installedMissionControlEligibility(f.owner,env,'control',database))?.config.purpose).toBe('control');
 }finally{
  await client.query('RESET ROLE');client.release();await f.close();
  const pg=await import('pg'),admin=new pg.default.Pool({connectionString:connection});
  try{await admin.query(`DROP ROLE IF EXISTS ${role}`);}finally{await admin.end();}
 }
});
