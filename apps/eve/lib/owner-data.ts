import { createHash } from "node:crypto";

import JSZip from "jszip";

import { db } from "@/agent/lib/receipts-db";

export const OWNER_ARCHIVE_FORMAT = "myeve-owner-archive";
export const OWNER_ARCHIVE_VERSION = 1;
export const OWNER_ARCHIVE_MAX_BYTES = 25 * 1024 * 1024;
const OWNER_ARCHIVE_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

type Row = Record<string, unknown>;
type Query = (sql: string, params?: unknown[]) => Promise<Row[]>;

export interface OwnerDataCategory {
  description: string;
  records: Record<string, Row[]>;
}

export type OwnerDataCategories = Record<string, OwnerDataCategory>;

export interface OwnerDataBundle {
  exportedAt: string;
  ownerFingerprint: string;
  categories: OwnerDataCategories;
}

export interface OwnerDataInventoryItem {
  id: string;
  name: string;
  description: string;
  restorable: boolean;
  deletable: boolean;
  sensitivity: "standard" | "sensitive";
  dependencies: string[];
  recordCount: number;
  approximateBytes: number;
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
}

export const OWNER_DATA_DOMAINS: readonly OwnerDataDomain[] = [
  { id: "profile", name: "Profile & settings", description: "Owner-facing review and delivery settings", exportable: true, restorable: false, deletable: false, sensitivity: "standard", dependencies: [] },
  { id: "conversations", name: "Conversations", description: "Conversation history and thread metadata", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents", "goals"] },
  { id: "goals", name: "Goals", description: "Goals, plans, milestones, tasks, and dependencies", exportable: true, restorable: false, deletable: true, sensitivity: "standard", dependencies: [] },
  { id: "knowledge", name: "Knowledge", description: "Knowledge records, sources, provenance, and relationships", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["goals", "agents"] },
  { id: "memories", name: "Memory", description: "Active and archived memories with scope and provenance", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents", "goals", "runs"] },
  { id: "agents", name: "Agents", description: "Agent definitions, limits, and assigned capabilities", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: [] },
  { id: "runs", name: "Runs & evidence", description: "Delegated runs, checks, approvals, evidence metadata, and transitions", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: ["agents", "goals"] },
  { id: "results", name: "Results", description: "Outcomes and their evidence links", exportable: true, restorable: false, deletable: true, sensitivity: "standard", dependencies: ["goals", "runs"] },
  { id: "routines", name: "Routines & schedules", description: "Reminders, routines, safe trigger definitions, and review delivery preferences", exportable: true, restorable: false, deletable: true, sensitivity: "standard", dependencies: ["results"] },
  { id: "skills", name: "Skills", description: "Owner skill assignments, usage, and evaluation metadata", exportable: true, restorable: false, deletable: true, sensitivity: "standard", dependencies: ["agents", "runs"] },
  { id: "finance", name: "Finance", description: "Owner-entered receipt and purchase records", exportable: true, restorable: false, deletable: true, sensitivity: "sensitive", dependencies: [] },
] as const;

interface ArchiveFileManifest {
  path: string;
  sha256: string;
  bytes: number;
  recordCount: number | null;
}

interface OwnerArchiveManifest {
  format: typeof OWNER_ARCHIVE_FORMAT;
  version: typeof OWNER_ARCHIVE_VERSION;
  createdAt: string;
  sourceTemplateVersion: string;
  schemaVersion: string;
  domains: string[];
  counts: Record<string, number>;
  checksums: Record<string, string>;
  files: ArchiveFileManifest[];
  exclusions: string[];
}

export interface OwnerArchiveValidation {
  valid: true;
  exportedAt: string;
  version: number;
  fileCount: number;
  recordCount: number;
  uncompressedBytes: number;
}

const EXCLUSIONS = [
  "Credentials and authentication tokens",
  "Web session and webhook secrets",
  "External-provider identifiers",
  "Internal blob and sandbox storage keys",
];

function portableJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === "bigint") return item.toString();
      if (item instanceof Date) return item.toISOString();
      return item;
    },
    2,
  );
}

function bytes(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function countRecords(category: OwnerDataCategory): number {
  return Object.values(category.records).reduce((total, rows) => total + rows.length, 0);
}

function markdownValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return `\`${portableJson(value).replaceAll("\n", " ")}\``;
  return String(value).replaceAll("\n", " ");
}

