import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GoalPool } from './goal-work/database.ts';
import { canonicalPermitJson } from './missioncontrol/execution-permit.ts';
import { WorkError } from './engineering/types.ts';

export const betaFeedbackInput = z.object({id:z.string().uuid(),platform:z.enum(['MyEve / Sofie','MyApps','Relay','MyFactory','MissionControl','Capability controls']),
  title:z.string().trim().min(1).max(160),details:z.string().trim().min(1).max(4000),
  impact:z.enum(['BLOCKED','IMPAIRED','MINOR']),workId:z.string().uuid().nullable()}).strict();
export type BetaFeedbackInput = z.infer<typeof betaFeedbackInput>;
export interface BetaFeedbackReport {id:string;platform:BetaFeedbackInput['platform'];title:string;details:string;impact:BetaFeedbackInput['impact'];
  priority:'P1'|'P2'|'P3';workId:string|null;missionId:string|null;status:'REPORTED'|'TRIAGED'|'RESOLVED';triageNote:string|null;createdAt:string}
function report(row:Record<string,any>):BetaFeedbackReport{return {id:row.id,platform:row.platform,title:row.title,details:row.details,
  impact:row.impact,priority:row.priority,workId:row.work_id,missionId:row.mission_id,status:row.status,triageNote:row.triage_note,
  createdAt:new Date(row.created_at).toISOString()};}

/** Private reporting only. No provider call, execution, learning or permission mutation. */
export class BetaFeedback {
  constructor(private readonly pool:GoalPool,private readonly ownerId:string) {
    if(!ownerId.trim()||ownerId.length>200)throw Error('FEEDBACK_OWNER_REQUIRED');
  }
  private async transaction<T>(body:(query:(sql:string,values?:unknown[])=>Promise<Record<string,any>[]>)=>Promise<T>) {
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT set_config('myeve.feedback_owner',$1,true),set_config('myeve.missioncontrol_owner',$1,true),set_config('lock_timeout','5s',true),set_config('statement_timeout','5s',true)",[this.ownerId]);
      const result=await body(async(sql,values)=>(await client.query(sql,values)).rows);
      await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
  async save(value:unknown) {
    const input=betaFeedbackInput.parse(value),fingerprint=createHash('sha256').update(canonicalPermitJson(input)).digest('hex');
    return this.transaction(async query=>{
      let work:Record<string,any>|undefined,mission:Record<string,any>|undefined;
      if(input.workId){
        [work]=await query("SELECT id,version,generation FROM engineering_work WHERE id=$1 AND scope_id=$2 AND scope_kind='personal'",[input.workId,this.ownerId]);
        if(!work)throw new WorkError('feedback_work_unavailable','Select Work from this workspace.',404);
        [mission]=await query('SELECT mission_id FROM missioncontrol_work_bindings WHERE owner_id=$1 AND work_id=$2 ORDER BY work_version DESC,work_generation DESC LIMIT 1',[this.ownerId,input.workId]);
      }
      await query(`INSERT INTO unified_beta_feedback(owner_id,id,input_digest,platform,title,details,impact,priority,work_id,work_version,work_generation,mission_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
        [this.ownerId,input.id,fingerprint,input.platform,input.title,input.details,input.impact,
          {BLOCKED:'P1',IMPAIRED:'P2',MINOR:'P3'}[input.impact],input.workId,work?.version??null,work?.generation??null,mission?.mission_id??null]);
      const [saved]=await query('SELECT * FROM unified_beta_feedback WHERE owner_id=$1 AND id=$2',[this.ownerId,input.id]);
      if(saved?.input_digest!==fingerprint)throw new WorkError('feedback_changed','This report was already saved with different details. Start a new report.',409);
      return report(saved);
    });
  }
  async list(before?:string) {
    if(before)z.string().uuid().parse(before);
    return this.transaction(async query=>{
      const rows=await query(`SELECT * FROM unified_beta_feedback f WHERE owner_id=$1
        AND ($2::uuid IS NULL OR (f.created_at,f.id)<(SELECT created_at,id FROM unified_beta_feedback WHERE owner_id=$1 AND id=$2))
        ORDER BY created_at DESC,id DESC LIMIT 51`,[this.ownerId,before??null]);
      return {reports:rows.slice(0,50).map(report),next:rows.length>50?String(rows[49].id):null};
    });
  }
}
