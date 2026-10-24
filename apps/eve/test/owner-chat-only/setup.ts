/** Disposable current-profile test setup. No live target or productive grant. */
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { digest } from "../../lib/engineering/contract.ts";
import type { Env } from "../../lib/external-alpha/work-test-fixture.ts";

export const accountingFiles = ["shared-accounting.sql", "shared-accounting-recovery.sql", "shared-accounting-zero-gap.sql", "shared-accounting-chat-only.sql"] as const;

export async function prepareChatOnlyFixture() {
  // Import after the operator has validated and selected the owned local cluster.
  const { Env } = await import("../../lib/external-alpha/work-test-fixture.ts");
  const created: Env[] = [];
  try {
    const central = await Env.create(false, {}, false); created.push(central);
    const cohortId = randomUUID();
    const installations = [];
    for (const slot of ["1", "2"] as const) {
      const app = await Env.create(false, { cohortId, slot,
        projectId: `prj_fixturechat${slot}`, clientId: `external-alpha-${randomBytes(16).toString("hex")}`,
        repository: `fixture/myeve-alpha-workspace-0${slot}` }, false);
      created.push(app);
      installations.push({ app, slot, credential: randomBytes(32).toString("hex") });
    }
    for (const file of accountingFiles)
      await central.pool.query(await readFile(new URL(`../../lib/external-alpha/${file}`, import.meta.url), "utf8"));
    await central.pool.query("INSERT INTO external_alpha_cohort(id) VALUES($1)", [cohortId]);
    for (const { app, credential } of installations) {
      await app.pool.query("INSERT INTO external_alpha_chat_only(owner_id,policy_sha256) VALUES($1,$2)", [app.owner, digest(app.policy)]);
      await central.pool.query("INSERT INTO external_alpha_cohort_member(cohort_id,slot,owner_id,policy_sha256,credential_sha256) VALUES($1,$2,$3,$4,encode(sha256(convert_to($5,'UTF8')),'hex'))",
        [cohortId, app.policy.slot, app.owner, digest(app.policy), credential]);
    }
    // The legacy Env.activate() also updates an app-local central cohort; this
    // topology deliberately has none. These are new synthetic fixture rows only.
    for (const { app } of installations)
      await app.pool.query("UPDATE external_alpha_policy SET activated_at=clock_timestamp() WHERE owner_id=$1 AND policy_sha256=$2 AND activated_at IS NULL", [app.owner, digest(app.policy)]);
    await central.pool.query("UPDATE external_alpha_cohort SET activated_at=clock_timestamp() WHERE id=$1 AND activated_at IS NULL", [cohortId]);
    return { central, installations, close: async () => {
      const results = await Promise.allSettled(created.map(app => app.close()));
      const failures = results.filter(result => result.status === "rejected");
      if (failures.length) throw Error("Owned chat-only fixture database cleanup failed");
    } };
  } catch (error) {
    await Promise.allSettled(created.map(app => app.close()));
    throw error;
  }
}
