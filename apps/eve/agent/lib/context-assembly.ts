import { randomUUID } from "node:crypto";

import type { ModelMessage } from "ai";

import { getAgent, type AgentView } from "../../lib/agents.ts";
import {
  applyContextBudget,
  DEFAULT_CONTEXT_BUDGET,
  type ContextBudget,
  type ContextItem,
} from "../../lib/memory-scopes.ts";
import { db } from "./receipts-db.ts";
import { memoryStore, type MemoryAccessContext } from "./memory-store.ts";

type Row = Record<string, unknown>;

export interface KnowledgeProvider {
  context(input: { ownerId: string; agentId: string; query: string }): Promise<ContextItem[]>;
}

export interface ProjectScopeProvider {
  authorize(input: { ownerId: string; agentId: string; projectId: string }): Promise<boolean>;
}

export interface AssembleContextInput {
  ownerId: string;
  agentId: string;
  sessionId: string;
  threadId?: string | null;
  goalId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  projectId?: string | null;
  recentConversation?: string;
  budget?: ContextBudget;
  knowledgeProvider?: KnowledgeProvider;
  projectScopeProvider?: ProjectScopeProvider;
}

export interface AssembledContext {
  markdown: string;
  agent: AgentView;
  goalId: string | null;
  taskId: string | null;
  runId: string | null;
  memoryRefs: string[];
  threadSummaryRef: string | null;
  sourceRefs: string[];
  estimatedTokens: number;
  excludedRefs: string[];
  overBudget: boolean;
}

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function nullableText(value: unknown): string | null { return value == null ? null : text(value); }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }

function messageText(message: ModelMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content.map((part) => "text" in part && typeof part.text === "string" ? part.text : "").filter(Boolean).join("\n");
}

export function recentConversationContext(messages: readonly ModelMessage[], maxCharacters = 6_000): string {
  const lines = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const value = messageText(message).trim();
      if (!value || value.startsWith("Client context:\n")) return "";
      return `${message.role === "user" ? "Owner" : "Agent"}: ${value}`;
    })
    .filter(Boolean);
  const joined = lines.slice(-8).join("\n");
  return joined.length <= maxCharacters ? joined : `…${joined.slice(-maxCharacters)}`;
}

