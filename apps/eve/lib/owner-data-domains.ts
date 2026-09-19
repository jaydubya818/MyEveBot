import { skillStore } from "@/agent/lib/skill-store";
import { db } from "@/agent/lib/receipts-db";
import { capabilityMap } from "@/lib/capabilities";
import { FALLBACK_TOOLKITS, manageConnections } from "@/lib/composio-connect";

export type OwnerDataCompleteness = "complete" | "partial" | "metadata_only" | "referenced_only" | "unavailable";
export type OwnerDataPortability = "fully_restorable" | "restorable_with_reconnection" | "partially_restorable" | "non_restorable" | "reference_only" | "unavailable";
export type OwnerDataScope = "owner_scoped" | "single_owner_legacy";
export type OwnerDataRow = Record<string, unknown>;
export type OwnerDataQuery = (sql: string, params?: unknown[]) => Promise<OwnerDataRow[]>;

export interface OwnerDataCategory {
  description: string;
  completeness: OwnerDataCompleteness;
  portability: OwnerDataPortability;
  notes: string[];
  records: Record<string, OwnerDataRow[]>;
}

interface DomainContext {
  ownerId: string;
  query: OwnerDataQuery;
}

export interface OwnerDataDomain {
  id: string;
  name: string;
  description: string;
  exportable: true;
  restorable: boolean;
  deletable: boolean;
  sensitivity: "standard" | "sensitive";
  dependencies: string[];
  required: boolean;
  ownerScope?: OwnerDataScope;
  load: (context: DomainContext) => Promise<OwnerDataCategory>;
}

const category = (
  domain: Pick<OwnerDataDomain, "description">,
  records: Record<string, OwnerDataRow[]>,
  completeness: OwnerDataCompleteness = "complete",
  portability: OwnerDataPortability = "fully_restorable",
  notes: string[] = [],
): OwnerDataCategory => ({ description: domain.description, completeness, portability, notes, records });

const ownerRows = (context: DomainContext, sql: string) => context.query(sql, [context.ownerId]);

type ToolkitResult = {
  toolkit?: string;
  accounts?: Array<{ status?: string; alias?: string; user_info?: Record<string, unknown> }>;
};

function accountLabel(info: Record<string, unknown> | undefined): string | null {
  if (!info) return null;
  for (const key of ["emailAddress", "email", "login", "username", "name"]) {
    if (typeof info[key] === "string" && info[key].length > 0) return info[key] as string;
  }
  return null;
}

async function loadConnections(): Promise<OwnerDataCategory> {
  const domain = OWNER_DATA_DOMAINS_BY_ID.connections;
  if (capabilityMap().connections.state !== "ready") {
    return category(domain, { connectedAccounts: [] }, "unavailable", "unavailable", ["Connected-account metadata was unavailable when this backup was created."]);
  }
  try {
    const data = await manageConnections(
      FALLBACK_TOOLKITS.map(({ slug }) => ({ name: slug, action: "list" as const })),
      { signal: AbortSignal.timeout(5_000) },
    );
    const results = (data.results ?? {}) as Record<string, ToolkitResult>;
    const names = new Map(FALLBACK_TOOLKITS.map((toolkit) => [toolkit.slug, toolkit.name]));
    const connectedAccounts = Object.values(results).flatMap((entry) =>
      (entry.accounts ?? []).map((account) => ({
        provider: entry.toolkit ?? "unknown",
        displayName: names.get(entry.toolkit ?? "") ?? entry.toolkit ?? "Unknown provider",
        accountLabel: accountLabel(account.user_info),
        alias: account.alias ?? null,
        status: account.status ?? "unknown",
        availability: "needs_reconnection",
      })),
    );
    return category(domain, { connectedAccounts }, "metadata_only", "restorable_with_reconnection", ["Authorization and tokens are excluded. Connections require owner reconnection after restore."]);
  } catch {
    return category(domain, { connectedAccounts: [] }, "unavailable", "unavailable", ["The connection provider could not be reached; no connection metadata is claimed by this backup."]);
  }
}

