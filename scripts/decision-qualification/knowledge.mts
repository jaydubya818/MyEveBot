import assert from "node:assert/strict";
import { createKnowledge, getKnowledge } from "../../apps/eve/lib/knowledge.ts";
import { forgetOwnerKnowledge } from "../../apps/eve/lib/owner-knowledge.ts";
import { KNOWLEDGE_KINDS } from "../../apps/eve/lib/knowledge-types.ts";
import { ShadowEvaluator } from "../../apps/eve/lib/decision-intelligence/shadow.ts";
import { FakeDecisionProvider } from "../../apps/eve/lib/decision-intelligence/fixtures.ts";
import {
  DecisionFailure,
  type DecisionProvider,
} from "../../apps/eve/lib/decision-intelligence/contract.ts";

if (!process.env.DATABASE_URL?.includes("@jev-db.local:55449/jev_v0"))
  throw new Error("Isolated qualification database required");
let checked = 0;
for (const kind of KNOWLEDGE_KINDS) {
  for (const mode of ["disabled", "agree", "disagree", "failure"] as const) {
    const record = await createKnowledge({
      ownerId: "decision-fixture",
      kind,
      statement: "Synthetic isolated qualification candidate",
      createdByType: "owner",
      occurrenceCount: 1,
      title: "Synthetic choice",
      decidedAt: new Date().toISOString(),
      subject: "Synthetic obligation",
      preferenceKey: "style",
      preferenceValue: "concise",
      preferenceScope: "owner",
      preferenceSourceType: "explicit_user",
      generatedAt: new Date().toISOString(),
    });
    let calls = 0;
    const provider: DecisionProvider = {
      async evaluate(request, signal) {
        calls++;
        if (mode === "failure") throw new DecisionFailure("GATEWAY_FAILURE");
        const outcome = (
          mode === "agree" ? kind : kind === "fact" ? "hypothesis" : "fact"
        ) as (typeof request.outcomes)[number];
        return {
          ...(await new FakeDecisionProvider().evaluate(request, signal)),
          outcome,
          confidence: 1,
          probabilities: Object.fromEntries(
            request.outcomes.map((label) => [label, Number(label === outcome)]),
          ) as Record<typeof outcome, number>,
        };
      },
    };
    const shadow = new ShadowEvaluator(provider, {
      enabled: mode !== "disabled",
      samplePercent: 100,
      maxDecisions: 1,
    });
    const evidence = await shadow.evaluate({
      id: record.id,
      kind,
      statement: record.statement,
      source: "synthetic",
    });
    assert.deepEqual(await getKnowledge("decision-fixture", record.id), record);
    assert.equal(await getKnowledge("other-synthetic-owner", record.id), null);
    if (kind === "insight") {
      assert.equal(evidence.failure, "SKIPPED_OUT_OF_SCOPE");
      assert.equal(calls, 0);
    }
    const forgotten = await forgetOwnerKnowledge({
      ownerId: "decision-fixture",
      repository: "knowledge",
      id: record.id,
    });
    assert.equal(forgotten.receipt.result, "completed");
    assert.equal(await getKnowledge("decision-fixture", record.id), null);
    assert.ok(!JSON.stringify(evidence).includes(record.statement));
    checked++;
  }
}
console.log(
  `PASS: ${checked} isolated PostgreSQL canonical/shadow/owner-isolation/Forget scenarios; Insight calls 0.`,
);
