import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { db } from "../agent/lib/receipts-db.ts";
import { deploymentOwnerId } from "./owner-identity.ts";
import { consumeProviderAuthority, type AuthorizedAction } from "./action-gateway.ts";
import { localReadOperation, type LocalOperation, type LocalResult } from "./local-computer-contract.ts";

export function localPairing() {
  const token = process.env.SOFIE_LOCAL_DEVICE_TOKEN?.trim();
  const deviceId = process.env.SOFIE_LOCAL_DEVICE_ID?.trim();
  if (!token || token.length < 32 || !deviceId || !/^[a-zA-Z0-9_-]{1,80}$/.test(deviceId)) return null;
  return { token, deviceId, ownerId: deploymentOwnerId(), hash: createHash("sha256").update(token).digest("hex") };
}

export function localWorkerAuthenticated(request: Request): boolean {
  const pairing = localPairing();
  if (!pairing || request.headers.has("origin")) return false;
  const supplied = request.headers.get("authorization") ?? "";
  return timingSafeEqual(createHash("sha256").update(supplied).digest(),
    createHash("sha256").update(`Bearer ${pairing.token}`).digest());
}

export async function localDeviceStatus(ownerId: string) {
  const pairing = localPairing();
  if (!pairing || pairing.ownerId !== ownerId) return { status: "not_configured" };
  const rows = await db().query(`SELECT roots,permissions,last_seen_at,(last_seen_at>now()-interval '30 seconds') AS online
    FROM local_computer_devices WHERE owner_id=$1 AND device_id=$2 AND pairing_hash=$3`, [ownerId, pairing.deviceId, pairing.hash]);
  return { status: rows[0]?.online === true ? "ready" : "offline", deviceId: pairing.deviceId,
    roots: rows[0]?.roots ?? [], permissions: rows[0]?.permissions ?? {}, lastSeenAt: rows[0]?.last_seen_at ?? null };
}

/** Only a one-use Action Gateway provider grant may enqueue an operation. */
export async function enqueueLocalOperation(input: LocalOperation, sessionId: string, authority: AuthorizedAction) {
  const pairing = localPairing();
  if (!pairing || authority.target.account !== pairing.ownerId || authority.target.resource !== pairing.deviceId
    || authority.target.environment !== pairing.hash || authority.target.provider !== "local-mac") throw new Error("Local pairing changed.");
  await consumeProviderAuthority(authority, input, authority.capabilityId);
  const rows = await db().query(`INSERT INTO local_computer_jobs
    (id,owner_id,device_id,pairing_hash,agent_id,agent_revision,session_id,action_id,parameters,needs_approval)
    SELECT $1,$2,$3,$4,g.id,g.updated_at,$6,a.id,$7::jsonb,$8
    FROM action_requests a JOIN agents g ON g.owner_id=a.owner_id AND g.id=$5
    WHERE a.id=$9 AND a.owner_id=$2 AND a.status='executing' AND g.status='active'
    ON CONFLICT(owner_id,action_id) DO NOTHING RETURNING id`,
    [randomUUID(), pairing.ownerId, pairing.deviceId, pairing.hash, authority.executor.agentId, sessionId,
      JSON.stringify(input), !localReadOperation(input), authority.authorityId]);
  if (!rows[0]) throw new Error("Local operation was not queued.");
  return { jobId: String(rows[0].id), status: "queued" };
}

export async function localJob(ownerId: string, agentId: string, sessionId: string, jobId: string) {
  const rows = await db().query(`SELECT id,status,expires_at,
    CASE WHEN created_at>now()-interval '1 hour' THEN result ELSE NULL END AS result,
    (expires_at<=now()) AS expired FROM local_computer_jobs
    WHERE owner_id=$1 AND agent_id=$2 AND session_id=$3 AND id=$4`, [ownerId,agentId,sessionId,jobId]);
  const row = rows[0];
  if (!row) throw new Error("Local job is not available to this session.");
  const status = row.expired && row.status === "queued" ? "expired" : row.expired && row.status === "running" ? "unknown" : row.status;
  return { jobId, status, result: row.result as LocalResult | null };
}

