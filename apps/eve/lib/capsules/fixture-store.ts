/** Local qualification adapter only. Never used as canonical Memory persistence. */
import { DatabaseSync } from "node:sqlite";
import { freshDestination, FIXTURE_OWNER } from "./fixtures";
import type { CapsuleDestinationAdapter, Destination, PreparedImport } from "./import";
import { CapsuleError } from "./schema";

export type FixturePhase = "after_begin" | "after_records" | "before_commit" | "after_commit";
export class FixtureDestination implements CapsuleDestinationAdapter {
  private database: DatabaseSync;
  constructor(path: string, ownerId = FIXTURE_OWNER, private checkpoint?: (phase: FixturePhase) => void) {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS capsule_fixture (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS capsule_receipts (id TEXT PRIMARY KEY, count INTEGER NOT NULL);");
    this.database.prepare("INSERT OR IGNORE INTO capsule_fixture VALUES (1, ?)").run(JSON.stringify(freshDestination(ownerId)));
    const state = this.read();
    if (state.ownerRef !== freshDestination(ownerId).ownerRef) { this.close(); throw new CapsuleError("fixture_owner", "This qualification fixture belongs to a different owner."); }
  }
  private read(): Destination {
    const row = this.database.prepare("SELECT data FROM capsule_fixture WHERE id=1").get() as { data: string };
    return JSON.parse(row.data) as Destination;
  }
  async snapshot(): Promise<Destination> { return this.read(); }
  async commit(batch: PreparedImport) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.checkpoint?.("after_begin");
      const receipt = this.database.prepare("SELECT count FROM capsule_receipts WHERE id=?").get(batch.id) as { count: number } | undefined;
      if (receipt) { this.database.exec("ROLLBACK"); return { id: batch.id, count: receipt.count, result: "staged" as const, duplicate: true }; }
      const state = this.read();
      if (state.revision !== batch.expectedRevision) throw new CapsuleError("stale_preview", "Destination changed; review the import again.");
      state.imported.push(...batch.records);
      state.revision = String(Number(state.revision) + 1);
      this.database.prepare("UPDATE capsule_fixture SET data=? WHERE id=1").run(JSON.stringify(state));
      this.checkpoint?.("after_records");
      this.database.prepare("INSERT INTO capsule_receipts VALUES (?, ?)").run(batch.id, batch.records.length);
      this.checkpoint?.("before_commit");
      this.database.exec("COMMIT");
      this.checkpoint?.("after_commit");
      return { id: batch.id, count: batch.records.length, result: "staged" as const, duplicate: false };
    } catch (error) { try { this.database.exec("ROLLBACK"); } catch { /* COMMIT may already have completed. Retry reads its receipt. */ } throw error; }
  }
  seedCurrent(items: Destination["current"]) {
    const state = this.read(); state.current = items; state.revision = String(Number(state.revision) + 1);
    this.database.prepare("UPDATE capsule_fixture SET data=? WHERE id=1").run(JSON.stringify(state));
  }
  /** Deterministic retrieval fixture, not agent execution or instruction activation. */
  retrieveForNewWork(projectId?: string) {
    const state = this.read();
    return state.imported.filter(record => {
      const inScope = record.targetScope.type === "agent" || record.targetScope.type === "project" && record.targetScope.id === projectId;
      const hasCurrentTruth = state.current.some(current => current.kind === record.item.kind && current.key === record.item.key && (
        current.scope.type === "owner" && record.targetScope.type === "agent" ||
        current.scope.type === record.targetScope.type && current.scope.id === record.targetScope.id
      ));
      return record.state === "reviewed_context" && record.targetEveRef === state.eveRef && inScope && !hasCurrentTruth;
    });
  }
  close() { this.database.close(); }
}
