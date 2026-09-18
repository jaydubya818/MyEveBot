import { randomUUID } from "node:crypto";

import { db } from "../agent/lib/receipts-db.ts";
import { getAgent, listAgents, type AgentView } from "./agents.ts";

export const BROWSER_PROFILE_STATUSES = ["ready", "takeover_required", "reconnect_required", "revoked"] as const;
export type BrowserProfileStatus = (typeof BROWSER_PROFILE_STATUSES)[number];

export interface BrowserProfileGrantView {
  id: string;
  agentId: string;
  agentName: string;
  grantedAt: string;
}

export interface BrowserProfileView {
  id: string;
  ownerId: string;
  agentId: string;
  agentName: string;
  agentSlug: string;
  agentIsPrimary: boolean;
  provider: "orgo";
  status: BrowserProfileStatus;
  generation: number;
  lastUsedAt: string | null;
  lastOwnerTakeoverAt: string | null;
  lastAuthenticatedAt: string | null;
  failureSummary: string | null;
  sharedWith: BrowserProfileGrantView[];
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;
const text = (value: unknown): string => typeof value === "string" ? value : String(value ?? "");
const nullableText = (value: unknown): string | null => value == null ? null : text(value);
const iso = (value: unknown): string => value instanceof Date ? value.toISOString() : text(value);
const nullableIso = (value: unknown): string | null => value == null ? null : iso(value);

async function grantsByProfile(ownerId: string): Promise<Map<string, BrowserProfileGrantView[]>> {
  const rows = await db().query(
    `SELECT grant_row.*, agent.name AS agent_name
     FROM persistent_browser_profile_grants grant_row
     JOIN agents agent ON agent.owner_id=grant_row.owner_id AND agent.id=grant_row.agent_id
     WHERE grant_row.owner_id=$1 AND grant_row.revoked_at IS NULL
     ORDER BY agent.name,grant_row.granted_at`,
    [ownerId],
  ) as Row[];
  const result = new Map<string, BrowserProfileGrantView[]>();
  for (const row of rows) {
    const profileId = text(row.profile_id);
    const current = result.get(profileId) ?? [];
    current.push({ id: text(row.id), agentId: text(row.agent_id), agentName: text(row.agent_name), grantedAt: iso(row.granted_at) });
    result.set(profileId, current);
  }
  return result;
}

function view(row: Row, grants: BrowserProfileGrantView[] = []): BrowserProfileView {
  return {
    id: text(row.id), ownerId: text(row.owner_id), agentId: text(row.agent_id),
    agentName: text(row.agent_name), agentSlug: text(row.agent_slug), agentIsPrimary: row.agent_is_primary === true,
    provider: "orgo", status: text(row.status) as BrowserProfileStatus, generation: Number(row.generation),
    lastUsedAt: nullableIso(row.last_used_at), lastOwnerTakeoverAt: nullableIso(row.last_owner_takeover_at),
    lastAuthenticatedAt: nullableIso(row.last_authenticated_at), failureSummary: nullableText(row.failure_summary),
    sharedWith: grants, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}

const PROFILE_SELECT = `
  SELECT profile.*, agent.name AS agent_name, agent.slug AS agent_slug, agent.is_primary AS agent_is_primary
  FROM persistent_browser_profiles profile
  JOIN agents agent ON agent.owner_id=profile.owner_id AND agent.id=profile.agent_id
`;

async function audit(profile: BrowserProfileView, type: string, summary: string, changes: Record<string, unknown> = {}): Promise<void> {
  await db().query(
    `INSERT INTO eve_events (id,owner_id,type,source_type,source_id,summary,payload)
     VALUES ($1,$2,$3,'persistent_browser_profile',$4,$5,$6::jsonb)`,
    [`event_${randomUUID()}`, profile.ownerId, type, profile.id, summary, JSON.stringify({ agentId: profile.agentId, ...changes })],
  );
}

export async function ensureBrowserProfile(ownerId: string, agent: AgentView): Promise<BrowserProfileView> {
  await db().query(
    `INSERT INTO persistent_browser_profiles (id,owner_id,agent_id)
     VALUES ($1,$2,$3) ON CONFLICT (owner_id,agent_id) DO NOTHING`,
    [`browser_profile_${randomUUID()}`, ownerId, agent.id],
  );
  const profile = await getBrowserProfileForAgent(ownerId, agent.id);
  if (!profile) throw new Error("Persistent browser profile could not be initialized.");
  return profile;
}

export async function ensureAllBrowserProfiles(ownerId: string): Promise<BrowserProfileView[]> {
  const agents = await listAgents(ownerId);
  await Promise.all(agents.map((agent) => ensureBrowserProfile(ownerId, agent)));
  return listBrowserProfiles(ownerId);
}

export async function listBrowserProfiles(ownerId: string): Promise<BrowserProfileView[]> {
  const [rows, grants] = await Promise.all([
    db().query(`${PROFILE_SELECT} WHERE profile.owner_id=$1 ORDER BY agent.is_primary DESC,agent.name`, [ownerId]) as Promise<Row[]>,
    grantsByProfile(ownerId),
  ]);
  return rows.map((row) => view(row, grants.get(text(row.id)) ?? []));
}

export async function getBrowserProfile(ownerId: string, profileId: string): Promise<BrowserProfileView | null> {
  const rows = await db().query(`${PROFILE_SELECT} WHERE profile.owner_id=$1 AND profile.id=$2 LIMIT 1`, [ownerId, profileId]) as Row[];
  if (!rows[0]) return null;
  return view(rows[0], (await grantsByProfile(ownerId)).get(profileId) ?? []);
}

export async function getBrowserProfileForAgent(ownerId: string, agentId: string): Promise<BrowserProfileView | null> {
  const rows = await db().query(`${PROFILE_SELECT} WHERE profile.owner_id=$1 AND profile.agent_id=$2 LIMIT 1`, [ownerId, agentId]) as Row[];
  if (!rows[0]) return null;
  return view(rows[0], (await grantsByProfile(ownerId)).get(text(rows[0].id)) ?? []);
}

export async function resolveBrowserProfile(ownerId: string, actingAgent: AgentView, profileId?: string): Promise<BrowserProfileView> {
  const own = await ensureBrowserProfile(ownerId, actingAgent);
  if (!profileId || profileId === own.id) {
    if (own.status === "revoked") throw new Error("That browser profile has been revoked.");
    return own;
  }
  const rows = await db().query(
    `${PROFILE_SELECT}
     JOIN persistent_browser_profile_grants grant_row ON grant_row.profile_id=profile.id
     WHERE profile.owner_id=$1 AND profile.id=$2 AND grant_row.owner_id=$1
       AND grant_row.agent_id=$3 AND grant_row.revoked_at IS NULL LIMIT 1`,
    [ownerId, profileId, actingAgent.id],
  ) as Row[];
  if (!rows[0]) throw new Error("That browser profile is not shared with the current Agent.");
  const profile = view(rows[0]);
  if (profile.status === "revoked") throw new Error("That browser profile has been revoked.");
  return profile;
}

export async function setBrowserProfileStatus(input: {
  ownerId: string;
  profileId: string;
  status: Exclude<BrowserProfileStatus, "revoked">;
  failureSummary?: string | null;
}): Promise<BrowserProfileView> {
  const current = await getBrowserProfile(input.ownerId, input.profileId);
  if (!current) throw new Error("Persistent browser profile not found.");
  if (current.status === "revoked") throw new Error("A revoked browser profile cannot be resumed.");
  const authenticated = input.status === "ready" && current.status !== "ready";
  await db().query(
    `UPDATE persistent_browser_profiles SET status=$3,failure_summary=$4,
       last_owner_takeover_at=CASE WHEN $3='takeover_required' THEN now() ELSE last_owner_takeover_at END,
       last_authenticated_at=CASE WHEN $5 THEN now() ELSE last_authenticated_at END,
       updated_at=now() WHERE owner_id=$1 AND id=$2`,
    [input.ownerId, input.profileId, input.status, input.failureSummary ?? null, authenticated],
  );
  const updated = (await getBrowserProfile(input.ownerId, input.profileId))!;
  await audit(updated, `BROWSER_PROFILE_${input.status.toUpperCase()}`, `Persistent browser profile marked ${input.status.replaceAll("_", " ")}.`);
  return updated;
}

export async function touchBrowserProfile(ownerId: string, profileId: string): Promise<void> {
  await db().query(`UPDATE persistent_browser_profiles SET last_used_at=now(),updated_at=now() WHERE owner_id=$1 AND id=$2`, [ownerId, profileId]);
}

export async function shareBrowserProfile(ownerId: string, profileId: string, agentId: string): Promise<BrowserProfileView> {
  const [profile, agent] = await Promise.all([getBrowserProfile(ownerId, profileId), getAgent(ownerId, agentId)]);
  if (!profile || !agent) throw new Error("Browser profile or Agent not found.");
  if (profile.agentId === agentId) throw new Error("An Agent already owns its browser profile.");
  if (profile.status === "revoked") throw new Error("A revoked browser profile cannot be shared.");
  const existing = await db().query(
    `SELECT id FROM persistent_browser_profile_grants WHERE owner_id=$1 AND profile_id=$2 AND agent_id=$3 AND revoked_at IS NULL LIMIT 1`,
    [ownerId, profileId, agentId],
  ) as Row[];
  if (!existing[0]) {
    await db().query(
      `INSERT INTO persistent_browser_profile_grants (id,owner_id,profile_id,agent_id) VALUES ($1,$2,$3,$4)`,
      [`browser_grant_${randomUUID()}`, ownerId, profileId, agentId],
    );
    await audit(profile, "BROWSER_PROFILE_SHARED", `Persistent browser profile shared with ${agent.name}.`, { granteeAgentId: agent.id });
  }
  return (await getBrowserProfile(ownerId, profileId))!;
}

export async function revokeBrowserProfileGrant(ownerId: string, profileId: string, agentId: string): Promise<BrowserProfileView> {
  const profile = await getBrowserProfile(ownerId, profileId);
  if (!profile) throw new Error("Persistent browser profile not found.");
  await db().query(
    `UPDATE persistent_browser_profile_grants SET revoked_at=now()
     WHERE owner_id=$1 AND profile_id=$2 AND agent_id=$3 AND revoked_at IS NULL`,
    [ownerId, profileId, agentId],
  );
  await audit(profile, "BROWSER_PROFILE_SHARE_REVOKED", "Persistent browser profile sharing revoked.", { granteeAgentId: agentId });
  return (await getBrowserProfile(ownerId, profileId))!;
}

export async function advanceBrowserProfileGeneration(ownerId: string, profileId: string): Promise<BrowserProfileView> {
  const profile = await getBrowserProfile(ownerId, profileId);
  if (!profile) throw new Error("Persistent browser profile not found.");
  await db().transaction((tx) => [
    tx`UPDATE persistent_browser_profiles SET generation=generation+1,status='ready',failure_summary=NULL,last_authenticated_at=NULL,last_used_at=NULL,updated_at=now() WHERE owner_id=${ownerId} AND id=${profileId}`,
    tx`UPDATE persistent_browser_profile_grants SET revoked_at=now() WHERE owner_id=${ownerId} AND profile_id=${profileId} AND revoked_at IS NULL`,
  ]);
  const updated = (await getBrowserProfile(ownerId, profileId))!;
  await audit(updated, "BROWSER_PROFILE_RESET", "Persistent browser profile reset; prior login state and sharing were revoked.", { previousGeneration: profile.generation, generation: updated.generation });
  return updated;
}
