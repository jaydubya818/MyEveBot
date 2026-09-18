import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import { effectiveCapability, getAgent, type AgentView } from "./agents.ts";
import {
  canTransitionComputerSession,
  clampComputerLimits,
  normalizeAllowedDomains,
  type ComputerActionStatus,
  type ComputerActionType,
  type ComputerActionView,
  type ComputerArtifactView,
  type ComputerResourceLimits,
  type ComputerSessionStatus,
  type ComputerSessionView,
} from "./computer-types.ts";
import { redactEvidenceText } from "./task-types.ts";
import { beginOwnerInput, controlView, disableOwnerInput, enableOwnerInput, expireOwnerControlLeases, finishOwnerInput, heartbeatOwnerControl, safeStateFingerprint, transitionComputerControl } from "./computer-control.ts";
import { LiveSessionLostError, liveSessionCapabilitiesFor, liveSessionProviderFor, type LiveViewFrame, type OwnerInput } from "./live-session-provider.ts";

type Row = Record<string, unknown>;

const ACTIVE_STATUSES = ["provisioning", "ready", "running", "paused"] as const;
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function nullableText(value: unknown): string | null { return value == null ? null : text(value); }
function iso(value: unknown): string { return value instanceof Date ? value.toISOString() : text(value); }
function nullableIso(value: unknown): string | null { return value == null ? null : iso(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function resourceLimits(value: unknown): ComputerResourceLimits {
  const raw = record(value);
  return {
    maxRuntimeSeconds: number(raw.maxRuntimeSeconds),
    maxBrowserActions: number(raw.maxBrowserActions),
    maxFileBytes: number(raw.maxFileBytes),
    terminalTimeoutSeconds: number(raw.terminalTimeoutSeconds),
  };
}

function artifactView(row: Row): ComputerArtifactView {
  return {
    id: text(row.id),
    actionId: nullableText(row.action_id),
    runId: nullableText(row.run_id),
    kind: text(row.kind) as ComputerArtifactView["kind"],
    filename: text(row.filename),
    contentType: text(row.content_type),
    sizeBytes: number(row.size_bytes),
    sha256: text(row.sha256),
    createdAt: iso(row.created_at),
  };
}

function actionView(row: Row): ComputerActionView {
  return {
    id: text(row.id),
    runId: nullableText(row.run_id),
    agentId: text(row.agent_id),
    type: text(row.type) as ComputerActionType,
    target: nullableText(row.target),
    inputSummary: text(row.input_summary),
    outputSummary: nullableText(row.output_summary),
    status: text(row.status) as ComputerActionStatus,
    startedAt: iso(row.started_at),
    completedAt: nullableIso(row.completed_at),
    evidenceRefs: stringArray(row.evidence_refs),
    failureCode: nullableText(row.failure_code),
    failureSummary: nullableText(row.failure_summary),
    controlVersion: number(row.control_version),
  };
}

async function sessionView(row: Row): Promise<ComputerSessionView> {
  const [browserRows, artifactRows] = await Promise.all([
    db().query(`SELECT * FROM browser_sessions WHERE computer_session_id=$1 LIMIT 1`, [row.id]) as Promise<Row[]>,
    db().query(`SELECT * FROM computer_artifacts WHERE computer_session_id=$1 ORDER BY created_at,id`, [row.id]) as Promise<Row[]>,
  ]);
  const browser = browserRows[0];
  const environmentType = text(row.environment_type) as ComputerSessionView["environmentType"];
  const liveProvider = liveSessionProviderFor(environmentType);
  const view: ComputerSessionView = {
    id: text(row.id), ownerId: text(row.owner_id), agentId: text(row.agent_id), agentName: text(row.agent_name),
    goalId: nullableText(row.goal_id), goalTitle: nullableText(row.goal_title),
    taskId: nullableText(row.goal_task_id), taskTitle: nullableText(row.task_title),
    runId: nullableText(row.run_id), runTitle: nullableText(row.run_title),
    runtimeSessionId: text(row.runtime_session_id), sandboxId: nullableText(row.sandbox_id),
    status: text(row.status) as ComputerSessionStatus,
    environmentType,
    startedAt: iso(row.started_at), lastActivityAt: iso(row.last_activity_at),
    completedAt: nullableIso(row.completed_at), expiresAt: iso(row.expires_at),
    resourceLimits: resourceLimits(row.resource_limits), networkPolicy: record(row.network_policy),
    failureCode: nullableText(row.failure_code), failureSummary: nullableText(row.failure_summary),
    browser: browser ? {
      id: text(browser.id), status: text(browser.status) as NonNullable<ComputerSessionView["browser"]>["status"],
      currentUrl: nullableText(browser.current_url), startedAt: iso(browser.started_at),
      lastActivityAt: iso(browser.last_activity_at), completedAt: nullableIso(browser.completed_at),
    } : null,
    actionCount: number(row.action_count), artifacts: artifactRows.map(artifactView),
    control: null as never,
  };
  view.control = controlView(row, liveProvider.id, liveSessionCapabilitiesFor(view));
  return view;
}

const SESSION_SELECT = `
  SELECT s.*, a.name AS agent_name, g.title AS goal_title, t.title AS task_title, r.title AS run_title,
         l.controller AS control_controller,l.version AS control_version,l.claimed_at AS control_claimed_at,
         l.heartbeat_at AS control_heartbeat_at,l.expires_at AS control_expires_at,l.transition_reason AS control_transition_reason,
         l.owner_input_enabled AS control_owner_input_enabled,
         (SELECT count(*)::int FROM computer_actions ca WHERE ca.computer_session_id=s.id) AS action_count
  FROM computer_sessions s
  JOIN agents a ON a.owner_id=s.owner_id AND a.id=s.agent_id
  LEFT JOIN goals g ON g.id=s.goal_id
  LEFT JOIN goal_tasks t ON t.id=s.goal_task_id
  LEFT JOIN task_runs r ON r.owner_id=s.owner_id AND r.id=s.run_id
  JOIN computer_control_leases l ON l.computer_session_id=s.id AND l.owner_id=s.owner_id
`;

export async function expireComputerSessions(now = new Date()): Promise<number> {
  const rows = await db().query(
    `UPDATE computer_sessions SET status='expired', completed_at=$1, last_activity_at=$1,
       failure_code=NULL, failure_summary=NULL
     WHERE expires_at <= $1 AND status = ANY($2::text[]) RETURNING id,owner_id,agent_id,goal_id,goal_task_id,run_id`,
    [now.toISOString(), [...ACTIVE_STATUSES]],
  ) as Row[];
  for (const row of rows) {
    await db().transaction((tx) => [
      tx`WITH previous AS (SELECT * FROM computer_control_leases WHERE computer_session_id=${row.id} AND controller<>'NONE'), changed AS (UPDATE computer_control_leases SET controller='NONE',version=version+1,claimed_by=NULL,claimed_at=NULL,heartbeat_at=NULL,expires_at=NULL,owner_input_enabled=false,transition_reason='Computer session expired',updated_at=now() WHERE computer_session_id=${row.id} AND controller<>'NONE' RETURNING *) INSERT INTO computer_control_receipts (id,computer_session_id,owner_id,agent_id,run_id,event_type,previous_controller,new_controller,control_version,requested_by,reason) SELECT ${`control_${randomUUID()}`},c.computer_session_id,c.owner_id,c.agent_id,c.run_id,'control.session_expired',p.controller,'NONE',c.version,'system','Computer session expired' FROM changed c JOIN previous p USING (computer_session_id)`,
      tx`UPDATE browser_sessions SET status='expired',completed_at=${now.toISOString()},last_activity_at=${now.toISOString()} WHERE computer_session_id=${row.id}`,
      tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
         VALUES (${`event_${randomUUID()}`},${row.owner_id},'COMPUTER_SESSION_EXPIRED','computer_session',${row.id},${row.goal_id},${row.goal_task_id},${row.run_id},'Computer session expired',${JSON.stringify({ agentId: row.agent_id })}::jsonb)`,
    ]);
  }
  return rows.length;
}

async function validateLinks(input: {
  ownerId: string; agentId: string; goalId?: string; taskId?: string; runId?: string;
}): Promise<AgentView> {
  const agent = await getAgent(input.ownerId, input.agentId);
  if (!agent) throw new Error("Agent not found.");
  if (agent.status !== "active") throw new Error(`${agent.name} is ${agent.status} and cannot create a computer session.`);
  if (input.taskId && !input.goalId) throw new Error("A goal is required when linking a task.");
  if (input.goalId) {
    const rows = await db().query(
      `SELECT g.id,t.id AS task_id FROM goals g
       LEFT JOIN goal_tasks t ON t.goal_id=g.id AND t.id=$3
       WHERE g.owner_id=$1 AND g.id=$2 LIMIT 1`,
      [input.ownerId, input.goalId, input.taskId ?? null],
    ) as Row[];
    if (!rows[0]) throw new Error("Linked goal not found.");
    if (input.taskId && rows[0].task_id == null) throw new Error("Linked task does not belong to this goal.");
  }
  if (input.runId) {
    const rows = await db().query(
      `SELECT id,agent_id,goal_id,goal_task_id FROM task_runs WHERE owner_id=$1 AND id=$2 LIMIT 1`,
      [input.ownerId, input.runId],
    ) as Row[];
    const run = rows[0];
    if (!run) throw new Error("Linked run not found.");
    if (run.agent_id != null && text(run.agent_id) !== input.agentId) throw new Error("Linked run belongs to another Agent.");
    if (input.goalId && nullableText(run.goal_id) !== input.goalId) throw new Error("Linked run belongs to another goal.");
    if (input.taskId && nullableText(run.goal_task_id) !== input.taskId) throw new Error("Linked run belongs to another task.");
  }
  return agent;
}

export async function createComputerSession(input: {
  ownerId: string;
  agentId: string;
  runtimeSessionId: string;
  goalId?: string;
  taskId?: string;
  runId?: string;
  limits?: Partial<ComputerResourceLimits>;
  allowedDomains?: string[];
}): Promise<ComputerSessionView> {
  await expireComputerSessions();
  const active = await getComputerSessionForRuntime(input.ownerId, input.runtimeSessionId);
  if (active && ACTIVE_STATUSES.includes(active.status as (typeof ACTIVE_STATUSES)[number])) {
    if (active.agentId !== input.agentId) throw new Error("This runtime session is already assigned to another Agent.");
    return active;
  }
  const agent = await validateLinks(input);
  const capability = effectiveCapability(agent, "computer.session.create");
  if (!capability.allowed) throw new Error(capability.reason ?? "Computer session creation is not allowed.");
  const limits = clampComputerLimits({ maxRuntimeSeconds: agent.limits.maxRuntimeSeconds }, input.limits);
  const allowedDomains = normalizeAllowedDomains(input.allowedDomains);
  const networkPolicy = {
    mode: "domain-allowlist",
    allowedDomains,
    defaultEgress: "denied",
    privateIpv4Networks: "denied",
    credentials: "not-persisted",
  };
  const id = `computer_${randomUUID()}`;
  const browserId = `browser_${randomUUID()}`;
  const environmentType = process.env.VERCEL ? "vercel-sandbox" : "eve-sandbox";
  const expiresAt = new Date(Date.now() + limits.maxRuntimeSeconds * 1000).toISOString();
  await db().transaction((tx) => [
    tx`INSERT INTO computer_sessions (id,owner_id,agent_id,goal_id,goal_task_id,run_id,runtime_session_id,status,environment_type,expires_at,resource_limits,network_policy)
       VALUES (${id},${input.ownerId},${input.agentId},${input.goalId ?? null},${input.taskId ?? null},${input.runId ?? null},${input.runtimeSessionId},'provisioning',${environmentType},${expiresAt},${JSON.stringify(limits)}::jsonb,${JSON.stringify(networkPolicy)}::jsonb)`,
    tx`INSERT INTO browser_sessions (id,computer_session_id,status) VALUES (${browserId},${id},'ready')`,
    tx`INSERT INTO computer_control_leases (computer_session_id,owner_id,agent_id,run_id,controller,transition_reason)
       VALUES (${id},${input.ownerId},${input.agentId},${input.runId ?? null},'AGENT','Computer session created')`,
    tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
         VALUES (${`event_${randomUUID()}`},${input.ownerId},'COMPUTER_SESSION_STARTED','computer_session',${id},${input.goalId ?? null},${input.taskId ?? null},${input.runId ?? null},'Computer session started',${JSON.stringify({ agentId: input.agentId, environmentType, limits, allowedDomains })}::jsonb)`,
  ]);
  return (await getComputerSession(input.ownerId, id))!;
}

export async function getComputerSession(ownerId: string, id: string): Promise<ComputerSessionView | null> {
  await expireComputerSessions();
  await expireOwnerControlLeases(ownerId);
  const rows = await db().query(`${SESSION_SELECT} WHERE s.owner_id=$1 AND s.id=$2 LIMIT 1`, [ownerId, id]) as Row[];
  return rows[0] ? sessionView(rows[0]) : null;
}

export async function getComputerSessionForRuntime(ownerId: string, runtimeSessionId: string): Promise<ComputerSessionView | null> {
  await expireComputerSessions();
  await expireOwnerControlLeases(ownerId);
  const rows = await db().query(
    `${SESSION_SELECT} WHERE s.owner_id=$1 AND s.runtime_session_id=$2 ORDER BY s.started_at DESC LIMIT 1`,
    [ownerId, runtimeSessionId],
  ) as Row[];
  return rows[0] ? sessionView(rows[0]) : null;
}

export async function updateComputerSessionAllowedDomains(input: {
  ownerId: string;
  id: string;
  allowedDomains: readonly string[];
}): Promise<ComputerSessionView> {
  const current = await getComputerSession(input.ownerId, input.id);
  if (!current) throw new Error("Computer session not found.");
  if (!["provisioning", "ready", "running"].includes(current.status)) {
    throw new Error(`Computer network policy cannot change while the session is ${current.status}.`);
  }
  const existing = Array.isArray(current.networkPolicy.allowedDomains)
    ? current.networkPolicy.allowedDomains.filter((value): value is string => typeof value === "string")
    : [];
  const allowedDomains = normalizeAllowedDomains([...existing, ...input.allowedDomains]);
  const networkPolicy = { ...current.networkPolicy, allowedDomains };
  if (JSON.stringify(existing) === JSON.stringify(allowedDomains)) return current;
  await db().transaction((tx) => [
    tx`UPDATE computer_sessions SET network_policy=${JSON.stringify(networkPolicy)}::jsonb,last_activity_at=now()
       WHERE owner_id=${input.ownerId} AND id=${input.id}`,
    tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
       VALUES (${`event_${randomUUID()}`},${current.ownerId},'COMPUTER_NETWORK_POLICY_UPDATED','computer_session',${current.id},${current.goalId},${current.taskId},${current.runId},'Computer network allowlist updated',${JSON.stringify({ agentId: current.agentId, allowedDomains })}::jsonb)`,
  ]);
  return (await getComputerSession(input.ownerId, input.id))!;
}

export async function activeComputerAgentId(ownerId: string, runtimeSessionId: string): Promise<string | null> {
  const rows = await db().query(
    `SELECT agent_id FROM computer_sessions
     WHERE owner_id=$1 AND runtime_session_id=$2
       AND status IN ('ready','running') AND expires_at > now()
     ORDER BY started_at DESC LIMIT 1`,
    [ownerId, runtimeSessionId],
  ) as Row[];
  return rows[0] ? text(rows[0].agent_id) : null;
}

export async function pauseComputerSession(ownerId: string, id: string): Promise<ComputerSessionView> {
  const session = await getComputerSession(ownerId, id);
  if (!session) throw new Error("Computer session not found.");
  if (session.status === "provisioning") throw new Error("Computer session is still provisioning and cannot be paused yet.");
  if (session.control.controller === "PAUSED" && session.status === "paused") return session;
  await transitionComputerControl({ownerId,sessionId:id,expectedController:session.control.controller,expectedVersion:session.control.version,operation:"pause",requestedBy:ownerId,reason:"Paused by owner"});
  if (session.status === "paused") return (await getComputerSession(ownerId,id))!;
  return transitionComputerSession({ ownerId, id, to: "paused" });
}

export async function resumeComputerSession(ownerId: string, id: string): Promise<ComputerSessionView> {
  const session = await getComputerSession(ownerId, id);
  if (!session) throw new Error("Computer session not found.");
  if (session.status !== "paused") throw new Error(`Computer session cannot resume from ${session.status}.`);
  if (new Date(session.expiresAt).getTime() <= Date.now()) throw new Error("Computer session has expired.");
  if (session.control.controller !== "PAUSED") throw new Error(`Computer control cannot resume from ${session.control.controller}.`);
  const agent=await getAgent(ownerId,session.agentId);if(!agent||agent.status!=="active")throw new Error("The assigned Agent is not active.");
  await assertRunResumable(ownerId,session.runId);
  await liveSessionProviderFor(session.environmentType).observe(session);
  await transitionComputerControl({ownerId,sessionId:id,expectedController:"PAUSED",expectedVersion:session.control.version,operation:"resumeAgent",requestedBy:ownerId,reason:"Agent resumed after owner validation"});
  const resumed=await transitionComputerSession({ ownerId, id, to: "ready" });await resumeWaitingRun(ownerId,resumed.runId,"Owner resumed Agent after validating the Computer session");return resumed;
}

export async function requestOwnerTakeover(input:{ownerId:string;id:string;agentId:string;reason:string}):Promise<ComputerSessionView>{
  const session=await getComputerSession(input.ownerId,input.id);if(!session)throw new Error("Computer session not found.");if(session.status==="provisioning")throw new Error("Computer session is still provisioning and cannot request takeover yet.");if(session.agentId!==input.agentId)throw new Error("This Computer session belongs to another Agent.");if(session.control.controller!=="AGENT")throw new Error(`Takeover cannot be requested while control is ${session.control.controller}.`);
  const reason=redactEvidenceText(input.reason).slice(0,500);
  await transitionComputerControl({ownerId:input.ownerId,sessionId:input.id,expectedController:"AGENT",expectedVersion:session.control.version,operation:"requestOwnerTakeover",requestedBy:input.agentId,reason});
  if(session.status!=="paused")await transitionComputerSession({ownerId:input.ownerId,id:input.id,to:"paused"});
  if(session.runId)await db().transaction(tx=>[
    tx`WITH changed AS (UPDATE task_runs SET status='waiting_for_owner',status_reason=${reason},updated_at=now() WHERE owner_id=${input.ownerId} AND id=${session.runId} AND status='running' RETURNING id) INSERT INTO task_transitions (task_id,from_status,to_status,actor,reason) SELECT id,'running','waiting_for_owner','agent',${reason} FROM changed`,
    tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,severity,summary,payload,idempotency_key) VALUES (${`event_${randomUUID()}`},${input.ownerId},'control.takeover_requested','computer_control',${session.id},${session.goalId},${session.taskId},${session.runId},'attention','Sofie needs you to take over',${JSON.stringify({agentId:session.agentId,reason})}::jsonb,${`takeover-request:${session.id}:${session.control.version}`}) ON CONFLICT (owner_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
  ]);
  return (await getComputerSession(input.ownerId,input.id))!;
}

export async function takeOverComputerSession(input:{ownerId:string;id:string;expectedVersion:number;requestedBy:string}):Promise<ComputerSessionView>{
  const session=await getComputerSession(input.ownerId,input.id);if(!session)throw new Error("Computer session not found.");
  if(session.status==="provisioning")throw new Error("Computer session is still provisioning and cannot be controlled yet.");
  const provider=liveSessionProviderFor(session.environmentType);const capabilities=provider.getCapabilities(session);if(!capabilities.humanTakeover||!capabilities.ownerInput)throw new Error("Human Takeover is not supported by the current Computer provider.");
  const observation=await provider.observe(session);const fingerprint=safeStateFingerprint(observation);
  const acquired=await transitionComputerControl({ownerId:input.ownerId,sessionId:input.id,expectedController:session.control.controller,expectedVersion:input.expectedVersion,operation:"takeOver",requestedBy:input.requestedBy,reason:"Human takeover",stateFingerprint:fingerprint});
  try{await provider.acquireOwnerControl(session,acquired.version);await enableOwnerInput({ownerId:input.ownerId,sessionId:input.id,version:acquired.version,requestedBy:input.requestedBy});}
  catch(error){await transitionComputerControl({ownerId:input.ownerId,sessionId:input.id,expectedController:"OWNER",expectedVersion:acquired.version,operation:"pause",requestedBy:input.requestedBy,reason:"Owner input transport unavailable"}).catch(()=>undefined);throw error;}
  if(session.status!=="paused")await transitionComputerSession({ownerId:input.ownerId,id:input.id,to:"paused"});
  return (await getComputerSession(input.ownerId,input.id))!;
}

export async function returnComputerControl(input:{ownerId:string;id:string;expectedVersion:number;requestedBy:string}):Promise<ComputerSessionView>{
  const session=await getComputerSession(input.ownerId,input.id);if(!session)throw new Error("Computer session not found.");if(session.control.controller!=="OWNER")throw new Error("Owner does not control this Computer session.");
  const provider=liveSessionProviderFor(session.environmentType);let observation;try{await disableOwnerInput({ownerId:input.ownerId,sessionId:input.id,version:input.expectedVersion,requestedBy:input.requestedBy});await provider.releaseOwnerControl(session,input.expectedVersion);observation=await provider.observe(session);}catch(error){if(error instanceof LiveSessionLostError){await markComputerSessionLost(session,"Provider session was lost during Human Takeover");throw new Error("The live Computer session was lost. The Run requires recovery.");}await transitionComputerControl({ownerId:input.ownerId,sessionId:input.id,expectedController:"OWNER",expectedVersion:input.expectedVersion,operation:"pause",requestedBy:input.requestedBy,reason:"Unable to safely return control"}).catch(()=>undefined);throw new Error("Unable to safely return control. The Computer is paused.");}
  const fingerprint=safeStateFingerprint(observation);const beforeFingerprint=await controlFingerprint(input.ownerId,input.id);const changed=beforeFingerprint!==null&&fingerprint!==beforeFingerprint;
  if(changed&&session.runId){
    const invalidated=await db().query(`UPDATE task_approval_decisions SET status='invalidated',decision_reason='Environment changed during Human Takeover' WHERE owner_id=$1 AND task_id=$2 AND status IN ('pending','approved') RETURNING id`,[input.ownerId,session.runId]) as Row[];
    if(invalidated.length)await db().transaction(tx=>invalidated.map(row=>tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,severity,summary,payload) VALUES (${`event_${randomUUID()}`},${input.ownerId},'APPROVAL_INVALIDATED','approval_request',${text(row.id)},${session.goalId},${session.taskId},${session.runId},'attention','Approval invalidated after Human Takeover',${JSON.stringify({approvalId:text(row.id),computerSessionId:session.id,reason:"environment_changed"})}::jsonb)`));
  }
  const agent=await getAgent(input.ownerId,session.agentId);if(!agent||agent.status!=="active"){await transitionComputerControl({ownerId:input.ownerId,sessionId:input.id,expectedController:"OWNER",expectedVersion:input.expectedVersion,operation:"pause",requestedBy:input.requestedBy,reason:"Assigned Agent is unavailable"});throw new Error("Unable to resume the assigned Agent. The Computer is paused.");}
  try{await assertRunResumable(input.ownerId,session.runId);}catch{await transitionComputerControl({ownerId:input.ownerId,sessionId:input.id,expectedController:"OWNER",expectedVersion:input.expectedVersion,operation:"pause",requestedBy:input.requestedBy,reason:"Run is not safe to resume"});throw new Error("Unable to safely resume the Run. The Computer is paused.");}
  await db().query(`UPDATE browser_sessions SET current_url=$3,last_activity_at=now() WHERE computer_session_id=$1 AND id=$2`,[session.id,session.browser?.id??null,observation.currentUrl]);
  await transitionComputerControl({ownerId:input.ownerId,sessionId:input.id,expectedController:"OWNER",expectedVersion:input.expectedVersion,operation:"returnControl",requestedBy:input.requestedBy,reason:"Environment re-observed; stale assumptions invalidated",stateFingerprint:fingerprint,checkpoint:{runId:session.runId,agentId:session.agentId,computerSessionId:session.id,browserSessionId:session.browser?.id??null,providerSessionId:observation.providerSessionId,currentUrl:observation.currentUrl,browserStatus:observation.browserStatus,sessionStatus:observation.sessionStatus,lastVerifiedAction:await lastVerifiedActionId(session.id),artifactIds:session.artifacts.map(artifact=>artifact.id),controlVersion:input.expectedVersion,takeoverTransition:changed?"environment_changed":"environment_unchanged",observedAt:observation.observedAt}});
  if(session.status==="paused")await transitionComputerSession({ownerId:input.ownerId,id:input.id,to:"ready"});
  await resumeWaitingRun(input.ownerId,session.runId,"Owner returned control after safe re-observation");return (await getComputerSession(input.ownerId,input.id))!;
}

async function lastVerifiedActionId(sessionId:string):Promise<string|null>{const rows=await db().query(`SELECT id FROM computer_actions WHERE computer_session_id=$1 AND status='completed' ORDER BY completed_at DESC,id DESC LIMIT 1`,[sessionId]) as Row[];return rows[0]?text(rows[0].id):null;}

async function markComputerSessionLost(session:ComputerSessionView,reason:string):Promise<void>{
  await transitionComputerSession({ownerId:session.ownerId,id:session.id,to:"lost",failureCode:"provider_session_lost",failureSummary:reason});
  if(session.runId)await db().query(`UPDATE task_runs SET status='paused',status_reason='Computer provider session lost; recovery required',updated_at=now() WHERE owner_id=$1 AND id=$2 AND status IN ('running','waiting_for_owner')`,[session.ownerId,session.runId]);
}

export async function getComputerLiveView(input:{ownerId:string;id:string;runId:string;browserSessionId:string}):Promise<LiveViewFrame>{
  const session=await getComputerSession(input.ownerId,input.id);if(!session)throw new Error("Computer session not found.");
  if(session.runId!==input.runId||session.browser?.id!==input.browserSessionId)throw new Error("Live view binding does not match this Run and Browser session.");
  const provider=liveSessionProviderFor(session.environmentType);if(!provider.getCapabilities(session).liveView)throw new Error("Live view is not supported by the current Computer provider.");
  try{return await provider.getLiveView(session);}catch(error){if(error instanceof LiveSessionLostError)await markComputerSessionLost(session,"Provider session disappeared while opening Live Computer");throw error;}
}

export async function sendComputerOwnerInput(input:{ownerId:string;id:string;runId:string;browserSessionId:string;controlVersion:number;requestedBy:string;ownerInput:OwnerInput}):Promise<void>{
  const session=await getComputerSession(input.ownerId,input.id);if(!session)throw new Error("Computer session not found.");
  if(session.runId!==input.runId||session.browser?.id!==input.browserSessionId)throw new Error("Owner input binding does not match this Run and Browser session.");
  const provider=liveSessionProviderFor(session.environmentType);if(!provider.getCapabilities(session).ownerInput)throw new Error("Owner input is not supported by the current Computer provider.");
  await beginOwnerInput({ownerId:input.ownerId,sessionId:input.id,browserSessionId:input.browserSessionId,runId:input.runId,version:input.controlVersion,requestedBy:input.requestedBy});
  try{await provider.sendOwnerInput(session,input.controlVersion,input.ownerInput);}finally{await finishOwnerInput({ownerId:input.ownerId,sessionId:input.id,version:input.controlVersion});}
}

async function controlFingerprint(ownerId:string,id:string):Promise<string|null>{const rows=await db().query(`SELECT state_fingerprint FROM computer_control_leases WHERE owner_id=$1 AND computer_session_id=$2`,[ownerId,id]) as Row[];return nullableText(rows[0]?.state_fingerprint);}
async function assertRunResumable(ownerId:string,runId:string|null):Promise<void>{if(!runId)return;const rows=await db().query(`SELECT status,model_steps,max_model_steps,estimated_cost_usd,max_estimated_cost_usd FROM task_runs WHERE owner_id=$1 AND id=$2`,[ownerId,runId]) as Row[];const run=rows[0];if(!run||!["running","waiting_for_owner","paused","awaiting_approval"].includes(text(run.status)))throw new Error("The linked Run is not resumable.");if(number(run.model_steps)>=number(run.max_model_steps))throw new Error("The linked Run exhausted its model-step budget.");if(number(run.estimated_cost_usd)>=number(run.max_estimated_cost_usd))throw new Error("The linked Run exhausted its cost budget.");}
async function resumeWaitingRun(ownerId:string,runId:string|null,reason:string):Promise<void>{if(!runId)return;await db().query(`WITH changed AS (UPDATE task_runs SET status='running',status_reason=NULL,updated_at=now() WHERE owner_id=$1 AND id=$2 AND status='waiting_for_owner' RETURNING id) INSERT INTO task_transitions (task_id,from_status,to_status,actor,reason) SELECT id,'waiting_for_owner','running','owner',$3 FROM changed`,[ownerId,runId,reason]);}

export async function heartbeatComputerControl(input:{ownerId:string;id:string;version:number;requestedBy:string}):Promise<{version:number;expiresAt:string}>{await expireOwnerControlLeases(input.ownerId);return heartbeatOwnerControl({ownerId:input.ownerId,sessionId:input.id,version:input.version,requestedBy:input.requestedBy});}

export async function listComputerSessions(ownerId: string, limit = 30): Promise<ComputerSessionView[]> {
  await expireComputerSessions();
  await expireOwnerControlLeases(ownerId);
  const rows = await db().query(
    `${SESSION_SELECT} WHERE s.owner_id=$1 ORDER BY s.last_activity_at DESC,s.id DESC LIMIT $2`,
    [ownerId, Math.max(1, Math.min(100, limit))],
  ) as Row[];
  return Promise.all(rows.map(sessionView));
}

export async function transitionComputerSession(input: {
  ownerId: string; id: string; to: ComputerSessionStatus; sandboxId?: string;
  failureCode?: string; failureSummary?: string;
}): Promise<ComputerSessionView> {
  const current = await getComputerSession(input.ownerId, input.id);
  if (!current) throw new Error("Computer session not found.");
  if (current.status === input.to) return current;
  if (!canTransitionComputerSession(current.status, input.to)) {
    throw new Error(`Computer session cannot transition from ${current.status} to ${input.to}.`);
  }
  if (["failed","lost"].includes(input.to) && !input.failureCode) throw new Error("A failure code is required for failed or lost sessions.");
  const terminal = ["completed", "failed", "lost", "expired", "stopped"].includes(input.to);
  const failureSummary = input.failureSummary ? redactEvidenceText(input.failureSummary).slice(0, 1000) : null;
  await db().transaction((tx) => [
    tx`UPDATE computer_sessions SET status=${input.to},sandbox_id=coalesce(${input.sandboxId ?? null},sandbox_id),last_activity_at=now(),
       completed_at=CASE WHEN ${terminal} THEN now() ELSE NULL END,
       failure_code=${["failed","lost"].includes(input.to) ? input.failureCode ?? null : null},failure_summary=${["failed","lost"].includes(input.to) ? failureSummary : null}
       WHERE owner_id=${input.ownerId} AND id=${input.id}`,
    tx`UPDATE browser_sessions SET status=${input.to === "provisioning" ? "ready" : input.to},last_activity_at=now(),
       completed_at=CASE WHEN ${terminal} THEN now() ELSE NULL END WHERE computer_session_id=${input.id}`,
    ...(terminal ? [tx`WITH previous AS (SELECT * FROM computer_control_leases WHERE computer_session_id=${input.id} AND controller<>'NONE'), changed AS (UPDATE computer_control_leases SET controller='NONE',version=version+1,claimed_by=NULL,claimed_at=NULL,heartbeat_at=NULL,expires_at=NULL,owner_input_enabled=false,transition_reason=${`Computer session ${input.to}`},updated_at=now() WHERE computer_session_id=${input.id} AND controller<>'NONE' RETURNING *) INSERT INTO computer_control_receipts (id,computer_session_id,owner_id,agent_id,run_id,event_type,previous_controller,new_controller,control_version,requested_by,reason) SELECT ${`control_${randomUUID()}`},c.computer_session_id,c.owner_id,c.agent_id,c.run_id,${`control.session_${input.to}`},p.controller,'NONE',c.version,'system',${`Computer session ${input.to}`} FROM changed c JOIN previous p USING (computer_session_id)`] : []),
    ...(terminal ? [tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
       VALUES (${`event_${randomUUID()}`},${current.ownerId},${`COMPUTER_SESSION_${input.to.toUpperCase()}`},'computer_session',${current.id},${current.goalId},${current.taskId},${current.runId},${`Computer session ${input.to}`},${JSON.stringify({ agentId: current.agentId, failureCode: input.failureCode ?? null })}::jsonb)`] : []),
  ]);
  return (await getComputerSession(input.ownerId, input.id))!;
}

export async function stopComputerSession(ownerId: string, id: string): Promise<ComputerSessionView> {
  const session=await getComputerSession(ownerId,id);if(!session)throw new Error("Computer session not found.");
  if(session.control.controller!=="NONE")await transitionComputerControl({ownerId,sessionId:id,expectedController:session.control.controller,expectedVersion:session.control.version,operation:"stop",requestedBy:ownerId,reason:"Computer session stopped by owner"});
  await liveSessionProviderFor(session.environmentType).stopSession(session).catch(error=>{if(!(error instanceof LiveSessionLostError))throw error;});
  return transitionComputerSession({ ownerId, id, to: "stopped" });
}

export async function assertComputerCapability(input: {
  ownerId: string; runtimeSessionId: string; agentId: string; capabilityId: string;
}): Promise<{ agent: AgentView; session: ComputerSessionView }> {
  const session = await getComputerSessionForRuntime(input.ownerId, input.runtimeSessionId);
  if (!session || !ACTIVE_STATUSES.includes(session.status as (typeof ACTIVE_STATUSES)[number])) {
    throw new Error("Start a computer session before using computer tools.");
  }
  if (session.agentId !== input.agentId) throw new Error("This computer session belongs to another Agent.");
  const agent = await getAgent(input.ownerId, session.agentId);
  if (!agent) throw new Error("Computer session Agent not found.");
  const decision = effectiveCapability(agent, input.capabilityId);
  if (!decision.allowed) throw new Error(decision.reason ?? `Capability ${input.capabilityId} is not allowed.`);
  if (session.control.controller !== "AGENT") throw new Error(`Computer control belongs to ${session.control.controller.toLowerCase()}; Agent actions are paused.`);
  return { agent, session };
}

export function computerActionTypeForTool(toolName: string): ComputerActionType | null {
  if (toolName === "browser__navigate") return "browser.navigate";
  if (["browser__click", "browser__press_key", "browser__scroll", "browser__select_option"].includes(toolName)) return "browser.click";
  if (toolName === "browser__fill") return "browser.type";
  if (["browser__read", "browser__snapshot", "browser__get", "browser__find", "browser__wait_for"].includes(toolName)) return "browser.read";
  if (["read_file", "glob", "grep"].includes(toolName)) return "file.read";
  if (toolName === "write_file") return "file.write";
  if (toolName === "bash" || toolName === "terminal_execute") return "terminal.command";
  if (toolName === "record_computer_artifact") return "file.upload";
  return null;
}

function summarize(value: unknown): string {
  let serialized: string;
  try { serialized = typeof value === "string" ? value : JSON.stringify(value); }
  catch { serialized = "[unserializable]"; }
  return redactEvidenceText(serialized.replace(/data:[^;,]+;base64,[A-Za-z0-9+/=]+/g, "[inline-data-removed]")).slice(0, 2000);
}

export function summarizeComputerActionInput(toolName: string, input: Record<string, unknown>): string {
  const safeInput = { ...input };
  if (toolName === "browser__fill") safeInput.text = "[typed value omitted]";
  if (toolName === "write_file") safeInput.content = "[file content omitted]";
  return summarize(safeInput);
}

function actionTarget(input: Record<string, unknown>): string | null {
  for (const key of ["url", "selector", "path", "command"]) {
    if (typeof input[key] === "string") return redactEvidenceText(input[key] as string).slice(0, 500);
  }
  return null;
}

export async function recordComputerActionRequested(input: {
  ownerId: string; agentId: string; runtimeSessionId: string; callId: string; toolName: string; toolInput: Record<string, unknown>;
}): Promise<void> {
  const type = computerActionTypeForTool(input.toolName);
  if (!type) return;
  const session = await getComputerSessionForRuntime(input.ownerId, input.runtimeSessionId);
  if (!session || !ACTIVE_STATUSES.includes(session.status as (typeof ACTIVE_STATUSES)[number])) return;
  if (session.agentId !== input.agentId) throw new Error("This computer session belongs to another Agent.");
  const browserActions = type.startsWith("browser.") ? await db().query(
    `SELECT count(*)::int AS count FROM computer_actions WHERE computer_session_id=$1 AND type LIKE 'browser.%'`,
    [session.id],
  ) as Row[] : [];
  if (type.startsWith("browser.") && number(browserActions[0]?.count) >= session.resourceLimits.maxBrowserActions) {
    await transitionComputerSession({ ownerId: session.ownerId, id: session.id, to: "failed", failureCode: "resource_limit", failureSummary: `Browser action limit reached (${session.resourceLimits.maxBrowserActions}).` });
    throw new Error(`Computer session reached its browser action limit (${session.resourceLimits.maxBrowserActions}).`);
  }
  const id = `computer_action_${randomUUID()}`;
  const admitted=await db().query(`WITH authority AS (
    UPDATE computer_control_leases l SET version=l.version+1,updated_at=now()
    FROM computer_sessions s
    WHERE l.computer_session_id=$2 AND l.owner_id=$9 AND l.agent_id=$4 AND l.controller='AGENT'
      AND s.id=l.computer_session_id AND s.owner_id=l.owner_id
      AND s.status IN ('ready','running') AND s.expires_at>now()
    RETURNING l.version
  ), inserted AS (
    INSERT INTO computer_actions (id,computer_session_id,run_id,agent_id,call_id,type,target,input_summary,control_version)
    SELECT $1,$2,$3,$4,$5,$6,$7,$8,authority.version FROM authority
    ON CONFLICT (computer_session_id,call_id) DO NOTHING RETURNING id
  ) SELECT id FROM inserted`,[id,session.id,session.runId,session.agentId,input.callId,type,actionTarget(input.toolInput),summarizeComputerActionInput(input.toolName,input.toolInput),input.ownerId]) as Row[];
  if(!admitted[0]){
    const duplicate=await db().query(`SELECT id FROM computer_actions WHERE computer_session_id=$1 AND call_id=$2 LIMIT 1`,[session.id,input.callId]) as Row[];
    if(!duplicate[0])throw new Error("Agent action rejected because interactive control changed.");
    return;
  }
  await db().transaction((tx)=>[
    tx`UPDATE computer_sessions SET status='running',last_activity_at=now() WHERE id=${session.id} AND status IN ('ready','running')`,
    tx`UPDATE browser_sessions SET status='running',last_activity_at=now() WHERE computer_session_id=${session.id} AND ${type.startsWith("browser.")}`,
  ]);
}

export async function recordComputerActionResult(input: {
  ownerId: string; agentId: string; runtimeSessionId: string; callId: string; toolName: string; status: "completed" | "failed" | "rejected";
  output: unknown; errorCode?: string; errorMessage?: string;
}): Promise<void> {
  if (!computerActionTypeForTool(input.toolName)) return;
  const session = await getComputerSessionForRuntime(input.ownerId, input.runtimeSessionId);
  if (!session || session.agentId !== input.agentId) return;
  const safeError = input.errorMessage ? redactEvidenceText(input.errorMessage).slice(0, 1000) : null;
  const timedOut = /timed?\s*out|timeout/i.test(`${input.errorCode ?? ""} ${safeError ?? ""}`);
  const capabilityDenied = /capabilit|not assigned|belongs to another Agent/i.test(safeError ?? "");
  const status: ComputerActionStatus = input.status === "completed" ? "completed" : input.status === "rejected" || capabilityDenied ? "denied" : timedOut ? "timed_out" : "failed";
  const failureCode = status === "denied" ? "capability_denied" : status === "timed_out" ? "action_timeout" : input.errorCode ?? (status === "failed" ? "action_failed" : null);
  await db().transaction((tx) => [
    tx`UPDATE computer_actions SET status=${status},output_summary=${summarize(input.output)},completed_at=now(),
       failure_code=${failureCode},failure_summary=${safeError}
       WHERE computer_session_id=${session.id} AND call_id=${input.callId}`,
    tx`UPDATE computer_sessions SET status=CASE WHEN status='running' THEN 'ready' ELSE status END,last_activity_at=now() WHERE id=${session.id}`,
    tx`UPDATE browser_sessions SET status=CASE WHEN status='running' THEN 'ready' ELSE status END,last_activity_at=now(),
       current_url=CASE WHEN ${input.toolName === "browser__navigate" && status === "completed"}
         THEN coalesce((SELECT target FROM computer_actions WHERE computer_session_id=${session.id} AND call_id=${input.callId}),current_url)
         ELSE current_url END
       WHERE computer_session_id=${session.id}`,
  ]);
}

export async function listComputerActions(ownerId: string, sessionId: string): Promise<ComputerActionView[]> {
  const session = await getComputerSession(ownerId, sessionId);
  if (!session) throw new Error("Computer session not found.");
  const rows = await db().query(`SELECT * FROM computer_actions WHERE computer_session_id=$1 ORDER BY started_at,id`, [sessionId]) as Row[];
  return rows.map(actionView);
}

export async function recordComputerArtifact(input: {
  ownerId: string; sessionId: string; actionId?: string; kind: ComputerArtifactView["kind"];
  filename: string; contentType: string; storageKey: string; sizeBytes: number; sha256: string;
}): Promise<ComputerArtifactView> {
  const session = await getComputerSession(input.ownerId, input.sessionId);
  if (!session) throw new Error("Computer session not found.");
  if (input.kind === "screenshot" && session.control.controller === "OWNER") throw new Error("Screenshot capture is suppressed during owner control.");
  if (input.sizeBytes > session.resourceLimits.maxFileBytes) throw new Error(`Artifact exceeds the ${session.resourceLimits.maxFileBytes}-byte session limit.`);
  if (input.actionId) {
    const rows = await db().query(`SELECT id FROM computer_actions WHERE computer_session_id=$1 AND id=$2 LIMIT 1`, [session.id, input.actionId]) as Row[];
    if (!rows[0]) throw new Error("Action does not belong to this computer session.");
  }
  const id = `computer_artifact_${randomUUID()}`;
  await db().transaction((tx) => [
    tx`INSERT INTO computer_artifacts (id,owner_id,computer_session_id,action_id,run_id,kind,filename,content_type,storage_key,size_bytes,sha256)
       VALUES (${id},${input.ownerId},${session.id},${input.actionId ?? null},${session.runId},${input.kind},${input.filename.slice(0,240)},${input.contentType.slice(0,160)},${input.storageKey},${input.sizeBytes},${input.sha256})`,
    ...(input.actionId ? [tx`UPDATE computer_actions SET evidence_refs=evidence_refs || ${JSON.stringify([id])}::jsonb WHERE id=${input.actionId}`] : []),
    tx`UPDATE computer_sessions SET last_activity_at=now() WHERE id=${session.id}`,
    tx`INSERT INTO eve_events (id,owner_id,type,source_type,source_id,goal_id,goal_task_id,run_id,summary,payload)
       VALUES (${`event_${randomUUID()}`},${input.ownerId},'COMPUTER_ARTIFACT_CREATED','computer_session',${session.id},${session.goalId},${session.taskId},${session.runId},'Computer artifact created',${JSON.stringify({ artifactId: id, filename: input.filename, kind: input.kind, agentId: session.agentId })}::jsonb)`,
  ]);
  const rows = await db().query(`SELECT * FROM computer_artifacts WHERE id=$1`, [id]) as Row[];
  return artifactView(rows[0]);
}

export async function computerArtifactStorageKey(ownerId: string, sessionId: string, artifactId: string): Promise<{ storageKey: string; contentType: string; filename: string } | null> {
  const rows = await db().query(
    `SELECT a.storage_key,a.content_type,a.filename FROM computer_artifacts a
     JOIN computer_sessions s ON s.id=a.computer_session_id
     WHERE s.owner_id=$1 AND s.id=$2 AND a.id=$3 LIMIT 1`,
    [ownerId, sessionId, artifactId],
  ) as Row[];
  return rows[0] ? { storageKey: text(rows[0].storage_key), contentType: text(rows[0].content_type), filename: text(rows[0].filename) } : null;
}
