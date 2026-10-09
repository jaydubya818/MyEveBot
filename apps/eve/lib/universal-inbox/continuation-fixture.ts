/** Durable fake canonical authority for contract tests only; not a Work implementation. */
import { DatabaseSync } from "node:sqlite";
import { hash } from "./domain.ts";
import { continuationSchema, type CanonicalContinuationPort, type Continuation, type ContinuationReceipt } from "./continuation.ts";
export class FixtureContinuationAuthority implements CanonicalContinuationPort {
  private database: DatabaseSync;
  constructor(path = ":memory:") {
    this.database = new DatabaseSync(path);
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS work_state(owner TEXT,id TEXT,data TEXT,PRIMARY KEY(owner,id));
      CREATE TABLE IF NOT EXISTS answers(owner TEXT,id TEXT,digest TEXT,data TEXT,receipt TEXT,PRIMARY KEY(owner,id));`);
  }
  put(input: { ownerId: string; workId: string | null; goal: Continuation["goal"]; workGeneration: number | null; workVersion: number | null;
    correlationId: string; actionId: string; actionBinding: string; active: boolean; canonicalApproval?: Continuation["canonicalApproval"] }) {
    const id = input.workId ?? `goal:${input.goal!.goalId}:${input.goal!.taskId}:${input.goal!.dependencyId}`;
    this.database.prepare("INSERT INTO work_state VALUES(?,?,?) ON CONFLICT(owner,id) DO UPDATE SET data=excluded.data").run(input.ownerId, id, JSON.stringify(input));
  }
  async record(raw: Continuation): Promise<ContinuationReceipt> {
    const input = continuationSchema.parse(raw);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const prior = this.database.prepare("SELECT * FROM answers WHERE owner=? AND id=?").get(input.ownerId, input.responseId);
      if (prior) {
        if (prior.digest !== hash(input)) throw new Error("CONTINUATION_RESPONSE_CONFLICT");
        this.database.exec("COMMIT"); return JSON.parse(String(prior.receipt));
      }
      const id = input.workId ?? `goal:${input.goal!.goalId}:${input.goal!.taskId}:${input.goal!.dependencyId}`;
      const row = this.database.prepare("SELECT data FROM work_state WHERE owner=? AND id=?").get(input.ownerId, id);
      const state = row ? JSON.parse(String(row.data)) : null;
      const valid = state?.active && state.workGeneration === input.workGeneration && state.workVersion === input.workVersion
        && hash(state.goal) === hash(input.goal) && state.correlationId === input.correlationId && state.actionId === input.actionId
        && state.actionBinding === input.actionBinding && (input.decisionClass !== "APPROVAL" || hash(state.canonicalApproval ?? null) === hash(input.canonicalApproval));
      const result: ContinuationReceipt = { status: valid ? "accepted" : "stale", receipt: `fixture:${valid ? "eligible" : "stale"}:${input.responseId}` };
      this.database.prepare("INSERT INTO answers VALUES(?,?,?,?,?)").run(input.ownerId, input.responseId, hash(input), JSON.stringify(input), JSON.stringify(result));
      this.database.exec("COMMIT"); return result;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
  receipts(owner: string) { return this.database.prepare("SELECT data,receipt FROM answers WHERE owner=? ORDER BY id").all(owner).map(row => ({ input: JSON.parse(String(row.data)) as Continuation, result: JSON.parse(String(row.receipt)) as ContinuationReceipt })); }
  close() { this.database.close(); }
}
