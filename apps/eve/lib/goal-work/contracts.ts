/** Server-only ports. None of these payloads is a tool/provider/budget grant. */
export interface Query {
  query(sql: string, params?: unknown[]): Promise<Record<string, any>[]>;
}
export interface GoalDatabase extends Query {
  /** One connection, READ COMMITTED, rollback on any failure. */
  transaction<T>(body: (tx: Query) => Promise<T>): Promise<T>;
}
export interface GoalContext {
  ownerId: string;
  goalId: string;
  taskId: string;
  goalGeneration: number;
  taskGeneration: number;
}
export interface WorkRequest extends GoalContext {
  correlationKey: string;
  objective: string;
  goalObjective: string;
  criteria: string[];
  requiredCapabilities: string[];
  assignedTo: string | null;
  targetAt: string | null;
  goalCriteria: string[];
  planVersion: number;
  /** Descriptive preferences only; canonical Work owns allowedRoutes and admission. */
  routeHints?: Array<
    "DIRECT" | "DEEP_AGENT" | "EXECUTOR" | "MYFACTORY" | "RELAY" | "HUMAN"
  >;
  dependencies: Array<{
    id: string;
    kind: DependencyKind;
    reference: string;
    evidenceRef: string | null;
    notBefore: string | null;
  }>;
  decisions: Array<{
    dependencyId: string;
    reference: string;
    option: string | null;
  }>;
}
export interface WorkReference {
  id: string;
  ownerId: string;
  correlationKey: string;
  state: string;
}
export interface WorkResult {
  id: string;
  ownerId: string;
  workId: string;
  correlationKey: string;
  outcome:
    | "SUCCEEDED"
    | "PARTIAL"
    | "FAILED"
    | "BLOCKED"
    | "CANCELLED"
    | "SUPERSEDED";
  current: boolean;
  verified: boolean;
  satisfiedCriteria: string[];
  evidence: string[];
  reason: string;
  satisfiedGoalCriteria?: string[];
}
export interface WorkPort {
  /** MUST persistently deduplicate the key, reject changed payloads, and recheck
   * current canonical authority/budget. This creates intent, never an executor.
   * Must be bounded; called under the Goal lock. Unknown outcomes are reconciled
   * with find before any new generation may be dispatched. */
  ensure(request: WorkRequest): Promise<WorkReference | { denied: string }>;
  find(ownerId: string, correlationKey: string): Promise<WorkReference | null>;
  /** Read authoritative Result/evidence, never accept model-authored result text. */
  result(
    ownerId: string,
    workId: string,
    resultId: string,
  ): Promise<WorkResult>;
}
export type DependencyKind =
  | "task"
  | "external"
  | "owner"
  | "schedule"
  | "file"
  | "capability"
  | "work";
export interface DependencyInput {
  id: string;
  kind: DependencyKind;
  /** Exact source-owned identity: reply thread, file requirement, provider, etc. */
  reference: string;
  label: string;
  notBefore?: string;
  options?: string[];
}
export interface DependencySignal extends GoalContext {
  eventId: string;
  dependencyId: string;
  kind: Exclude<DependencyKind, "task" | "schedule">;
  reference: string;
  evidenceRef: string;
  option?: string;
}
export interface SignalPort {
  /** Provider adapter authenticates, owner-scopes and verifies exact correlation.
   * An owner decision is obtained from the canonical Inbox decision receipt. */
  verify(signal: DependencySignal): Promise<boolean>;
}
export interface NeedsYouItem extends GoalContext {
  id: string;
  dependencyId: string;
  source: "goal-task";
  title: string;
  options: string[];
  reference: string;
  revision: number;
  updatedAt: string;
}
export interface NeedsYouPort {
  /** Upsert in Universal Inbox. Reconcile superseded items for this Goal. */
  reconcile(snapshot: {
    ownerId: string;
    goalId: string;
    revision: number;
    items: NeedsYouItem[];
  }): Promise<void>;
}
export interface ReminderPort {
  /** Existing reminder service owns timezones, recurring schedules and review.
   * Adapter must enforce owner scope and durable key deduplication. */
  ensure(input: {
    ownerId: string;
    key: string;
    goalId: string;
    taskId?: string;
    workId?: string;
    reminderId: string;
  }): Promise<void>;
}
export const unavailableWork: WorkPort = {
  async ensure() {
    return { denied: "Canonical Work adapter is not integrated." };
  },
  async find() {
    return null;
  },
  async result() {
    throw new Error("Canonical Result adapter is not integrated.");
  },
};