async function loadSkills(context: DomainContext): Promise<OwnerDataCategory> {
  const [assignments, usage, evalRuns, evalResults] = await Promise.all([
    ownerRows(context, `SELECT agent_id,skill_name,enabled,assigned_by,created_at,updated_at FROM skill_assignments WHERE owner_id=$1 ORDER BY agent_id,skill_name`),
    ownerRows(context, `SELECT id,skill_name,agent_id,session_id,turn_id,task_run_id,occurred_at,loaded_step_index,last_accounted_step,outcome,completed_at,duration_ms,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd FROM skill_usage_events WHERE owner_id=$1 ORDER BY occurred_at,id`),
    ownerRows(context, `SELECT id,target,status,passed,failed,scored,skipped,errored,started_at,completed_at,mode,requested_count,completed_count,requested_skills,cost_usd,error FROM skill_eval_runs WHERE owner_id=$1 ORDER BY started_at,id`),
    ownerRows(context, `SELECT r.run_id,r.skill_name,r.eval_id,r.verdict,r.assertions,r.error,r.started_at,r.completed_at,r.content_hash,r.duration_ms,r.input_tokens,r.output_tokens,r.cost_usd FROM skill_eval_results r JOIN skill_eval_runs e ON e.id=r.run_id WHERE e.owner_id=$1 ORDER BY r.started_at,r.run_id,r.skill_name`),
  ]);
  const base = { assignments, usage, evalRuns, evalResults };
  if (capabilityMap().skills.state !== "ready") {
    return category(OWNER_DATA_DOMAINS_BY_ID.skills, { ...base, privateSkills: [] }, "partial", "partially_restorable", ["Private Skill contents were unavailable; assignment and evaluation metadata is included."]);
  }
  try {
    const privateSkills = (await skillStore.list()).map(({ name, description, markdown, updatedAt }) => ({ name, description, markdown, updatedAt, ownership: "owner" }));
    return category(OWNER_DATA_DOMAINS_BY_ID.skills, { ...base, privateSkills });
  } catch {
    return category(OWNER_DATA_DOMAINS_BY_ID.skills, { ...base, privateSkills: [] }, "partial", "partially_restorable", ["Private Skill storage could not be read; assignment and evaluation metadata is included."]);
  }
}

async function loadFiles(context: DomainContext): Promise<OwnerDataCategory> {
  await context.query(
    `UPDATE chat_files SET owner_id=$1 WHERE owner_id IS NULL OR owner_id='web:owner'`,
    [context.ownerId],
  );
  await context.query(`ALTER TABLE chat_files ALTER COLUMN owner_id SET NOT NULL`);
  return category(
    OWNER_DATA_DOMAINS_BY_ID.files,
    {
      chatFiles: (await ownerRows(context, `SELECT id,thread_id,filename,media_type,size_bytes,created_at FROM chat_files WHERE owner_id=$1 ORDER BY created_at,id`)).map((row) => ({ ...row, source: "chat", ownership: "owner", portability: "referenced", availability: "requires_source_storage" })),
      taskArtifacts: (await ownerRows(context, `SELECT a.id,a.task_id,a.check_id,a.specialist_role,a.kind,a.filename,a.content_type,a.size_bytes,a.sha256,a.redacted,a.created_at FROM task_artifacts a JOIN task_runs r ON r.id=a.task_id WHERE r.owner_id=$1 ORDER BY a.task_id,a.created_at,a.id`)).map((row) => ({ ...row, source: "run", ownership: "owner", portability: "referenced", availability: "requires_source_storage" })),
      computerArtifacts: (await ownerRows(context, `SELECT id,computer_session_id,action_id,run_id,kind,filename,content_type,size_bytes,sha256,created_at FROM computer_artifacts WHERE owner_id=$1 ORDER BY created_at,id`)).map((row) => ({ ...row, source: "computer", ownership: "owner", portability: "referenced", availability: "requires_source_storage" })),
    },
    "partial",
    "reference_only",
    ["Binary file contents are not embedded in v1. Metadata and checksums do not by themselves constitute a file backup."],
  );
}