async function executionLinks(input: AssembleContextInput): Promise<{ goalId: string | null; taskId: string | null; runId: string | null }> {
  const runRows = await db().query(
    `SELECT r.id,r.goal_id,r.goal_task_id
     FROM task_runs r LEFT JOIN task_run_sessions s ON s.task_id=r.id
     WHERE r.owner_id=$1 AND (
       ($2::text IS NOT NULL AND r.id=$2) OR s.session_id=$3 OR
       ($4::text IS NOT NULL AND r.thread_id=$4 AND r.agent_id=$5)
     ) ORDER BY CASE WHEN r.id=$2 THEN 0 WHEN s.session_id=$3 THEN 1 ELSE 2 END,r.updated_at DESC LIMIT 1`,
    [input.ownerId, input.runId ?? null, input.sessionId, input.threadId ?? null, input.agentId],
  ) as Row[];
  const run = runRows[0];
  let runId = run ? text(run.id) : input.runId ?? null;
  let goalId = input.goalId ?? (run ? nullableText(run.goal_id) : null);
  let taskId = input.taskId ?? (run ? nullableText(run.goal_task_id) : null);

  if (!goalId && input.threadId) {
    const rows = await db().query(
      `SELECT g.id FROM goal_thread_links l JOIN goals g ON g.owner_id=l.owner_id AND g.id=l.goal_id
       WHERE l.owner_id=$1 AND l.thread_id=$2 AND g.status NOT IN ('archived','abandoned')
       ORDER BY g.updated_at DESC LIMIT 2`,
      [input.ownerId, input.threadId],
    ) as Row[];
    if (rows.length === 1) goalId = text(rows[0].id);
  }
  if (taskId?.startsWith("task_")) runId ??= taskId;

  if (goalId) {
    const rows = await db().query(`SELECT id FROM goals WHERE owner_id=$1 AND id=$2 LIMIT 1`, [input.ownerId, goalId]);
    if (!rows[0]) throw new Error("Goal does not belong to the current owner.");
  }
  if (runId) {
    const rows = await db().query(`SELECT id,goal_id,goal_task_id FROM task_runs WHERE owner_id=$1 AND id=$2 LIMIT 1`, [input.ownerId, runId]) as Row[];
    if (!rows[0]) throw new Error("Run does not belong to the current owner.");
    goalId ??= nullableText(rows[0].goal_id);
    taskId ??= nullableText(rows[0].goal_task_id);
  }
  if (!taskId && goalId) {
    const rows = await db().query(
      `SELECT t.id FROM goal_tasks t JOIN goals g ON g.id=t.goal_id
       WHERE g.owner_id=$1 AND t.goal_id=$2 AND t.assigned_to=$3
         AND t.status IN ('ready','in_progress','waiting','blocked','verification')
       ORDER BY CASE WHEN t.status='in_progress' THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 2`,
      [input.ownerId, goalId, input.agentId],
    ) as Row[];
    if (rows.length === 1) taskId = text(rows[0].id);
  }
  if (taskId?.startsWith("gtask_")) {
    const rows = await db().query(
      `SELECT t.id,t.goal_id FROM goal_tasks t JOIN goals g ON g.id=t.goal_id WHERE g.owner_id=$1 AND t.id=$2 LIMIT 1`,
      [input.ownerId, taskId],
    ) as Row[];
    if (!rows[0]) throw new Error("Task does not belong to the current owner.");
    if (goalId && text(rows[0].goal_id) !== goalId) throw new Error("Task does not belong to the current Goal.");
    goalId ??= text(rows[0].goal_id);
  }
  return { goalId, taskId, runId };
}

async function goalItem(ownerId: string, goalId: string | null): Promise<ContextItem | null> {
  if (!goalId) return null;
  const rows = await db().query(
    `SELECT id,title,description,motivation,status,priority,success_criteria,target_date
     FROM goals WHERE owner_id=$1 AND id=$2 LIMIT 1`,
    [ownerId, goalId],
  ) as Row[];
  const row = rows[0];
  if (!row) return null;
  return {
    id: `goal:${goalId}`, kind: "Current Goal", tier: "hot", mandatory: true, score: 1_000,
    content: [
      `${text(row.title)} [${text(row.status)}; ${text(row.priority)} priority]`,
      text(row.description), text(row.motivation),
      stringArray(row.success_criteria).length ? `Success criteria: ${stringArray(row.success_criteria).join("; ")}` : "",
      row.target_date ? `Target: ${text(row.target_date).slice(0, 10)}` : "",
    ].filter(Boolean).join("\n"),
  };
}

async function taskItem(ownerId: string, taskId: string | null, runId: string | null): Promise<ContextItem | null> {
  if (taskId?.startsWith("gtask_")) {
    const rows = await db().query(
      `SELECT t.id,t.title,t.description,t.status,t.priority,t.required_capabilities,t.success_criteria
       FROM goal_tasks t JOIN goals g ON g.id=t.goal_id WHERE g.owner_id=$1 AND t.id=$2 LIMIT 1`,
      [ownerId, taskId],
    ) as Row[];
    const row = rows[0];
    if (row) return {
      id: `task:${taskId}`, kind: "Current Task", tier: "hot", mandatory: true, score: 1_100,
      content: [`${text(row.title)} [${text(row.status)}; ${text(row.priority)} priority]`, text(row.description),
        `Required capabilities: ${stringArray(row.required_capabilities).join(", ") || "none"}`,
        `Success criteria: ${stringArray(row.success_criteria).join("; ") || "not specified"}`].filter(Boolean).join("\n"),
    };
  }
  if (!runId) return null;
  const rows = await db().query(
    `SELECT id,title,status,status_reason,target,max_duration_seconds,max_model_steps,max_estimated_cost_usd
     FROM task_runs WHERE owner_id=$1 AND id=$2 LIMIT 1`,
    [ownerId, runId],
  ) as Row[];
  const row = rows[0];
  return row ? {
    id: `run:${runId}`, kind: "Current Task / Run", tier: "hot", mandatory: true, score: 1_100,
    content: [`${text(row.title)} [${text(row.status)}]`, nullableText(row.status_reason),
      `Target: ${JSON.stringify(row.target ?? {})}`,
      `Constraints: ${text(row.max_duration_seconds)}s, ${text(row.max_model_steps)} steps, $${text(row.max_estimated_cost_usd)} estimated cost`].filter(Boolean).join("\n"),
  } : null;
}