function humanReadableCategory(name: string, category: OwnerDataCategory): string {
  const output = [`# ${name}`, "", category.description, ""];
  for (const [recordType, records] of Object.entries(category.records)) {
    output.push(`## ${recordType.replace(/([A-Z])/g, " $1")}`, "");
    if (records.length === 0) {
      output.push("No records.", "");
      continue;
    }
    for (const [index, record] of records.entries()) {
      const heading = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : `${recordType} ${index + 1}`;
      output.push(`### ${heading}`, "");
      for (const [key, value] of Object.entries(record)) output.push(`- **${key}:** ${markdownValue(value)}`);
      output.push("");
    }
  }
  return output.join("\n");
}

async function databaseQuery(sql: string, params: unknown[] = []): Promise<Row[]> {
  return (await db().query(sql, params)) as Row[];
}

async function rows(query: Query, sql: string, ownerId: string): Promise<Row[]> {
  return await query(sql, [ownerId]);
}

/**
 * Produces the portable owner dataset through an explicit field allowlist.
 * This must never become SELECT *: new database fields may contain secrets or
 * implementation details that are unsafe and brittle to export.
 */
export async function collectOwnerData(
  ownerId: string,
  query: Query = databaseQuery,
  now = new Date(),
): Promise<OwnerDataBundle> {
  const [
    conversations,
    goals,
    goalPlans,
    goalMilestones,
    goalTasks,
    goalDependencies,
    knowledgeSources,
    knowledgeRecords,
    knowledgeProvenance,
    knowledgeRelationships,
    memories,
    agents,
    agentCapabilities,
    taskRuns,
    taskSpecialists,
    taskAcceptanceChecks,
    taskMilestones,
    taskApprovals,
    taskTransitions,
    taskArtifacts,
    outcomes,
    outcomeEvidence,
    reminders,
    webhooks,
    reviewPreferences,
    threadSummaries,
    reviewCheckpoints,
    agentAuditHistory,
    agentRuns,
    contextEntries,
    contextAssemblies,
    skillAssignments,
    skillUsage,
    skillEvalRuns,
    skillEvalResults,
    receipts,
  ] = await Promise.all([
    rows(query, `SELECT id,title,updated_at,pinned,renamed,origin,agent_id,role_id,chat FROM web_chat_threads WHERE owner_id=$1 ORDER BY updated_at,id`, ownerId),
    rows(query, `SELECT id,title,description,motivation,status,priority,planning_mode,success_criteria,target_date,source,source_reference,started_at,completed_at,archived_at,created_at,updated_at FROM goals WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT p.id,p.goal_id,p.version,p.status,p.summary,p.strategy,p.created_at,p.superseded_at FROM goal_plans p JOIN goals g ON g.id=p.goal_id WHERE g.owner_id=$1 ORDER BY p.goal_id,p.version`, ownerId),
    rows(query, `SELECT m.id,m.goal_id,m.title,m.description,m.status,m.target_date,m.completed_at,m.position,m.success_criteria,m.created_at,m.updated_at FROM goal_milestones m JOIN goals g ON g.id=m.goal_id WHERE g.owner_id=$1 ORDER BY m.goal_id,m.position,m.id`, ownerId),
    rows(query, `SELECT t.id,t.goal_id,t.milestone_id,t.parent_task_id,t.title,t.description,t.status,t.priority,t.due_at,t.assigned_to,t.required_capabilities,t.success_criteria,t.estimated_effort_minutes,t.estimated_cost_usd,t.position,t.started_at,t.completed_at,t.created_at,t.updated_at FROM goal_tasks t JOIN goals g ON g.id=t.goal_id WHERE g.owner_id=$1 ORDER BY t.goal_id,t.position,t.id`, ownerId),
    rows(query, `SELECT d.task_id,d.depends_on_task_id,d.created_at FROM goal_task_dependencies d JOIN goal_tasks t ON t.id=d.task_id JOIN goals g ON g.id=t.goal_id WHERE g.owner_id=$1 ORDER BY d.task_id,d.depends_on_task_id`, ownerId),
    rows(query, `SELECT id,source_type,provider,external_id,reference_uri,author,captured_at,content_hash,snapshot_ref,created_at FROM knowledge_sources WHERE owner_id=$1 ORDER BY captured_at,id`, ownerId),
    rows(query, `SELECT id,kind,title,statement,confidence,status,occurrence_count,first_seen_at,last_confirmed_at,first_observed_at,last_observed_at,test_description,decision_trigger,rationale,alternatives,decided_at,reopen_condition,subject,due_at,fulfilled_at,preference_key,preference_value,preference_scope,preference_source_type,preference_source_id,active,review_at,expires_at,generated_at,created_by_type,created_by_id,goal_id,project_ref,supersedes_id,created_at,updated_at FROM knowledge_records WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT id,knowledge_id,source_id,relation,confidence,created_at FROM knowledge_provenance_links WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT id,subject_type,subject_id,predicate,object_type,object_id,confidence,status,created_at,updated_at FROM knowledge_relationships WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT id,scope_type,scope_id,content,source_type,source_id,confidence,permanent,status,created_at,updated_at,last_confirmed_at FROM memory_records WHERE owner_id=$1 AND status <> 'deleted' ORDER BY scope_type,updated_at,id`, ownerId),
    rows(query, `SELECT id,name,slug,label,role,description,instructions,status,is_primary,preferred_model,reasoning_preference,avatar_config,risk_ceiling,notification_policy,max_steps,max_runtime_seconds,max_estimated_cost_usd,max_retries,created_by_type,created_by_id,created_at,updated_at,archived_at FROM agents WHERE owner_id=$1 ORDER BY is_primary DESC,name,id`, ownerId),
    rows(query, `SELECT agent_id,capability_id,enabled,assigned_by_type,assigned_by_id,created_at,updated_at FROM agent_capabilities WHERE owner_id=$1 ORDER BY agent_id,capability_id`, ownerId),
    rows(query, `SELECT id,kind,title,thread_id,status,status_reason,target,max_duration_seconds,max_specialists,max_model_steps,max_retries_per_specialist,max_estimated_cost_usd,model_steps,estimated_cost_usd,goal_id,goal_task_id,agent_id,objective,expected_output,parent_task_id,source_task_id,role_id,result_summary,review_status,created_at,started_at,deadline_at,completed_at,cancelled_at,updated_at FROM task_runs WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT s.task_id,s.role,s.label,s.status,s.attempts,s.active_session_id,s.summary,s.error,s.started_at,s.completed_at,s.updated_at FROM task_specialists s JOIN task_runs r ON r.id=s.task_id WHERE r.owner_id=$1 ORDER BY s.task_id,s.role`, ownerId),
    rows(query, `SELECT c.id,c.task_id,c.slug,c.label,c.specialist_role,c.environment,c.required,c.status,c.result_summary,c.checked_at,c.updated_at FROM task_acceptance_checks c JOIN task_runs r ON r.id=c.task_id WHERE r.owner_id=$1 ORDER BY c.task_id,c.slug`, ownerId),
    rows(query, `SELECT m.id,m.task_id,m.kind,m.summary,m.metadata,m.created_at FROM task_milestones m JOIN task_runs r ON r.id=m.task_id WHERE r.owner_id=$1 ORDER BY m.task_id,m.created_at,m.id`, ownerId),
    rows(query, `SELECT a.id,a.task_id,a.requested_by,a.prompt,a.decision,a.decided_by,a.requested_at,a.decided_at FROM task_approval_decisions a JOIN task_runs r ON r.id=a.task_id WHERE r.owner_id=$1 ORDER BY a.task_id,a.requested_at,a.id`, ownerId),
    rows(query, `SELECT t.id,t.task_id,t.from_status,t.to_status,t.actor,t.reason,t.created_at FROM task_transitions t JOIN task_runs r ON r.id=t.task_id WHERE r.owner_id=$1 ORDER BY t.task_id,t.created_at,t.id`, ownerId),
    rows(query, `SELECT a.id,a.task_id,a.check_id,a.specialist_role,a.kind,a.filename,a.content_type,a.size_bytes,a.sha256,a.redacted,a.created_at FROM task_artifacts a JOIN task_runs r ON r.id=a.task_id WHERE r.owner_id=$1 ORDER BY a.task_id,a.created_at,a.id`, ownerId),
    rows(query, `SELECT id,goal_id,goal_task_id,run_id,status,owner_feedback,summary,rationale,occurred_at,created_at,updated_at FROM outcomes WHERE owner_id=$1 ORDER BY occurred_at,id`, ownerId),
    rows(query, `SELECT e.outcome_id,e.evidence_type,e.evidence_id,e.created_at FROM outcome_evidence_links e JOIN outcomes o ON o.id=e.outcome_id WHERE o.owner_id=$1 ORDER BY e.outcome_id,e.created_at,e.evidence_type,e.evidence_id`, ownerId),
    query(`SELECT id,prompt,cron,timezone,next_fire_at,status,created_at,last_fired_at,routine_name,approval_boundary,source_outcome_id FROM reminders ORDER BY created_at,id`),
    query(`SELECT id,name,prompt,chat_id,created_at,last_fired_at,fire_count FROM webhooks ORDER BY created_at,id`),
    rows(query, `SELECT owner_timezone,daily_brief_enabled,daily_brief_time,weekly_review_enabled,weekly_review_day,weekly_review_time,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,preferred_delivery_channel,max_proactive_pushes_per_day,daily_next_at,weekly_next_at,created_at,updated_at FROM review_delivery_preferences WHERE owner_id=$1`, ownerId),
    rows(query, `SELECT id,thread_id,goal_id,purpose,important_facts,decisions,open_questions,commitments,source_message_count,status,created_at,updated_at FROM thread_summaries WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT id,review_kind,local_period_key,timezone,period_start,period_end,last_generated_at,last_event_at,last_event_id,review_snapshot,updated_at FROM review_checkpoints WHERE owner_id=$1 ORDER BY last_generated_at,id`, ownerId),
    rows(query, `SELECT id,agent_id,event_type,actor_type,actor_id,summary,changes,created_at FROM agent_audit_events WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT id,session_id,agent_id,thread_id,status,model_steps,estimated_cost_usd,started_at,completed_at,updated_at,executor_kind,role_id FROM agent_runs WHERE owner_id=$1 ORDER BY started_at,id`, ownerId),
    rows(query, `SELECT id,agent_id,task_run_id,goal_id,goal_task_id,content,source_type,source_id,status,expires_at,created_at,updated_at FROM run_context_entries WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT id,agent_id,session_id,agent_run_id,thread_id,goal_id,goal_task_id,task_run_id,memory_refs,thread_summary_id,source_refs,estimated_tokens,budget,created_at FROM context_assemblies WHERE owner_id=$1 ORDER BY created_at,id`, ownerId),
    rows(query, `SELECT agent_id,skill_name,enabled,assigned_by,created_at,updated_at FROM skill_assignments WHERE owner_id=$1 ORDER BY agent_id,skill_name`, ownerId),
    rows(query, `SELECT id,skill_name,agent_id,session_id,turn_id,task_run_id,occurred_at,loaded_step_index,last_accounted_step,outcome,completed_at,duration_ms,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd FROM skill_usage_events WHERE owner_id=$1 ORDER BY occurred_at,id`, ownerId),
    rows(query, `SELECT id,target,status,passed,failed,scored,skipped,errored,started_at,completed_at,mode,requested_count,completed_count,requested_skills,cost_usd,error FROM skill_eval_runs WHERE owner_id=$1 ORDER BY started_at,id`, ownerId),
    rows(query, `SELECT r.run_id,r.skill_name,r.eval_id,r.verdict,r.assertions,r.error,r.started_at,r.completed_at,r.content_hash,r.duration_ms,r.input_tokens,r.output_tokens,r.cost_usd FROM skill_eval_results r JOIN skill_eval_runs e ON e.id=r.run_id WHERE e.owner_id=$1 ORDER BY r.started_at,r.run_id,r.skill_name`, ownerId),
    query(`SELECT id,merchant,total_cents,currency,category,purchased_at,items,notes,logged_at FROM receipts ORDER BY purchased_at,id`),
  ]);

  return {
    exportedAt: now.toISOString(),
    ownerFingerprint: sha256(ownerId).slice(0, 16),
    categories: {
      profile: { description: "Owner-facing review and delivery settings", records: { reviewPreferences } },
      conversations: { description: "Conversation history and thread metadata", records: { conversations, summaries: threadSummaries } },
      goals: { description: "Goals, plans, milestones, tasks, dependencies, and review checkpoints", records: { goals, plans: goalPlans, milestones: goalMilestones, tasks: goalTasks, dependencies: goalDependencies, reviewCheckpoints } },
      knowledge: { description: "Knowledge records, sources, provenance, and relationships", records: { sources: knowledgeSources, records: knowledgeRecords, provenance: knowledgeProvenance, relationships: knowledgeRelationships } },
      memories: { description: "Active and archived memories with scope and provenance", records: { memories } },
      agents: { description: "Agent definitions, limits, assigned capabilities, and lifecycle history", records: { agents, capabilities: agentCapabilities, auditHistory: agentAuditHistory } },
      runs: { description: "Delegated runs, checks, approvals, evidence metadata, attribution, and context diagnostics", records: { runs: taskRuns, agentRuns, specialists: taskSpecialists, acceptanceChecks: taskAcceptanceChecks, milestones: taskMilestones, approvals: taskApprovals, transitions: taskTransitions, artifacts: taskArtifacts, contextEntries, contextAssemblies } },
      results: { description: "Outcomes and their evidence links", records: { outcomes, evidence: outcomeEvidence } },
      routines: { description: "Reminders, routines, and safe trigger definitions", records: { reminders, triggers: webhooks } },
      skills: { description: "Owner skill assignments, usage, and evaluation metadata", records: { assignments: skillAssignments, usage: skillUsage, evalRuns: skillEvalRuns, evalResults: skillEvalResults } },
      finance: { description: "Owner-entered receipt and purchase records", records: { receipts } },
    },
  };
}