async function loadBrowserProfiles(context: DomainContext): Promise<OwnerDataCategory> {
  const [profiles, grants] = await Promise.all([
    ownerRows(context, `SELECT id,agent_id,provider,status,generation,last_used_at,last_owner_takeover_at,last_authenticated_at,revoked_at,created_at,updated_at FROM persistent_browser_profiles WHERE owner_id=$1 ORDER BY created_at,id`),
    ownerRows(context, `SELECT id,profile_id,agent_id,granted_at,revoked_at FROM persistent_browser_profile_grants WHERE owner_id=$1 ORDER BY granted_at,id`),
  ]);
  return category(
    OWNER_DATA_DOMAINS_BY_ID.browser_profiles,
    {
      profiles: profiles.map((row) => ({ ...row, authentication: "requires_reconnection" })),
      grants: grants.map((row) => ({ ...row, authority: "requires_target_capability_reconciliation" })),
    },
    "metadata_only",
    "restorable_with_reconnection",
    ["Provider authentication state is excluded. A future restore must reconnect profiles and revalidate every Agent grant."],
  );
}

async function loadComputerHistory(context: DomainContext): Promise<OwnerDataCategory> {
  const [sessions, browserSessions, leases, receipts, actions] = await Promise.all([
    ownerRows(context, `SELECT id,agent_id,goal_id,goal_task_id,run_id,status,environment_type,started_at,last_activity_at,completed_at,expires_at,resource_limits,network_policy,failure_code,created_at FROM computer_sessions WHERE owner_id=$1 ORDER BY started_at,id`),
    ownerRows(context, `SELECT b.id,b.computer_session_id,b.status,b.started_at,b.last_activity_at,b.completed_at FROM browser_sessions b JOIN computer_sessions c ON c.id=b.computer_session_id WHERE c.owner_id=$1 ORDER BY b.started_at,b.id`),
    ownerRows(context, `SELECT computer_session_id,agent_id,run_id,controller,version,claimed_at,heartbeat_at,expires_at,transition_reason,updated_at,owner_input_enabled,owner_input_in_flight FROM computer_control_leases WHERE owner_id=$1 ORDER BY updated_at,computer_session_id`),
    ownerRows(context, `SELECT id,computer_session_id,agent_id,run_id,event_type,previous_controller,new_controller,control_version,requested_by,reason,created_at FROM computer_control_receipts WHERE owner_id=$1 ORDER BY created_at,id`),
    ownerRows(context, `SELECT a.id,a.computer_session_id,a.run_id,a.agent_id,a.type,a.status,a.started_at,a.completed_at,a.control_version,a.failure_code FROM computer_actions a JOIN computer_sessions c ON c.id=a.computer_session_id WHERE c.owner_id=$1 ORDER BY a.started_at,a.id`),
  ]);
  const historical = (row: OwnerDataRow) => ({ ...row, authority: "historical_only", restorableAuthority: false });
  return category(
    OWNER_DATA_DOMAINS_BY_ID.computer_history,
    {
      sessions: sessions.map(historical),
      browserSessions: browserSessions.map(historical),
      controlLeases: leases.map(historical),
      controlReceipts: receipts.map(historical),
      actions: actions.map(historical),
    },
    "metadata_only",
    "non_restorable",
    ["Computer and browser sessions, control state, and actions are audit history only. Provider sessions, checkpoints, credentials, and live control authority are excluded."],
  );
}

async function loadApprovalHistory(context: DomainContext): Promise<OwnerDataCategory> {
  const approvals = await ownerRows(context, `SELECT id,task_id,goal_id,goal_task_id,agent_id,role_id,capability_id,provider,action,action_class,binding_hash,risk,effects,estimated_cost_usd,expires_at,status,decision,decision_reason,requested_by,decided_by,requested_at,decided_at FROM task_approval_decisions WHERE owner_id=$1 ORDER BY requested_at,id`);
  return category(
    OWNER_DATA_DOMAINS_BY_ID.approval_history,
    { approvals: approvals.map((row) => ({ ...row, authority: "historical_only", restorableAuthority: false })) },
    "complete",
    "non_restorable",
    ["Approval bindings and decisions are audit history. A restore must never reactivate pending or approved execution authority."],
  );
}