async function summaryItem(ownerId: string, threadId: string | null | undefined): Promise<{ item: ContextItem; id: string } | null> {
  if (!threadId) return null;
  const rows = await db().query(
    `SELECT id,purpose,important_facts,decisions,open_questions,commitments
     FROM thread_summaries WHERE owner_id=$1 AND thread_id=$2 AND status='active' ORDER BY updated_at DESC LIMIT 1`,
    [ownerId, threadId],
  ) as Row[];
  const row = rows[0];
  if (!row) return null;
  const content = [
    text(row.purpose),
    `Important facts: ${stringArray(row.important_facts).join("; ") || "none"}`,
    `Decisions: ${stringArray(row.decisions).join("; ") || "none"}`,
    `Open questions: ${stringArray(row.open_questions).join("; ") || "none"}`,
    `Commitments: ${stringArray(row.commitments).join("; ") || "none"}`,
  ].filter(Boolean).join("\n");
  return { id: text(row.id), item: { id: `thread-summary:${text(row.id)}`, kind: "Thread Summary", tier: "warm", score: 250, content } };
}

async function runContextItems(ownerId: string, agentId: string, runId: string | null): Promise<ContextItem[]> {
  if (!runId) return [];
  const rows = await db().query(
    `SELECT id,content,updated_at FROM run_context_entries
     WHERE owner_id=$1 AND agent_id=$2 AND task_run_id=$3 AND status='active'
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY updated_at DESC LIMIT 20`,
    [ownerId, agentId, runId],
  ) as Row[];
  return rows.map((row) => ({ id: `run-context:${text(row.id)}`, kind: "Task / Run Context", tier: "hot", score: 700, content: text(row.content) }));
}

function agentInstructions(agent: AgentView): ContextItem {
  return {
    id: `agent:${agent.id}`, kind: "Agent Instructions", tier: "hot", mandatory: true, score: 1_200,
    content: [
      `You are ${agent.name}. Your role is ${agent.role}.`, agent.description, agent.instructions,
      `Status: ${agent.status}. Risk ceiling: ${agent.riskCeiling}.`,
      `Authorized capabilities: ${agent.isPrimary ? "deployment capabilities" : agent.capabilities.filter((capability) => capability.enabled).map((capability) => capability.id).join(", ") || "none"}.`,
      agent.isPrimary ? "" : "Use only explicitly assigned capabilities. Never borrow another Agent's tools or memory.",
    ].filter(Boolean).join("\n\n"),
  };
}