/** Device polling rechecks the canonical approval and live Run before releasing a job.
 * Running jobs are never reclaimed: a lost response cannot repeat a Mac action. */
export async function pollLocalDevice(roots: string[], permissions: Record<string, boolean>) {
  const pairing = localPairing();
  if (!pairing) throw new Error("Local pairing is not configured.");
  const {ownerId,deviceId,hash} = pairing;
  await db().query(`INSERT INTO local_computer_devices(owner_id,device_id,pairing_hash,roots,permissions)
    VALUES($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT(owner_id,device_id) DO UPDATE
    SET pairing_hash=$3,roots=$4::jsonb,permissions=$5::jsonb,last_seen_at=now()`, [ownerId,deviceId,hash,JSON.stringify(roots),JSON.stringify(permissions)]);
  await db().query(`UPDATE local_computer_jobs SET status=CASE WHEN status='queued' THEN 'expired' ELSE 'unknown' END
    WHERE owner_id=$1 AND device_id=$2 AND status IN ('queued','running') AND expires_at<=now()`,[ownerId,deviceId]);
  await db().query(`UPDATE local_computer_jobs SET parameters='{}',result=NULL
    WHERE owner_id=$1 AND device_id=$2 AND created_at<now()-interval '1 hour' AND (result IS NOT NULL OR parameters<>'{}'::jsonb)`,[ownerId,deviceId]);
  const rows = await db().query(`WITH candidate AS (
    SELECT j.id FROM local_computer_jobs j JOIN action_requests a ON a.id=j.action_id AND a.owner_id=j.owner_id
    JOIN task_runs r ON r.id=a.run_id AND r.owner_id=a.owner_id
    JOIN agents g ON g.owner_id=j.owner_id AND g.id=j.agent_id
    JOIN task_run_sessions s ON s.task_id=r.id AND s.session_id=j.session_id AND s.is_current
    LEFT JOIN task_approval_decisions p ON p.id=a.approval_id AND p.owner_id=a.owner_id
    WHERE j.owner_id=$1 AND j.device_id=$2 AND j.pairing_hash=$3 AND j.status='queued'
      AND j.expires_at>now()+interval '30 seconds' AND a.status='completed'
      AND r.status IN ('running','awaiting_approval') AND (r.deadline_at IS NULL OR r.deadline_at>now()+interval '30 seconds')
      AND r.model_steps<r.max_model_steps AND r.estimated_cost_usd<r.max_estimated_cost_usd
      AND g.status='active' AND g.updated_at=j.agent_revision
      AND (NOT j.needs_approval OR (p.status='approved' AND p.decision='approved' AND p.expires_at>now()+interval '30 seconds'
        AND p.binding_hash=a.parameter_hash AND p.task_id=a.run_id AND p.agent_id=j.agent_id AND p.capability_id=a.capability_id
        AND p.action_class=a.action_class AND p.action=a.action_class))
    ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1
  ) UPDATE local_computer_jobs j SET status='running',claim_id=$4 FROM candidate c WHERE j.id=c.id
    RETURNING j.id,j.claim_id,j.parameters,j.expires_at`, [ownerId,deviceId,hash,randomUUID()]);
  return rows[0] ?? null;
}

export async function completeLocalJob(jobId: string, claimId: string, result: LocalResult) {
  const pairing = localPairing();
  if (!pairing) throw new Error("Local pairing is not configured.");
  const rows = await db().query(`UPDATE local_computer_jobs SET status=$6,result=$7::jsonb,finished_at=now()
    WHERE id=$1 AND claim_id=$2 AND owner_id=$3 AND device_id=$4 AND pairing_hash=$5
      AND status='running' AND expires_at>now() RETURNING id`,
    [jobId,claimId,pairing.ownerId,pairing.deviceId,pairing.hash,result.isError ? "failed" : "completed",JSON.stringify(result)]);
  return rows.length === 1;
}