export function ownerDataInventory(bundle: OwnerDataBundle): OwnerDataInventoryItem[] {
  return Object.entries(bundle.categories).map(([id, category]) => ({
    id,
    name: OWNER_DATA_DOMAINS.find((domain) => domain.id === id)?.name ?? id,
    description: category.description,
    restorable: OWNER_DATA_DOMAINS.find((domain) => domain.id === id)?.restorable ?? false,
    deletable: OWNER_DATA_DOMAINS.find((domain) => domain.id === id)?.deletable ?? false,
    sensitivity: OWNER_DATA_DOMAINS.find((domain) => domain.id === id)?.sensitivity ?? "standard",
    dependencies: OWNER_DATA_DOMAINS.find((domain) => domain.id === id)?.dependencies ?? [],
    recordCount: countRecords(category),
    approximateBytes: bytes(portableJson(category)),
  }));
}

export async function createOwnerArchive(bundle: OwnerDataBundle): Promise<Buffer> {
  const zip = new JSZip();
  const files: ArchiveFileManifest[] = [];
  const readme = [
    "# MyEve owner archive",
    "",
    `Exported: ${bundle.exportedAt}`,
    "",
    "This archive contains portable owner data. It intentionally excludes credentials,",
    "tokens, webhook secrets, provider identifiers, and internal storage keys.",
    "",
    "Use MyEve's Data Center to validate the archive before relying on it for recovery.",
    "",
  ].join("\n");
  zip.file("README.md", readme);
  files.push({ path: "README.md", sha256: sha256(readme), bytes: bytes(readme), recordCount: null });

  for (const [id, category] of Object.entries(bundle.categories)) {
    const path = `data/${id}.json`;
    const content = portableJson({ description: category.description, records: category.records });
    zip.file(path, content);
    files.push({ path, sha256: sha256(content), bytes: bytes(content), recordCount: countRecords(category) });
    const humanPath = `human/${id}.md`;
    const human = humanReadableCategory(id.replaceAll("-", " "), category);
    zip.file(humanPath, human);
    files.push({ path: humanPath, sha256: sha256(human), bytes: bytes(human), recordCount: null });
  }

  const counts = Object.fromEntries(Object.entries(bundle.categories).map(([id, category]) => [id, countRecords(category)]));
  const checksums = Object.fromEntries(files.map((file) => [file.path, file.sha256]));
  const checksumContent = portableJson(checksums);
  zip.file("checksums.json", checksumContent);
  files.push({ path: "checksums.json", sha256: sha256(checksumContent), bytes: bytes(checksumContent), recordCount: null });
  const manifest: OwnerArchiveManifest = {
    format: OWNER_ARCHIVE_FORMAT,
    version: OWNER_ARCHIVE_VERSION,
    createdAt: bundle.exportedAt,
    sourceTemplateVersion: "myeve-v1",
    schemaVersion: "0016_owner_data_operations",
    domains: Object.keys(bundle.categories),
    counts,
    checksums,
    files,
    exclusions: EXCLUSIONS,
  };
  zip.file("manifest.json", portableJson(manifest));
  return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

function parseManifest(raw: string): OwnerArchiveManifest {
  const value = JSON.parse(raw) as Partial<OwnerArchiveManifest>;
  if (
    value.format !== OWNER_ARCHIVE_FORMAT ||
    value.version !== OWNER_ARCHIVE_VERSION ||
    typeof value.createdAt !== "string" ||
    typeof value.schemaVersion !== "string" ||
    !Array.isArray(value.domains) ||
    value.checksums === null || typeof value.checksums !== "object" ||
    !Array.isArray(value.files)
  ) {
    throw new Error("This is not a supported MyEve owner archive.");
  }
  return value as OwnerArchiveManifest;
}

export async function validateOwnerArchive(input: Uint8Array): Promise<OwnerArchiveValidation> {
  if (input.byteLength === 0) throw new Error("The selected archive is empty.");
  if (input.byteLength > OWNER_ARCHIVE_MAX_BYTES) throw new Error("The selected archive is larger than 25 MB.");
  const zip = await JSZip.loadAsync(input, { checkCRC32: true });
  const manifestFile = zip.file("manifest.json");
  if (!manifestFile) throw new Error("The archive manifest is missing.");
  const manifest = parseManifest(await manifestFile.async("string"));
  if (manifest.files.length === 0 || manifest.files.length > 50) throw new Error("The archive file list is invalid.");

  let uncompressedBytes = 0;
  let recordCount = 0;
  const seen = new Set<string>();
  for (const expected of manifest.files) {
    if (
      !expected ||
      typeof expected.path !== "string" ||
      expected.path.includes("..") ||
      typeof expected.sha256 !== "string" ||
      typeof expected.bytes !== "number" ||
      seen.has(expected.path)
    ) {
      throw new Error("The archive manifest contains an invalid file entry.");
    }
    if (!expected.path.endsWith(".json") && !expected.path.endsWith(".md")) {
      throw new Error(`Archive file type is not allowed: ${expected.path}`);
    }
    seen.add(expected.path);
    const file = zip.file(expected.path);
    if (!file) throw new Error(`Archive file is missing: ${expected.path}`);
    const content = await file.async("uint8array");
    uncompressedBytes += content.byteLength;
    if (uncompressedBytes > OWNER_ARCHIVE_MAX_UNCOMPRESSED_BYTES) throw new Error("The archive expands beyond the safe validation limit.");
    if (content.byteLength !== expected.bytes || sha256(content) !== expected.sha256) {
      throw new Error(`Archive integrity check failed: ${expected.path}`);
    }
    if (typeof expected.recordCount === "number") recordCount += expected.recordCount;
  }
  const unexpected = Object.values(zip.files).find((file) => !file.dir && file.name !== "manifest.json" && !seen.has(file.name));
  if (unexpected) throw new Error(`Archive contains an unexpected file: ${unexpected.name}`);
  if (!seen.has("checksums.json") || !manifest.domains.every((domain) => seen.has(`data/${domain}.json`))) {
    throw new Error("The archive is missing required domain data or checksum metadata.");
  }

  return {
    valid: true,
    exportedAt: manifest.createdAt,
    version: manifest.version,
    fileCount: manifest.files.length,
    recordCount,
    uncompressedBytes,
  };
}

export const OWNER_DATA_RETENTION = [
  { dataClass: "Conversations, Goals, Knowledge, Agents, Results, and routines", policy: "Kept until the owner deletes or archives them." },
  { dataClass: "Active memories", policy: "Kept until the owner uses Forget; forgotten memories are excluded from exports." },
  { dataClass: "Run and approval evidence", policy: "Kept as the durable audit trail for completed or failed work." },
] as const;

export const OWNER_DATA_EXCLUSIONS = EXCLUSIONS;
