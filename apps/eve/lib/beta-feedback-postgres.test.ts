import { afterEach,describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Env,connection } from './external-alpha/work-test-fixture.ts';
import { BetaFeedback } from './beta-feedback.ts';
import type { GoalPool } from './goal-work/database.ts';

describe.skipIf(!connection)('private beta feedback with ordinary PostgreSQL role',()=>{
  const environments:Env[]=[],roles:string[]=[];
  async function setup(){
    const e=await Env.create();environments.push(e);const role='feedback_'+e.name.slice(8);roles.push(role);
    await e.pool.query(`CREATE ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
    await e.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await e.pool.query(`GRANT SELECT,INSERT ON unified_beta_feedback TO ${role}`);
    await e.pool.query(`GRANT SELECT ON engineering_work,missioncontrol_work_bindings TO ${role}`);
    const pool:GoalPool={connect:async()=>{const client=await e.pool.connect();return {release:()=>client.release(),query:async(sql,values)=>{
      const result=await client.query(sql,values);if(sql==='BEGIN')await client.query('SET LOCAL ROLE '+role);return result;}};}};
    return {e,pool,role,service:new BetaFeedback(pool,e.owner),input:{id:randomUUID(),platform:'MyEve / Sofie' as const,
      title:'Work status did not refresh',details:'I opened Work again. The previous status stayed visible.',impact:'IMPAIRED' as const,workId:null as string|null}};
  }
  afterEach(async()=>{
    await Promise.all(environments.splice(0).map(e=>e.close()));
    const pool=new pg.Pool({connectionString:connection});
    try{for(const role of roles.splice(0))await pool.query('DROP ROLE '+role);}finally{await pool.end();}
  },60000);
  it('saves one immutable report across concurrent delivery and lost-response retry',async()=>{
    const {e,service,input}=await setup();
    const reports=await Promise.all(Array.from({length:8},()=>service.save(input)));
    expect(new Set(reports.map(report=>report.id)).size).toBe(1);
    expect(await e.count('unified_beta_feedback')).toBe(1);
    expect(await service.save(input)).toEqual(reports[0]);
    await expect(service.save({...input,details:'Changed request'})).rejects.toThrow('already saved with different details');
    expect((await service.list()).reports[0]).toMatchObject({status:'REPORTED',priority:'P2',details:input.details});
  });
  it('isolates owners through RLS, rejects foreign Work and binds only canonical local Work',async()=>{
    const {e,pool,service,input}=await setup();const work=await e.seedWork();
    await service.save({...input,workId:work.id});
    const foreign=new BetaFeedback(pool,'foreign-owner');expect((await foreign.list()).reports).toEqual([]);
    await expect(foreign.save({...input,id:randomUUID(),workId:work.id})).rejects.toThrow('Select Work from this workspace');
    const report=(await service.list()).reports[0];expect(report.workId).toBe(work.id);expect(report.missionId).toBeNull();
    const client=await pool.connect();
    try{await client.query('BEGIN');expect((await client.query('SELECT * FROM unified_beta_feedback')).rows).toHaveLength(0);
      await client.query('ROLLBACK');}finally{client.release();}
  });
  it('keeps triage operator-only and records exact-revision review history without rewriting the report',async()=>{
    const {e,pool,service,input}=await setup();await service.save(input);
    const app=await pool.connect();
    try{await app.query('BEGIN');await app.query("SELECT set_config('myeve.feedback_owner',$1,true)",[e.owner]);
      await expect(app.query("UPDATE unified_beta_feedback SET status='RESOLVED' WHERE id=$1",[input.id])).rejects.toThrow('permission denied');
      await app.query('ROLLBACK');}finally{app.release();}
    const operator=await e.pool.connect();
    try{await operator.query('BEGIN');await operator.query("SELECT set_config('myeve.feedback_owner',$1,true)",[e.owner]);
      expect((await operator.query("UPDATE unified_beta_feedback SET status='TRIAGED',triage_note='Reproduced; issue SF-1.' WHERE owner_id=$1 AND id=$2 AND revision=1",[e.owner,input.id])).rowCount).toBe(1);
      expect((await operator.query("UPDATE unified_beta_feedback SET status='RESOLVED',triage_note='Stale update' WHERE owner_id=$1 AND id=$2 AND revision=1",[e.owner,input.id])).rowCount).toBe(0);
      await operator.query('COMMIT');}finally{operator.release();}
    expect((await service.list()).reports[0]).toMatchObject({title:input.title,status:'TRIAGED',triageNote:'Reproduced; issue SF-1.'});
    expect(await e.count('unified_beta_feedback_triage')).toBe(1);
    await expect(e.pool.query("UPDATE unified_beta_feedback SET details='changed',triage_note='bad' WHERE id=$1",[input.id])).rejects.toThrow('FEEDBACK_REPORT_IMMUTABLE');
    await expect(e.pool.query('DELETE FROM unified_beta_feedback_triage')).rejects.toThrow('FEEDBACK_HISTORY_IMMUTABLE');
  });
  it('rejects forged initial triage under the ordinary application role and stamps server-owned chronology',async()=>{
    const {e,pool}=await setup(),app=await pool.connect();
    const insert=`INSERT INTO unified_beta_feedback(owner_id,id,input_digest,platform,title,details,impact,priority,status,triage_note,revision,created_at,updated_at)
      VALUES($1,$2,$3,'MyEve / Sofie','Synthetic report','Synthetic details','IMPAIRED',$4,$5,$6,$7,'2100-01-01','2100-01-02') RETURNING *`;
    try{
      for(const [priority,status,note,revision] of [['P2','RESOLVED','Forged resolution',1],['P2','TRIAGED','Forged triage',1],
        ['P2','REPORTED','Forged note',1],['P2','REPORTED',null,2],['P3','REPORTED',null,1]]){
        await app.query('BEGIN');await app.query("SELECT set_config('myeve.feedback_owner',$1,true)",[e.owner]);
        await expect(app.query(insert,[e.owner,randomUUID(),'a'.repeat(64),priority,status,note,revision])).rejects.toThrow('FEEDBACK_INITIAL_STATE_REQUIRED');
        await app.query('ROLLBACK');
      }
      expect(await e.count('unified_beta_feedback')).toBe(0);expect(await e.count('unified_beta_feedback_triage')).toBe(0);
      await app.query('BEGIN');await app.query("SELECT set_config('myeve.feedback_owner',$1,true)",[e.owner]);
      const report=(await app.query(insert,[e.owner,randomUUID(),'a'.repeat(64),'P2','REPORTED',null,1])).rows[0];
      expect(report.status).toBe('REPORTED');expect(report.revision).toBe(1);
      expect(new Date(report.created_at).getTime()).toBeLessThan(Date.now()+1000);
      expect(report.created_at).toEqual(report.updated_at);
      await app.query('COMMIT');
    }finally{app.release();}
  });
  it('paginates stable private history and rejects caller-assigned status or Mission',async()=>{
    const {service,input}=await setup();
    await expect(service.save({...input,status:'RESOLVED'})).rejects.toThrow();
    await expect(service.save({...input,missionId:'forged'})).rejects.toThrow();
    await Promise.all(Array.from({length:53},(_,i)=>service.save({...input,id:randomUUID(),title:'Report '+i})));
    const first=await service.list(),second=await service.list(first.next!);
    expect(first.reports).toHaveLength(50);expect(second.reports).toHaveLength(3);expect(second.next).toBeNull();
    expect(new Set([...first.reports,...second.reports].map(r=>r.id)).size).toBe(53);
  });
});
