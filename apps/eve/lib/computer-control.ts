import type {ExecutionDatabase} from "./execution-types.ts";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";
import type { ComputerController, ComputerControlView } from "./computer-types.ts";
import { redactEvidenceText } from "./task-types.ts";

type Row=Record<string,unknown>;
export const OWNER_LEASE_SECONDS=30;
export const CONTROL_TRANSITIONS:Readonly<Record<ComputerController,readonly ComputerController[]>>={AGENT:["OWNER","PAUSED","NONE"],OWNER:["AGENT","PAUSED","NONE"],PAUSED:["AGENT","OWNER","NONE"],NONE:[]};
export const CONTROL_EVENT_TYPES={takeOver:"control.owner_acquired",requestOwnerTakeover:"control.agent_paused",pause:"control.agent_paused",resumeAgent:"control.agent_resumed",returnControl:"control.owner_released",stop:"control.session_stopped"} as const;
export function canTransitionControl(from:ComputerController,to:ComputerController):boolean{return CONTROL_TRANSITIONS[from].includes(to);}
export function safeStateFingerprint(value:{computerSessionId?:string;browserSessionId?:string|null;providerSessionId?:string|null;currentUrl:string|null;browserStatus:string|null;sessionStatus:string}):string{return createHash("sha256").update(JSON.stringify({computerSessionId:value.computerSessionId??null,browserSessionId:value.browserSessionId??null,providerSessionId:value.providerSessionId??null,currentUrl:value.currentUrl})).digest("hex");}

export class ControlConflictError extends Error { constructor(message="Control state changed before this operation completed."){super(message);this.name="ControlConflictError";} }

export async function expireOwnerControlLeases(ownerId?:string):Promise<number>{
  const rows=await db().query(`WITH expired AS (
    UPDATE computer_control_leases l SET controller='PAUSED',version=version+1,claimed_by=NULL,claimed_at=NULL,heartbeat_at=NULL,expires_at=NULL,owner_input_enabled=false,transition_reason='Owner control lease expired',updated_at=now()
    WHERE l.controller='OWNER' AND l.expires_at<=now() AND ($1::text IS NULL OR l.owner_id=$1)
    RETURNING l.*
  ), receipts AS (
    INSERT INTO computer_control_receipts (id,computer_session_id,owner_id,agent_id,run_id,event_type,previous_controller,new_controller,control_version,requested_by,reason)
    SELECT 'control_expired_'||md5(computer_session_id||':'||version::text),computer_session_id,owner_id,agent_id,run_id,'control.lease_expired','OWNER','PAUSED',version,'system','Owner heartbeat expired' FROM expired
  ) SELECT count(*)::int AS count FROM expired`,[ownerId??null]) as Row[];
  return Number(rows[0]?.count??0);
}

export async function transitionComputerControl(input:{ownerId:string;sessionId:string;expectedController:ComputerController;expectedVersion:number;operation:"takeOver"|"requestOwnerTakeover"|"pause"|"resumeAgent"|"returnControl"|"stop";requestedBy:string;reason?:string;stateFingerprint?:string;checkpoint?:Record<string,unknown>},database:ExecutionDatabase=db() as ExecutionDatabase):Promise<{controller:ComputerController;version:number}>{
  const target:ComputerController=input.operation==="takeOver"?"OWNER":input.operation==="pause"||input.operation==="requestOwnerTakeover"?"PAUSED":input.operation==="stop"?"NONE":"AGENT";
  if(!canTransitionControl(input.expectedController,target))throw new ControlConflictError(`Cannot transition control from ${input.expectedController} to ${target}.`);
  const safeReason=redactEvidenceText(input.reason??input.operation).slice(0,500);const id=`control_${randomUUID()}`;
  const rows=await database.query(`WITH changed AS (
    UPDATE computer_control_leases l SET controller=$6,version=l.version+1,
      claimed_by=CASE WHEN $6='OWNER' THEN $7 ELSE NULL END,
      claimed_at=CASE WHEN $6='OWNER' THEN now() ELSE NULL END,
      heartbeat_at=CASE WHEN $6='OWNER' THEN now() ELSE NULL END,
      expires_at=CASE WHEN $6='OWNER' THEN now()+($8*interval '1 second') ELSE NULL END,
      owner_input_enabled=false,transition_reason=$9,state_fingerprint=coalesce($10,state_fingerprint),checkpoint=coalesce($11::jsonb,checkpoint),updated_at=now()
    FROM computer_sessions s
    WHERE l.computer_session_id=$2 AND l.owner_id=$1 AND l.controller=$3 AND l.version=$4
      AND s.id=l.computer_session_id AND s.owner_id=l.owner_id
      AND s.status IN ('provisioning','ready','running','paused') AND s.expires_at>now()
      AND ($6 NOT IN ('OWNER','PAUSED','NONE') OR NOT EXISTS (SELECT 1 FROM computer_actions a WHERE a.computer_session_id=l.computer_session_id AND a.status='running'))
      AND ($6 NOT IN ('AGENT','PAUSED','NONE') OR l.owner_input_in_flight=0)
      AND ($6<>'OWNER' OR l.owner_input_in_flight=0)
      AND l.gateway_actions_in_flight=0
    RETURNING l.*
  ), receipt AS (
    INSERT INTO computer_control_receipts (id,computer_session_id,owner_id,agent_id,run_id,event_type,previous_controller,new_controller,control_version,requested_by,reason,metadata)
    SELECT $5,computer_session_id,owner_id,agent_id,run_id,$12,$3,$6,version,$7,$9,'{}'::jsonb FROM changed
  ), event AS (
    INSERT INTO eve_events (id,owner_id,type,source_type,source_id,run_id,summary,payload)
    SELECT $13,owner_id,$12,'computer_control',computer_session_id,run_id,$9,jsonb_build_object('agentId',agent_id,'previousController',$3,'newController',$6,'controlVersion',version) FROM changed
  ) SELECT controller,version FROM changed`,[input.ownerId,input.sessionId,input.expectedController,input.expectedVersion,id,target,input.requestedBy,OWNER_LEASE_SECONDS,safeReason,input.stateFingerprint??null,input.checkpoint?JSON.stringify(input.checkpoint):null,CONTROL_EVENT_TYPES[input.operation],`event_${randomUUID()}`]) as Row[];
  if(!rows[0])throw new ControlConflictError();
  return {controller:String(rows[0].controller) as ComputerController,version:Number(rows[0].version)};
}

