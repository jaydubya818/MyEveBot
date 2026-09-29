import { z } from "zod";
import type { BetaIntegration } from "../beta-integration/runtime.ts";
import type { GoalConnection } from "../goal-work/database.ts";
import {
  canonicalJson,
  digest,
  exportCapsule,
  exportPreview,
  ownerReference,
  validateItem,
  inspectCapsule,
} from "./format";
import {
  prepareImport,
  previewImport,
  decisionsSchema,
  type Destination,
  type StagedRecord,
} from "./import";
import { CapsuleError, type CapsuleItem, type ExportCandidate } from "./schema";
import { assertNoSecrets } from "../total-recall/learning.ts";

const eveId = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : String(value);
type Row = Record<string, any>;
const memoryRevision = (row: Row) =>
  digest({
    ...row,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
    last_confirmed_at: row.last_confirmed_at
      ? iso(row.last_confirmed_at)
      : null,
  });
/** The alpha adapter writes canonical Memory, not a parallel recall store.
 * Only owner-approved personal memories activate. Behavior and scoped experience
 * remain staged with their original version and provenance intact. */
export class CanonicalCapsules {
  constructor(
    readonly beta: BetaIntegration,
    readonly owner: string,
    readonly eve: string,
  ) {
    eveId.parse(eve);
  }
  private async locked<T>(body: (c: GoalConnection) => Promise<T>): Promise<T> {
    return this.beta.transaction(async (c) => {
      // Deliberately coarse for a two-person alpha: canonical Memory writers also
      // acquire PostgreSQL row-exclusive table locks, so no cooperating-lock assumption.
      await c.query(
        "LOCK TABLE memory_records, capsule_memory_policy, capsule_memory_receipts IN SHARE ROW EXCLUSIVE MODE",
      );
      const agents = await c.query(
        "SELECT id FROM agents WHERE owner_id=$1 AND id=$2 AND status='active' FOR SHARE",
        [this.owner, this.eve],
      );
      if (!agents.rows.length)
        throw new CapsuleError(
          "destination",
          "Configure this Eve's active owner Agent before using Capsules.",
        );
      return body(c);
    });
  }
  private async state(c: GoalConnection) {
    const memories = (
      await c.query(
        `SELECT * FROM memory_records WHERE owner_id=$1 AND status='active'
      AND ((scope_type='owner' AND scope_id=$1) OR (scope_type='agent' AND scope_id=$2)) ORDER BY id LIMIT 1001`,
        [this.owner, this.eve],
      )
    ).rows;
    if (memories.length > 1000)
      throw new CapsuleError(
        "capacity",
        "Review a smaller Memory collection before using Capsules.",
      );
    const receipts = (
      await c.query(
        "SELECT * FROM capsule_memory_receipts WHERE owner_id=$1 AND eve_id=$2 ORDER BY id",
        [this.owner, this.eve],
      )
    ).rows;
    const policies = (
      await c.query(
        "SELECT * FROM capsule_memory_policy WHERE owner_id=$1 ORDER BY memory_id,destination_eve_id",
        [this.owner],
      )
    ).rows;
    const imported: StagedRecord[] = receipts
      .filter((r) => r.result === "active")
      .flatMap((r) => r.records);
    const current = memories.map((row) => {
      const original = imported.find((r) => this.memoryId(r) === row.id)?.item;
      return this.item(row, original);
    });
    const snapshot: Destination = {
      ownerRef: ownerReference(this.owner),
      eveRef: this.eve,
      projectIds: [],
      revision: digest({
        memories: memories.map((r) => ({
          ...r,
          created_at: iso(r.created_at),
          updated_at: iso(r.updated_at),
          last_confirmed_at: r.last_confirmed_at
            ? iso(r.last_confirmed_at)
            : null,
        })),
        receipts,
      }),
      current,
      imported,
      supportedKinds: [
        "memory",
        "preference",
        "knowledge",
        "skill",
        "role",
        "pack",
        "procedure",
        "learning",
        "example",
        "file",
      ],
    };
    return { memories, receipts, policies, current, snapshot };
  }
  private item(row: Row, original?: CapsuleItem): CapsuleItem {
    return validateItem({
      ...(original ?? {}),
      id: original?.id ?? digest({ canonicalMemoryId: row.id }),
      kind: original?.kind ?? "memory",
      key: original?.key ?? `memory-${digest(row.id).slice(7, 31)}`,
      title: original?.title ?? String(row.content).slice(0, 120),
      text: row.content,
      version: original?.version ?? "1.0.0",
      scope: {
        type: row.scope_type,
        id:
          row.scope_type === "owner"
            ? ownerReference(this.owner)
            : row.scope_id,
      },
      privacy: "private",
      provenance: original?.provenance ?? {
        sourceRef: digest({ canonicalMemoryId: row.id }),
        sourceType: "owner_statement",
        revision: iso(row.updated_at),
        observedAt: iso(row.updated_at),
        policyRef: "canonical-personal-memory-v1",
      },
    });
  }
  private memoryId(record: StagedRecord) {
    return `memory_capsule_${digest({ owner: this.owner, eve: this.eve, kind: record.item.kind, key: record.item.key }).slice(7)}`;
  }
  private candidates(
    state: Awaited<ReturnType<CanonicalCapsules["state"]>>,
    destination: string,
  ): ExportCandidate[] {
    return state.memories
      .filter(
        (r) =>
          r.scope_type === "owner" &&
          ["explicit", "owner_correction"].includes(r.source_type),
      )
      .map((row) => {
        const item = this.item(row);
        const approved = state.policies.some(
          (p) =>
            p.memory_id === row.id &&
            p.item_digest === digest(item) &&
            p.destination_eve_id === destination,
        );
        return {
          item,
          policy: {
            ownerRef: ownerReference(this.owner),
            classification: "personal",
            portability: approved ? "allowed" : "unknown",
            sourceCategory: "experience",
            state: "active",
          },
        };
      });
  }
  async catalog(destination: string) {
    return this.locked(async (c) => {
      const state = await this.state(c);
      return {
        mode: "canonical" as const,
        eveRef: this.eve,
        candidates: this.candidates(state, destination).map((candidate) => ({
          id: candidate.item.id,
          title: candidate.item.title,
          content: candidate.item.text,
          kind: candidate.item.kind,
          scope: "owner",
          itemDigest: digest(candidate.item),
          eligible: candidate.policy.portability === "allowed",
          canApprove: true,
          reason:
            candidate.policy.portability === "allowed"
              ? "Approved personal Memory for the selected Eve."
              : "Confirm this exact Memory is personal and portable before export.",
        })),
        reviews: state.receipts.map((r) => ({
          id: r.id,
          count: r.records.length,
          activeCount: r.memory_ids.length,
          result: r.result,
          createdAt: iso(r.created_at),
        })),
      };
    });
  }
  async approve(input: {
    memoryId: string;
    itemDigest: string;
    destinationEveRef: string;
    personal: true;
  }) {
    eveId.parse(input.destinationEveRef);
    if (input.destinationEveRef === this.eve || input.personal !== true)
      throw new CapsuleError(
        "policy",
        "Choose another private Eve and explicitly confirm personal experience.",
      );
    return this.locked(async (c) => {
      const state = await this.state(c),
        candidate = this.candidates(state, input.destinationEveRef).find(
          (r) => r.item.id === input.memoryId,
        );
      if (!candidate || digest(candidate.item) !== input.itemDigest)
        throw new CapsuleError(
          "stale_policy",
          "Memory changed. Review its current content before approving portability.",
        );
      assertNoSecrets(candidate.item.text);
      const memory = state.memories.find(
        (row) => this.item(row).id === input.memoryId,
      );
      if (!memory)
        throw new CapsuleError("source", "Source Memory unavailable.");
      await c.query(
        `INSERT INTO capsule_memory_policy(owner_id,memory_id,item_digest,destination_eve_id) VALUES($1,$2,$3,$4)
        ON CONFLICT(owner_id,memory_id,destination_eve_id) DO UPDATE SET item_digest=excluded.item_digest,approved_at=now()`,
        [this.owner, memory.id, input.itemDigest, input.destinationEveRef],
      );
      return { approved: true };
    });
  }
  async export(
    destination: string,
    selected: string[],
    reviewedDigest?: string,
  ) {
    eveId.parse(destination);
    if (destination === this.eve)
      throw new CapsuleError("destination", "Choose another private Eve.");
    return this.locked(async (c) => {
      const candidates = this.candidates(await this.state(c), destination),
        ownerRef = ownerReference(this.owner);
      const preview = exportPreview(candidates, selected, ownerRef);
      // Bind the review to its destination as well as exact source revisions and selection.
      const bound = digest({
        review: preview.reviewDigest,
        destination,
        ownerRef,
      });
      if (reviewedDigest === undefined)
        return { ...preview, reviewDigest: bound };
      if (reviewedDigest !== bound)
        throw new CapsuleError(
          "stale_preview",
          "Source or destination changed. Review the export again.",
        );
      const capsule = exportCapsule({
        candidates,
        selectedIds: selected,
        reviewedDigest: preview.reviewDigest,
        ownerRef,
        eveRef: this.eve,
      });
      const raw = canonicalJson(capsule);
      return { raw, bytes: Buffer.byteLength(raw), digest: capsule.digest };
    });
  }
  async preview(raw: string) {
    return this.locked(async (c) =>
      previewImport(raw, (await this.state(c)).snapshot),
    );
  }
  async import(raw: string, reviewedDigest: string, choices: unknown) {
    const capsule = inspectCapsule(raw),
      decisions = decisionsSchema.parse(choices);
    if (capsule.manifest.source.ownerRef !== ownerReference(this.owner))
      throw new CapsuleError(
        "cross_owner",
        "Use the same independently authenticated owner on both Eves.",
      );
    const id = `capsule_${digest({ owner: ownerReference(this.owner), eve: this.eve, capsule: capsule.digest, decisions: [...decisions].sort((a, b) => (a.id < b.id ? -1 : 1)) }).slice(7)}`;
    const requestDigest = digest({
      raw,
      decisions: [...decisions].sort((a, b) => (a.id < b.id ? -1 : 1)),
    });
    return this.locked(async (c) => {
      const state = await this.state(c),
        prior = state.receipts.find((r) => r.id === id);
      if (prior) {
        if (prior.request_digest !== requestDigest)
          throw new CapsuleError("replay", "Import request changed.");
        return this.receipt(prior, true);
      }
      const batch = prepareImport(
        raw,
        state.snapshot,
        reviewedDigest,
        decisions,
      );
      if (state.receipts.length >= 100)
        throw new CapsuleError(
          "capacity",
          "This Eve has reached the alpha import limit.",
        );
      const active = batch.records.filter(
        (r) =>
          r.state === "reviewed_context" &&
          ["memory", "preference"].includes(r.item.kind) &&
          r.item.scope.type === "owner",
      );
      const memoryIds = [];
      for (const record of active) {
        if (record.item.text.length > 4000)
          throw new CapsuleError(
            "size",
            "Personal Memory must be at most 4,000 characters.",
          );
        assertNoSecrets(record.item.text);
        const memoryId = this.memoryId(record);
        // A retired or later-corrected import must never resurrect through a new Capsule.
        const old = await c.query(
          "SELECT id FROM memory_records WHERE owner_id=$1 AND id=$2",
          [this.owner, memoryId],
        );
        if (old.rows.length)
          throw new CapsuleError(
            "retired",
            "This experience has import history. Review its current Memory instead of reactivating it.",
          );
        const row = (
          await c.query(
            `INSERT INTO memory_records(id,owner_id,scope_type,scope_id,content,provider,source_type,source_id,confidence,status)
          VALUES($1,$2,'agent',$3,$4,'local','capsule_import',$5,0.5,'active') RETURNING *`,
            [memoryId, this.owner, this.eve, record.item.text, id],
          )
        ).rows[0];
        memoryIds.push({
          id: memoryId,
          content: record.item.text,
          updatedAt: iso(row.updated_at),
          recordDigest: memoryRevision(row),
        });
      }
      await c.query(
        `INSERT INTO capsule_memory_receipts(owner_id,eve_id,id,capsule_digest,request_digest,records,memory_ids,result)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'active')`,
        [
          this.owner,
          this.eve,
          id,
          capsule.digest,
          requestDigest,
          JSON.stringify(batch.records),
          JSON.stringify(memoryIds),
        ],
      );
      return this.receipt(
        { id, records: batch.records, memory_ids: memoryIds, result: "active" },
        false,
      );
    });
  }
  private receipt(row: Row, duplicate: boolean) {
    return {
      id: row.id,
      count: row.records.length,
      activeCount: row.result === "active" ? row.memory_ids.length : 0,
      result: row.result,
      duplicate,
      message:
        row.result === "rolled_back"
          ? "This import was rolled back and has not been reactivated."
          : `${row.memory_ids.length} personal ${row.memory_ids.length === 1 ? "memory" : "memories"} activated for this Eve. Other experience remains staged; existing truth and authority are unchanged.`,
    };
  }
  async rollback(id: string) {
    return this.locked(async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM capsule_memory_receipts WHERE owner_id=$1 AND eve_id=$2 AND id=$3",
          [this.owner, this.eve, id],
        )
      ).rows[0];
      if (!row) throw new CapsuleError("missing", "Import receipt not found.");
      if (row.result === "rolled_back") return this.receipt(row, true);
      for (const expected of row.memory_ids) {
        const current = (
          await c.query(
            "SELECT * FROM memory_records WHERE owner_id=$1 AND id=$2",
            [this.owner, expected.id],
          )
        ).rows[0];
        if (
          !current ||
          current.status !== "active" ||
          current.source_id !== id ||
          current.scope_type !== "agent" ||
          current.scope_id !== this.eve ||
          current.content !== expected.content ||
          iso(current.updated_at) !== expected.updatedAt ||
          memoryRevision(current) !== expected.recordDigest
        )
          throw new CapsuleError(
            "changed",
            "Imported Memory changed after activation. Review its current state before removal.",
          );
      }
      for (const expected of row.memory_ids)
        await c.query(
          "UPDATE memory_records SET status='archived',updated_at=now() WHERE owner_id=$1 AND id=$2",
          [this.owner, expected.id],
        );
      await c.query(
        "UPDATE capsule_memory_receipts SET result='rolled_back' WHERE owner_id=$1 AND eve_id=$2 AND id=$3",
        [this.owner, this.eve, id],
      );
      return this.receipt({ ...row, result: "rolled_back" }, false);
    });
  }
}