export async function assembleContext(input: AssembleContextInput): Promise<AssembledContext> {
  const agent = await getAgent(input.ownerId, input.agentId);
  if (!agent) throw new Error("Agent does not belong to the current owner.");
  if (agent.status !== "active") throw new Error(`${agent.name} is ${agent.status} and cannot execute new work.`);
  if (input.threadId) {
    const threads = await db().query(
      `SELECT agent_id FROM web_chat_threads WHERE owner_id=$1 AND id=$2 LIMIT 1`,
      [input.ownerId, input.threadId],
    ) as Row[];
    if (!threads[0]) throw new Error("Thread does not belong to the current owner.");
    const boundAgentId = nullableText(threads[0].agent_id);
    if (boundAgentId && boundAgentId !== input.agentId) throw new Error("Thread is assigned to another Agent.");
  }
  if (input.projectId && !(await input.projectScopeProvider?.authorize({ ownerId: input.ownerId, agentId: input.agentId, projectId: input.projectId }))) {
    throw new Error("Project scope is unavailable until a Project authorization provider is installed.");
  }

  const links = await executionLinks(input);
  const memoryContext: MemoryAccessContext = {
    ownerId: input.ownerId, agentId: input.agentId, goalId: links.goalId,
    taskId: links.taskId ?? links.runId, projectId: input.projectId ?? null,
  };
  const query = input.recentConversation?.trim() || "current goals, preferences, and active work";
  const [goal, task, summary, temporary, memories, knowledge] = await Promise.all([
    goalItem(input.ownerId, links.goalId),
    taskItem(input.ownerId, links.taskId, links.runId),
    summaryItem(input.ownerId, input.threadId),
    runContextItems(input.ownerId, input.agentId, links.runId),
    memoryStore.search(query.slice(-500), memoryContext).catch(() => []),
    input.knowledgeProvider?.context({ ownerId: input.ownerId, agentId: input.agentId, query }).catch(() => []) ?? Promise.resolve([]),
  ]);

  const items: ContextItem[] = [
    agentInstructions(agent),
    ...(goal ? [goal] : []),
    ...(task ? [task] : []),
    ...temporary,
    ...(input.recentConversation ? [{ id: "conversation:recent", kind: "Recent Conversation", tier: "hot" as const, score: 650, content: input.recentConversation }] : []),
    ...(summary ? [summary.item] : []),
    ...memories.map((memory, index) => ({
      id: `memory:${memory.id}`, kind: `${memory.scope.type[0].toUpperCase()}${memory.scope.type.slice(1)} Memory`,
      tier: "warm" as const, score: 600 - index, content: memory.content,
    })),
    ...knowledge,
  ];
  const budgeted = applyContextBudget(items, input.budget ?? DEFAULT_CONTEXT_BUDGET);
  const markdown = budgeted.included.map((item) => `## ${item.kind}\n\n${item.content}`).join("\n\n");
  const memoryRefs = budgeted.included.filter((item) => item.id.startsWith("memory:")).map((item) => item.id.slice(7));
  const sourceRefs = budgeted.included.map((item) => item.id);
  const assemblyId = `context_${randomUUID()}`;
  await db().query(
    `INSERT INTO context_assemblies
      (id,owner_id,agent_id,session_id,agent_run_id,thread_id,goal_id,goal_task_id,task_run_id,memory_refs,thread_summary_id,source_refs,estimated_tokens,budget)
     VALUES ($1,$2,$3,$4,(SELECT id FROM agent_runs WHERE owner_id=$2 AND session_id=$4 ORDER BY updated_at DESC LIMIT 1),$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13::jsonb)`,
    [assemblyId, input.ownerId, input.agentId, input.sessionId, input.threadId ?? null, links.goalId, links.taskId?.startsWith("gtask_") ? links.taskId : null,
      links.runId, JSON.stringify(memoryRefs), summary?.id ?? null, JSON.stringify(sourceRefs), budgeted.estimatedTokens,
      JSON.stringify(input.budget ?? DEFAULT_CONTEXT_BUDGET)],
  );
  return {
    markdown, agent, goalId: links.goalId, taskId: links.taskId, runId: links.runId, memoryRefs,
    threadSummaryRef: summary?.id ?? null, sourceRefs, estimatedTokens: budgeted.estimatedTokens,
    excludedRefs: budgeted.excluded.map((item) => item.id), overBudget: budgeted.overBudget,
  };
}
