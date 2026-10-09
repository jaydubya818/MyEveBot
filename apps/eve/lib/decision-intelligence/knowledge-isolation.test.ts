import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const database = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  writes: [] as string[],
}));
vi.mock("../../agent/lib/receipts-db.ts", () => {
  const query = async (sql: string, values: unknown[]) => {
    if (sql.startsWith("INSERT INTO knowledge_records")) {
      const columns = sql.match(/\(([^)]+)\)/)![1]!.split(",");
      const row = Object.fromEntries(
        columns.map((column, index) => [column, values[index]]),
      );
      database.rows.set(String(row.id), row);
      database.writes.push(sql);
      return [];
    }
    if (sql.includes("FROM knowledge_records k")) {
      const row = database.rows.get(String(values[1]));
      return row?.owner_id === values[0] ? [row] : [];
    }
    return [];
  };
  return {
    db: () => ({
      query,
      transaction: async (
        callback: (tx: { query: typeof query }) => Promise<unknown>[],
      ) => Promise.all(callback({ query })),
    }),
  };
});
import { createKnowledge, getKnowledge } from "../knowledge.ts";
import { KNOWLEDGE_KINDS } from "../knowledge-types.ts";
import { ShadowEvaluator } from "./shadow.ts";
import { FakeDecisionProvider } from "./fixtures.ts";
import {
  DecisionFailure,
  type DecisionProvider,
  type Outcome,
} from "./contract.ts";

describe("canonical Knowledge remains independent", () => {
  beforeEach(() => {
    database.rows.clear();
    database.writes.length = 0;
  });
  it.each(KNOWLEDGE_KINDS)(
    "persists %s identically across disabled, agreement, disagreement and failure",
    async (kind) => {
      for (const mode of ["disabled", "agree", "disagree", "fail"] as const) {
        const canonical = await createKnowledge({
          ownerId: "synthetic-owner",
          kind,
          statement: "Synthetic canonical candidate",
          createdByType: "owner",
          occurrenceCount: 1,
          title: "Synthetic choice",
          decidedAt: "2026-09-20T00:00:00.000Z",
          subject: "Synthetic obligation",
          preferenceKey: "style",
          preferenceValue: "concise",
          preferenceScope: "owner",
          preferenceSourceType: "explicit_user",
          generatedAt: "2026-09-20T00:00:00.000Z",
        });
        const before = JSON.stringify(canonical);
        let calls = 0;
        const provider: DecisionProvider = {
          async evaluate(request, signal) {
            calls++;
            if (mode === "fail") throw new DecisionFailure("GATEWAY_FAILURE");
            const result = await new FakeDecisionProvider().evaluate(
              request,
              signal,
            );
            return {
              ...result,
              outcome: (mode === "agree"
                ? kind
                : kind === "fact"
                  ? "hypothesis"
                  : "fact") as (typeof request.outcomes)[number],
              confidence: 1,
            };
          },
        };
        const shadow = new ShadowEvaluator(provider, {
          enabled: mode !== "disabled",
          samplePercent: 100,
          maxDecisions: 10,
          timeoutMs: 50,
          concurrency: 1,
        });
        const evidence = await shadow.evaluate(
          {
            id: canonical.id,
            kind,
            statement: canonical.statement,
            source: "synthetic",
          },
          null,
          kind === "insight" ? null : (kind as Outcome),
        );
        const stored = await getKnowledge("synthetic-owner", canonical.id);
        expect(JSON.stringify(stored)).toBe(before);
        expect(stored!.kind).toBe(kind);
        if (kind === "insight") {
          expect(calls).toBe(0);
          expect(evidence.failure).toBe("SKIPPED_OUT_OF_SCOPE");
        }
        if (mode === "disagree" && kind === "hypothesis")
          expect(evidence.result).toMatchObject({
            outcome: "fact",
            confidence: 1,
          });
        expect(await getKnowledge("another-owner", canonical.id)).toBeNull();
        database.rows.delete(canonical.id); // A forgotten source has no copied statement in evidence.
        expect(await getKnowledge("synthetic-owner", canonical.id)).toBeNull();
        expect(JSON.stringify(evidence)).not.toContain(canonical.statement);
      }
      expect(database.writes).toHaveLength(4);
    },
  );
  it("keeps Decision Intelligence out of canonical context and authority imports", async () => {
    for (const file of [
      "lib/knowledge.ts",
      "lib/action-gateway.ts",
      "lib/computer-control.ts",
      "lib/relay/work.ts",
      "agent/lib/knowledge-context.ts",
    ]) {
      expect(
        await readFile(resolve(import.meta.dirname, "../..", file), "utf8"),
      ).not.toMatch(/decision-intelligence|JevDecisionProvider/);
    }
  });
});