export async function heartbeatOwnerControl(input:{ownerId:string;sessionId:string;version:number;requestedBy:string}):Promise<{version:number;expiresAt:string}>{
  const rows=await db().query(`UPDATE computer_control_leases SET heartbeat_at=now(),expires_at=now()+($5*interval '1 second'),updated_at=now() WHERE owner_id=$1 AND computer_session_id=$2 AND controller='OWNER' AND version=$3 AND claimed_by=$4 AND expires_at>now() RETURNING version,expires_at`,[input.ownerId,input.sessionId,input.version,input.requestedBy,OWNER_LEASE_SECONDS]) as Row[];
  if(!rows[0])throw new ControlConflictError("Owner control lease expired or changed.");return {version:Number(rows[0].version),expiresAt:new Date(rows[0].expires_at as string).toISOString()};
}

export async function enableOwnerInput(input:{ownerId:string;sessionId:string;version:number;requestedBy:string}):Promise<void>{
  const rows=await db().query(`UPDATE computer_control_leases SET owner_input_enabled=true,updated_at=now() WHERE owner_id=$1 AND computer_session_id=$2 AND controller='OWNER' AND version=$3 AND claimed_by=$4 AND expires_at>now() AND owner_input_in_flight=0 RETURNING version`,[input.ownerId,input.sessionId,input.version,input.requestedBy]) as Row[];
  if(!rows[0])throw new ControlConflictError("Owner input could not be enabled because control changed.");
}

export async function disableOwnerInput(input:{ownerId:string;sessionId:string;version:number;requestedBy:string}):Promise<void>{
  const rows=await db().query(`UPDATE computer_control_leases SET owner_input_enabled=false,updated_at=now() WHERE owner_id=$1 AND computer_session_id=$2 AND controller='OWNER' AND version=$3 AND claimed_by=$4 AND expires_at>now() AND owner_input_in_flight=0 RETURNING version`,[input.ownerId,input.sessionId,input.version,input.requestedBy]) as Row[];
  if(!rows[0])throw new ControlConflictError("Owner input is busy, expired, or control changed.");
}

export async function beginOwnerInput(input:{ownerId:string;sessionId:string;browserSessionId:string;runId:string;version:number;requestedBy:string}):Promise<void>{
  const rows=await db().query(`UPDATE computer_control_leases l SET owner_input_in_flight=owner_input_in_flight+1,updated_at=now()
    FROM computer_sessions s JOIN browser_sessions b ON b.computer_session_id=s.id
    WHERE l.owner_id=$1 AND l.computer_session_id=$2 AND l.controller='OWNER' AND l.version=$5 AND l.claimed_by=$6
      AND l.owner_input_enabled AND l.expires_at>now() AND s.id=l.computer_session_id AND s.owner_id=l.owner_id
      AND s.run_id=$4 AND b.id=$3 AND s.status IN ('ready','running','paused') AND s.expires_at>now()
    RETURNING l.version`,[input.ownerId,input.sessionId,input.browserSessionId,input.runId,input.version,input.requestedBy]) as Row[];
  if(!rows[0])throw new ControlConflictError("Owner input rejected because the session binding or control lease changed.");
}

export async function finishOwnerInput(input:{ownerId:string;sessionId:string;version:number}):Promise<void>{
  await db().query(`UPDATE computer_control_leases SET owner_input_in_flight=greatest(0,owner_input_in_flight-1),updated_at=now() WHERE owner_id=$1 AND computer_session_id=$2 AND owner_input_in_flight>0`,[input.ownerId,input.sessionId]);
}

export function controlView(row:Row,provider:string,capabilities:ComputerControlView["capabilities"]):ComputerControlView{return {controller:String(row.control_controller??row.controller) as ComputerController,version:Number(row.control_version??row.version),provider,claimedAt:row.control_claimed_at==null?null:new Date(row.control_claimed_at as string).toISOString(),heartbeatAt:row.control_heartbeat_at==null?null:new Date(row.control_heartbeat_at as string).toISOString(),expiresAt:row.control_expires_at==null?null:new Date(row.control_expires_at as string).toISOString(),transitionReason:row.control_transition_reason==null?null:String(row.control_transition_reason),viewFreshAt:new Date(row.last_activity_at as string).toISOString(),capabilities,ownerInputEnabled:Boolean(row.control_owner_input_enabled??row.owner_input_enabled)};}
