import { db } from "@/agent/lib/receipts-db";
import { reconcileStaleComputerSessions } from "@/lib/computer-sessions";

export type OperatorState = "healthy" | "warning" | "critical";

export interface OperatorSignal {
  id: "failed_turns" | "stuck_runs" | "computer_sessions" | "routine_failures" | "model_limits" | "artifact_failures";
  label: string;
  count: number;
  state: OperatorState;
  detail: string;
}

export interface ProductionCanary {
  id: "chat" | "browser" | "goals" | "results" | "routines";
  label: string;
  state: "passing" | "failing";
  detail: string;
}

export interface OperatorHealthReport {
  checkedAt: string;
  overall: OperatorState;
  signals: OperatorSignal[];
  canaries: ProductionCanary[];
  cleanup: { expired: number; failedProvisioning: number; failedRunning: number };
}

type Row = Record<string, unknown>;
const count = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function signal(input: Omit<OperatorSignal, "state">, warningAt = 1, criticalAt = 5): OperatorSignal {
  return { ...input, state: input.count >= criticalAt ? "critical" : input.count >= warningAt ? "warning" : "healthy" };
}

export async function getOperatorHealth(ownerId: string): Promise<OperatorHealthReport> {
  const cleanup = await reconcileStaleComputerSessions();
  const [metrics, relations] = await Promise.all([
    db().query(
      `SELECT
        (SELECT count(*)::int FROM agent_runs WHERE owner_id=$1 AND status='failed' AND updated_at > now() - interval '24 hours') AS failed_turns,
        ((SELECT count(*)::int FROM agent_runs WHERE owner_id=$1 AND status='running' AND started_at < now() - interval '15 minutes') +
         (SELECT count(*)::int FROM task_runs WHERE owner_id=$1 AND status='running' AND deadline_at < now())) AS stuck_runs,
        (SELECT count(*)::int FROM computer_sessions WHERE owner_id=$1 AND status IN ('failed','expired') AND completed_at > now() - interval '24 hours') AS computer_sessions,
        (SELECT count(*)::int FROM review_deliveries WHERE owner_id=$1 AND status='failed' AND updated_at > now() - interval '24 hours') AS routine_failures,
        ((SELECT count(*)::int FROM computer_sessions WHERE owner_id=$1 AND failure_code='resource_limit' AND completed_at > now() - interval '24 hours') +
         (SELECT count(*)::int FROM task_runs WHERE owner_id=$1 AND status='failed' AND status_reason ~* '(limit|budget)' AND updated_at > now() - interval '24 hours')) AS model_limits,
        (SELECT count(*)::int FROM computer_actions ca JOIN computer_sessions cs ON cs.id=ca.computer_session_id
          WHERE cs.owner_id=$1 AND ca.type IN ('file.download','file.upload') AND ca.status IN ('failed','timed_out') AND ca.started_at > now() - interval '24 hours') AS artifact_failures`,
      [ownerId],
    ) as Promise<Row[]>,
    db().query(
      `SELECT unnest(ARRAY['web_chat_threads','computer_sessions','browser_sessions','goals','task_artifacts','computer_artifacts','reminders','review_deliveries']) AS name,
              unnest(ARRAY[to_regclass('public.web_chat_threads'),to_regclass('public.computer_sessions'),to_regclass('public.browser_sessions'),to_regclass('public.goals'),to_regclass('public.task_artifacts'),to_regclass('public.computer_artifacts'),to_regclass('public.reminders'),to_regclass('public.review_deliveries')]) IS NOT NULL AS present`,
    ) as Promise<Row[]>,
  ]);
  const row = metrics[0] ?? {};
  const signals = [
    signal({ id: "failed_turns", label: "Failed turns", count: count(row.failed_turns), detail: "Agent Runs that failed in the last 24 hours." }),
    signal({ id: "stuck_runs", label: "Stuck Runs", count: count(row.stuck_runs), detail: "Agent or delegated Runs beyond their execution window." }, 1, 2),
    signal({ id: "computer_sessions", label: "Computer cleanup", count: count(row.computer_sessions), detail: "Failed or expired Computer sessions closed in the last 24 hours." }, 3, 10),
    signal({ id: "routine_failures", label: "Routine failures", count: count(row.routine_failures), detail: "Failed proactive deliveries in the last 24 hours." }),
    signal({ id: "model_limits", label: "Runtime limits", count: count(row.model_limits), detail: "Runs stopped by model, cost, or browser-action limits in the last 24 hours." }),
    signal({ id: "artifact_failures", label: "Artifact delivery", count: count(row.artifact_failures), detail: "Failed or timed-out artifact transfers in the last 24 hours." }),
  ];
  const present = new Map(relations.map((item) => [String(item.name), Boolean(item.present)]));
  const canary = (id: ProductionCanary["id"], label: string, tables: string[], detail: string): ProductionCanary => ({
    id, label, state: tables.every((table) => present.get(table)) ? "passing" : "failing", detail,
  });
  const canaries = [
    canary("chat", "Chat", ["web_chat_threads"], "Conversation persistence schema is reachable."),
    canary("browser", "Browser", ["computer_sessions", "browser_sessions"], "Isolated Computer and browser ledgers are reachable; runtime provisioning remains on demand."),
    canary("goals", "Goals", ["goals"], "Goal state is reachable."),
    canary("results", "Results", ["task_artifacts", "computer_artifacts"], "Delegated and Computer artifact stores are reachable."),
    canary("routines", "Routines", ["reminders", "review_deliveries"], "Scheduling and delivery state are reachable."),
  ];
  const states = [...signals.map((item) => item.state), ...canaries.map((item) => item.state === "failing" ? "critical" as const : "healthy" as const)];
  return {
    checkedAt: new Date().toISOString(),
    overall: states.includes("critical") ? "critical" : states.includes("warning") ? "warning" : "healthy",
    signals,
    canaries,
    cleanup,
  };
}