export const OWNER_DATA_DOMAINS: readonly OwnerDataDomain[] = [
  { id: "profile", name: "Profile & settings", description: "Owner-facing review and delivery settings", exportable: true, restorable: false, deletable: false, sensitivity: "standard", dependencies: [], required: true, load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.profile, { reviewPreferences: await ownerRows(c, `SELECT owner_timezone,daily_brief_enabled,daily_brief_time,weekly_review_enabled,weekly_review_day,weekly_review_time,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,preferred_delivery_channel,max_proactive_pushes_per_day,daily_next_at,weekly_next_at,created_at,updated_at FROM review_delivery_preferences WHERE owner_id=$1`) }) },
  { id: "conversations", name: "Conversations", description: "Conversation history and thread metadata", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents", "goals"], required: true, load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.conversations, { conversations: await ownerRows(c, `SELECT id,title,updated_at,pinned,renamed,origin,agent_id,role_id,chat FROM web_chat_threads WHERE owner_id=$1 ORDER BY updated_at,id`), summaries: await ownerRows(c, `SELECT id,thread_id,goal_id,purpose,important_facts,decisions,open_questions,commitments,source_message_count,status,created_at,updated_at FROM thread_summaries WHERE owner_id=$1 ORDER BY created_at,id`) }) },
  { id: "goals", name: "Goals", description: "Goals, plans, milestones, tasks, dependencies, and review checkpoints", exportable: true, restorable: false, deletable: true, sensitivity: "standard", dependencies: [], required: true, load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.goals, { goals: await ownerRows(c, `SELECT id,title,description,motivation,status,priority,planning_mode,success_criteria,target_date,source,source_reference,started_at,completed_at,archived_at,created_at,updated_at FROM goals WHERE owner_id=$1 ORDER BY created_at,id`), plans: await ownerRows(c, `SELECT p.id,p.goal_id,p.version,p.status,p.summary,p.strategy,p.created_at,p.superseded_at FROM goal_plans p JOIN goals g ON g.id=p.goal_id WHERE g.owner_id=$1 ORDER BY p.goal_id,p.version`), milestones: await ownerRows(c, `SELECT m.id,m.goal_id,m.title,m.description,m.status,m.target_date,m.completed_at,m.position,m.success_criteria,m.created_at,m.updated_at FROM goal_milestones m JOIN goals g ON g.id=m.goal_id WHERE g.owner_id=$1 ORDER BY m.goal_id,m.position,m.id`), tasks: await ownerRows(c, `SELECT t.id,t.goal_id,t.milestone_id,t.parent_task_id,t.title,t.description,t.status,t.priority,t.due_at,t.assigned_to,t.required_capabilities,t.success_criteria,t.estimated_effort_minutes,t.estimated_cost_usd,t.position,t.started_at,t.completed_at,t.created_at,t.updated_at FROM goal_tasks t JOIN goals g ON g.id=t.goal_id WHERE g.owner_id=$1 ORDER BY t.goal_id,t.position,t.id`), dependencies: await ownerRows(c, `SELECT d.task_id,d.depends_on_task_id,d.created_at FROM goal_task_dependencies d JOIN goal_tasks t ON t.id=d.task_id JOIN goals g ON g.id=t.goal_id WHERE g.owner_id=$1 ORDER BY d.task_id,d.depends_on_task_id`), reviewCheckpoints: await ownerRows(c, `SELECT id,review_kind,local_period_key,timezone,period_start,period_end,last_generated_at,last_event_at,last_event_id,review_snapshot,updated_at FROM review_checkpoints WHERE owner_id=$1 ORDER BY last_generated_at,id`) }) },
  { id: "knowledge", name: "Knowledge", description: "Knowledge records, sources, provenance, and relationships", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["goals", "agents"], required: true, load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.knowledge, { sources: await ownerRows(c, `SELECT id,source_type,provider,external_id,reference_uri,author,captured_at,content_hash,snapshot_ref,created_at FROM knowledge_sources WHERE owner_id=$1 ORDER BY captured_at,id`), records: await ownerRows(c, `SELECT id,kind,title,statement,confidence,status,occurrence_count,first_seen_at,last_confirmed_at,first_observed_at,last_observed_at,test_description,decision_trigger,rationale,alternatives,decided_at,reopen_condition,subject,due_at,fulfilled_at,preference_key,preference_value,preference_scope,preference_source_type,preference_source_id,active,review_at,expires_at,generated_at,created_by_type,created_by_id,goal_id,project_ref,supersedes_id,created_at,updated_at FROM knowledge_records WHERE owner_id=$1 ORDER BY created_at,id`), provenance: await ownerRows(c, `SELECT id,knowledge_id,source_id,relation,confidence,created_at FROM knowledge_provenance_links WHERE owner_id=$1 ORDER BY created_at,id`), relationships: await ownerRows(c, `SELECT id,subject_type,subject_id,predicate,object_type,object_id,confidence,status,created_at,updated_at FROM knowledge_relationships WHERE owner_id=$1 ORDER BY created_at,id`) }) },
  { id: "memories", name: "Memory", description: "Active and archived memories with scope and provenance", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents", "goals", "runs"], required: true, load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.memories, { memories: await ownerRows(c, `SELECT id,scope_type,scope_id,content,source_type,source_id,confidence,permanent,status,created_at,updated_at,last_confirmed_at FROM memory_records WHERE owner_id=$1 AND status <> 'deleted' ORDER BY scope_type,updated_at,id`) }) },
  { id: "agents", name: "Agents", description: "Agent definitions, limits, assigned capabilities, and lifecycle history", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: [], required: true, load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.agents, { agents: await ownerRows(c, `SELECT id,name,slug,label,role,description,instructions,status,is_primary,preferred_model,reasoning_preference,avatar_config,risk_ceiling,notification_policy,max_steps,max_runtime_seconds,max_estimated_cost_usd,max_retries,created_by_type,created_by_id,created_at,updated_at,archived_at FROM agents WHERE owner_id=$1 ORDER BY is_primary DESC,name,id`), capabilities: await ownerRows(c, `SELECT agent_id,capability_id,enabled,assigned_by_type,assigned_by_id,created_at,updated_at FROM agent_capabilities WHERE owner_id=$1 ORDER BY agent_id,capability_id`), auditHistory: await ownerRows(c, `SELECT id,agent_id,event_type,actor_type,actor_id,summary,changes,created_at FROM agent_audit_events WHERE owner_id=$1 ORDER BY created_at,id`) }) },
  { id: "runs", name: "Runs & evidence", description: "Delegated runs, checks, evidence metadata, and transitions", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents", "goals"], required: true, load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.runs, { runs: await ownerRows(c, `SELECT id,kind,title,thread_id,status,status_reason,target,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,model_steps,estimated_cost_usd,goal_id,goal_task_id,agent_id,objective,expected_output,parent_task_id,source_task_id,role_id,result_summary,review_status,created_at,started_at,deadline_at,completed_at,cancelled_at,updated_at FROM task_runs WHERE owner_id=$1 ORDER BY created_at,id`), agentRuns: await ownerRows(c, `SELECT id,session_id,agent_id,thread_id,status,model_steps,estimated_cost_usd,started_at,completed_at,updated_at,executor_kind,role_id FROM agent_runs WHERE owner_id=$1 ORDER BY started_at,id`), specialists: await ownerRows(c, `SELECT s.task_id,s.role,s.label,s.status,s.attempts,s.active_session_id,s.summary,s.error,s.started_at,s.completed_at,s.updated_at FROM task_specialists s JOIN task_runs r ON r.id=s.task_id WHERE r.owner_id=$1 ORDER BY s.task_id,s.role`), acceptanceChecks: await ownerRows(c, `SELECT x.id,x.task_id,x.slug,x.label,x.specialist_role,x.environment,x.required,x.status,x.result_summary,x.checked_at,x.updated_at FROM task_acceptance_checks x JOIN task_runs r ON r.id=x.task_id WHERE r.owner_id=$1 ORDER BY x.task_id,x.slug`), milestones: await ownerRows(c, `SELECT m.id,m.task_id,m.kind,m.summary,m.metadata,m.created_at FROM task_milestones m JOIN task_runs r ON r.id=m.task_id WHERE r.owner_id=$1 ORDER BY m.task_id,m.created_at,m.id`), transitions: await ownerRows(c, `SELECT t.id,t.task_id,t.from_status,t.to_status,t.actor,t.reason,t.created_at FROM task_transitions t JOIN task_runs r ON r.id=t.task_id WHERE r.owner_id=$1 ORDER BY t.task_id,t.created_at,t.id`), contextEntries: await ownerRows(c, `SELECT id,agent_id,task_run_id,goal_id,goal_task_id,content,source_type,source_id,status,expires_at,created_at,updated_at FROM run_context_entries WHERE owner_id=$1 ORDER BY created_at,id`), contextAssemblies: await ownerRows(c, `SELECT id,agent_id,session_id,agent_run_id,thread_id,goal_id,goal_task_id,task_run_id,memory_refs,thread_summary_id,source_refs,estimated_tokens,budget,created_at FROM context_assemblies WHERE owner_id=$1 ORDER BY created_at,id`) }) },
  { id: "results", name: "Results", description: "Outcomes and their evidence links", exportable: true, restorable: false, deletable: true, sensitivity: "standard", dependencies: ["goals", "runs"], required: true, load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.results, { outcomes: await ownerRows(c, `SELECT id,goal_id,goal_task_id,run_id,status,owner_feedback,summary,rationale,occurred_at,created_at,updated_at FROM outcomes WHERE owner_id=$1 ORDER BY occurred_at,id`), evidence: await ownerRows(c, `SELECT e.outcome_id,e.evidence_type,e.evidence_id,e.created_at FROM outcome_evidence_links e JOIN outcomes o ON o.id=e.outcome_id WHERE o.owner_id=$1 ORDER BY e.outcome_id,e.created_at,e.evidence_type,e.evidence_id`) }) },
  { id: "routines", name: "Routines & schedules", description: "Reminders, routines, safe trigger definitions, and review delivery preferences", exportable: true, restorable: false, deletable: true, sensitivity: "standard", dependencies: ["results"], required: true, ownerScope: "single_owner_legacy", load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.routines, { reminders: await c.query(`SELECT id,prompt,cron,timezone,next_fire_at,status,created_at,last_fired_at,routine_name,approval_boundary,source_outcome_id FROM reminders ORDER BY created_at,id`), triggers: await c.query(`SELECT id,name,prompt,chat_id,created_at,last_fired_at,fire_count FROM webhooks ORDER BY created_at,id`) }, "partial", "partially_restorable", ["This is legacy single-owner deployment state; the underlying tables do not yet provide row-level owner isolation.", "Webhook authority is excluded. Restored schedules and triggers must remain disabled until owner review."]) },
  { id: "browser_profiles", name: "Browser profiles", description: "Persistent Browser Profile and Agent grant metadata without provider authentication state", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents"], required: false, load: loadBrowserProfiles },
  { id: "computer_history", name: "Computer history", description: "Computer and browser session, action, and control history without live provider authority", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents", "runs"], required: false, load: loadComputerHistory },
  { id: "approval_history", name: "Approval history", description: "Exact-action approval bindings, risk, expected effects, status, expiry, and decisions", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents", "goals", "runs"], required: false, load: loadApprovalHistory },
  { id: "skills", name: "Skills", description: "Private Skills, assignments, usage, and evaluation metadata", exportable: true, restorable: false, deletable: true, sensitivity: "standard", dependencies: ["agents", "runs"], required: false, load: loadSkills },
  { id: "files", name: "Files & artifacts", description: "Owner file and artifact metadata with explicit portability classification", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["conversations", "runs"], required: false, load: loadFiles },
  { id: "connections", name: "Connected apps", description: "Safe connected-account metadata without authorization credentials", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: [], required: false, load: async () => loadConnections() },
  { id: "finance", name: "Finance", description: "Owner-entered receipt and purchase records", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: [], required: false, ownerScope: "single_owner_legacy", load: async (c) => category(OWNER_DATA_DOMAINS_BY_ID.finance, { receipts: await c.query(`SELECT id,merchant,total_cents,currency,category,purchased_at,items,notes,logged_at FROM receipts ORDER BY purchased_at,id`) }, "complete", "fully_restorable", ["This is legacy single-owner deployment state; the receipts table does not yet provide row-level owner isolation."]) },
] as const;

export const OWNER_DATA_DOMAINS_BY_ID = Object.fromEntries(
  OWNER_DATA_DOMAINS.map((domain) => [domain.id, domain]),
) as Record<string, OwnerDataDomain>;

export async function loadOwnerDataDomains(ownerId: string, query: OwnerDataQuery): Promise<Record<string, OwnerDataCategory>> {
  const loaded = await Promise.all(OWNER_DATA_DOMAINS.map(async (domain) => [domain.id, await domain.load({ ownerId, query })] as const));
  return Object.fromEntries(loaded);
}

export async function ownerDataDatabaseQuery(sql: string, params: unknown[] = []): Promise<OwnerDataRow[]> {
  return (await db().query(sql, params)) as OwnerDataRow[];
}
