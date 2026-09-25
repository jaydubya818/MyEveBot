import {createHash} from 'node:crypto';
export const evidenceDdl=`CREATE TABLE fq_control.evidence(session_id text PRIMARY KEY REFERENCES fq_control.sessions(id),record jsonb NOT NULL,sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()); REVOKE ALL ON fq_control.evidence FROM PUBLIC;`;
/** Operator-only connection. No payloads, credentials or provider assertions are
 * recorded. This row survives app-role NOLOGIN and worker deployment teardown. */
export function evidenceAdapter(pool,authority){return async(signal,stopOutcomes={})=>{
 signal.throwIfAborted();const state=await authority.status();
 const record={session:authority.id,stopped:state.stopped,start:state.start,http:state.http,submissions:state.submissions,charged:state.charged,components:state.components,artifacts:state.artifacts,artifactBytes:state.artifactBytes,workers:state.workers??{},events:state.events,stopOutcomes};
 const serialized=JSON.stringify(record),digest=createHash('sha256').update(serialized).digest('hex');
 signal.throwIfAborted();
 await pool.query('INSERT INTO fq_control.evidence(session_id,record,sha256) VALUES($1,$2::jsonb,$3) ON CONFLICT(session_id) DO NOTHING',[authority.id,serialized,digest]);
 const {rows}=await pool.query('SELECT sha256 FROM fq_control.evidence WHERE session_id=$1',[authority.id]);
 return rows.length===1&&rows[0].sha256===digest;
};}
