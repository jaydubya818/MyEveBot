import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  loadMigrations,
  runMigrations,
} from "../../scripts/migration-runner.ts";
const connection = process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE;
const pg = createRequire(import.meta.url)("pg");
describe.skipIf(!connection)("external alpha durable allowances", () => {
  let admin: any, pool: any;
  const name = "external_alpha_" + randomUUID().replaceAll("-", "");
  beforeAll(async () => {
    if (!connection) throw Error("Dedicated local test database required");
    const u = new URL(connection);
    if (!["127.0.0.1", "localhost"].includes(u.hostname))
      throw Error("Local tests only");
    admin = new pg.Pool({ connectionString: connection });
    await admin.query("CREATE DATABASE " + name);
    u.pathname = "/" + name;
    pool = new pg.Pool({ connectionString: u.href, max: 20 });
    pool.on("error", () => {}); // teardown force-drops the database
    await runMigrations(
      {
        query: async (q, p) => (await pool.query(q, p)).rows,
        transaction: async (ss) => {
          const c = await pool.connect();
          try {
            await c.query("BEGIN");
            for (const s of ss) {
              try {
                await c.query(s.sql, s.params);
              } catch (e: any) {
                throw Error(
                  "Migration statement: " +
                    s.sql.slice(0, 100) +
                    "; position " +
                    e.position +
                    "; internal " +
                    e.internalPosition +
                    "; " +
                    e.message +
                    "; query " +
                    e.internalQuery,
                );
              }
            }
            await c.query("COMMIT");
          } catch (e) {
            await c.query("ROLLBACK");
            throw e;
          } finally {
            c.release();
          }
        },
      },
      await loadMigrations(),
      () => {},
    );
  }, 120000);
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query("DROP DATABASE IF EXISTS " + name + " WITH (FORCE)");
      await admin.end();
    }
  }, 30000);
  const owner = randomUUID(),
    policyHash = "a".repeat(64);
  function admission(
    binding: string = randomUUID(),
    overrides: Record<string, unknown> = {},
  ) {
    return {
      id: randomUUID(),
      ownerId: owner,
      policySha256: policyHash,
      kind: "CHAT",
      bindingId: binding,
      requestSha256: "b".repeat(64),
      ...overrides,
    };
  }
  async function call(fn: string, p: unknown) {
    return (
      await pool.query(`SELECT external_alpha_${fn}($1::jsonb) AS r`, [
        JSON.stringify(p),
      ])
    ).rows[0].r;
  }
  it("installs an inert schema and denies all spending before explicit activation", async () => {
    expect(
      (await pool.query("SELECT count(*) FROM external_alpha_policy")).rows[0]
        .count,
    ).toBe("0");
    await pool.query(
      "INSERT INTO external_alpha_policy(owner_id,policy_sha256,policy)VALUES($1,$2,$3)",
      [
        owner,
        policyHash,
        {
          ownerId: owner,
          kind: "TWO_EXTERNAL_OWNERS_V1",
          repository: "fixture/workspace",
        },
      ],
    );
    await expect(call("admit", admission())).rejects.toThrow("inactive");
    await pool.query(
      "UPDATE external_alpha_policy SET activated_at=clock_timestamp()",
    );
  });
  it("does not duplicate one admission across concurrent tabs and rejects changed binding", async () => {
    const p = admission("same-turn");
    const rows = await Promise.all(
      Array.from({ length: 12 }, () =>
        call("admit", { ...p, id: randomUUID() }),
      ),
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    await expect(
      call("admit", { ...p, requestSha256: "c".repeat(64) }),
    ).rejects.toThrow("binding changed");
    await expect(
      call("admit", admission("foreign", { ownerId: randomUUID() })),
    ).rejects.toThrow("wrong owner");
  });
  it("atomically admits at most ten daily chat turns without recycling settled allowances", async () => {
    await call("admit", admission("ambiguous-turn"));
    const rows = await Promise.allSettled(
      Array.from({ length: 20 }, () => call("admit", admission())),
    );
    expect(rows.filter((r) => r.status === "fulfilled")).toHaveLength(8);
    expect(
      (
        await pool.query(
          "SELECT sum(ceiling_microusd) amount FROM external_alpha_allowance",
        )
      ).rows[0].amount,
    ).toBe("1000000");
    await expect(call("admit", admission())).rejects.toThrow("exhausted");
  });
  it("serializes calls and retains ambiguous exposure without fallback or new admission", async () => {
    const a = await call("admit", admission("ambiguous-turn"));
    const p = {
      id: randomUUID(),
      ownerId: owner,
      policySha256: policyHash,
      allowanceId: a.id,
      stepKey: "turn:0",
      requestSha256: "d".repeat(64),
      microusd: 30000,
    };
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        call("model_reserve", { ...p, id: randomUUID() }),
      ),
    );
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    await expect(call("admit", admission("next-turn"))).rejects.toThrow(
      "Unresolved",
    );
    const op = (
      attempts.find(
        (x) => x.status === "fulfilled",
      ) as PromiseFulfilledResult<any>
    ).value;
    await call("model_finish", {
      ownerId: owner,
      allowanceId: a.id,
      operationId: op.id,
      requestSha256: p.requestSha256,
      state: "SETTLED",
      microusd: 1000,
      result: { text: "retained" },
    });
    expect((await call("model_reserve", p)).result).toEqual({
      text: "retained",
    });
    const op2 = await call("model_reserve", {
      ...p,
      id: randomUUID(),
      stepKey: "turn:1",
    });
    await call("model_finish", {
      ownerId: owner,
      allowanceId: a.id,
      operationId: op2.id,
      requestSha256: p.requestSha256,
      state: "UNKNOWN",
    });
    await expect(
      call("model_reserve", { ...p, id: randomUUID(), stepKey: "turn:2" }),
    ).rejects.toThrow("fenced");
    await expect(call("admit", admission("never-retry"))).rejects.toThrow(
      "Unresolved",
    );
    expect(
      (
        await pool.query(
          "SELECT reserved_microusd,spent_microusd FROM external_alpha_operation WHERE id=$1",
          [op2.id],
        )
      ).rows[0],
    ).toEqual({ reserved_microusd: "30000", spent_microusd: null });
  });
  it("cannot replace/reset/delete policy or reactivate revoked authority", async () => {
    await expect(
      pool.query(
        "UPDATE external_alpha_policy SET policy_sha256=repeat('f',64)",
      ),
    ).rejects.toThrow("cannot be replaced");
    await expect(
      pool.query(
        "UPDATE external_alpha_policy SET activated_at=clock_timestamp()+interval '1 day'",
      ),
    ).rejects.toThrow("cannot be replaced");
    await expect(
      pool.query("DELETE FROM external_alpha_policy"),
    ).rejects.toThrow("cannot be deleted");
    await pool.query(
      "UPDATE external_alpha_policy SET revoked_at=clock_timestamp()",
    );
    await expect(call("admit", admission())).rejects.toThrow("inactive");
    await expect(
      pool.query("UPDATE external_alpha_policy SET revoked_at=NULL"),
    ).rejects.toThrow("cannot be replaced");
  });
  it("uses the same UTC day for staggered owner activations", async () => {
    const otherName = "external_alpha_" + randomUUID().replaceAll("-", "");
    await admin.query("CREATE DATABASE " + otherName);
    const u = new URL(connection!);
    u.pathname = "/" + otherName;
    const other = new pg.Pool({ connectionString: u.href });
    other.on("error", () => {}); // teardown force-drops the database
    try {
      await runMigrations(
        {
          query: async (q, p) => (await other.query(q, p)).rows,
          transaction: async (ss) => {
            const c = await other.connect();
            try {
              await c.query("BEGIN");
              for (const s of ss) await c.query(s.sql, s.params);
              await c.query("COMMIT");
            } catch (e) {
              await c.query("ROLLBACK");
              throw e;
            } finally {
              c.release();
            }
          },
        },
        await loadMigrations(),
        () => {},
      );
      const otherOwner = randomUUID();
      await other.query(
        `INSERT INTO external_alpha_policy(owner_id,policy_sha256,policy,created_at,activated_at)
   VALUES($1,$2,$3,clock_timestamp()-interval '2 days',clock_timestamp()-interval '12 hours')`,
        [
          otherOwner,
          policyHash,
          { ownerId: otherOwner, kind: "TWO_EXTERNAL_OWNERS_V1" },
        ],
      );
      const a = (
        await other.query("SELECT external_alpha_admit($1::jsonb) AS r", [
          JSON.stringify(admission("staggered", { ownerId: otherOwner })),
        ])
      ).rows[0].r;
      const day = (
        await pool.query(
          "SELECT floor(extract(epoch FROM clock_timestamp())/86400)::int AS day",
        )
      ).rows[0].day;
      expect(a.day_index).toBe(day);
      expect(
        (
          await pool.query(
            "SELECT DISTINCT day_index FROM external_alpha_allowance",
          )
        ).rows.map((r: any) => r.day_index),
      ).toEqual([day]);
      // Preserve an actual settled charge over a day rollover; today's quota may
      // reopen but neither historical charge nor lifetime allocation is recycled.
      await other.query(
        `INSERT INTO external_alpha_allowance(id,owner_id,policy_sha256,kind,binding_id,request_sha256,
   day_index,ceiling_microusd,max_operations,deadline,state)
   SELECT gen_random_uuid(),$1,$2,'CHAT','historic-'||i,repeat('c',64),$3-(i/10)-1,100000,2,clock_timestamp()-interval '1 day','COMPLETED'
   FROM generate_series(1,114) i`,
        [otherOwner, policyHash, day],
      );
      await expect(
        other.query("SELECT external_alpha_admit($1::jsonb)", [
          JSON.stringify(
            admission("lifetime-exhausted", { ownerId: otherOwner }),
          ),
        ]),
      ).rejects.toThrow("exhausted");
    } finally {
      await other.end();
      await admin.query("DROP DATABASE " + otherName + " WITH (FORCE)");
    }
  });

  it("linearizes exact-once tool acceptance against policy revocation and preserves accepted outcomes", async () => {
    const isolated =
      "external_alpha_effect_" + randomUUID().replaceAll("-", "");
    await admin.query("CREATE DATABASE " + isolated);
    const u = new URL(connection!);
    u.pathname = "/" + isolated;
    const isolatedPool = new pg.Pool({ connectionString: u.href, max: 12 });
    isolatedPool.on("error", () => {}); // teardown force-drops the database
    const query = (q: string, p?: unknown[]) => isolatedPool.query(q, p);
    const invoke = async (fn: string, p: unknown) =>
      (
        await query(`SELECT external_alpha_${fn}($1::jsonb) AS r`, [
          JSON.stringify(p),
        ])
      ).rows[0].r;
    try {
      await runMigrations(
        {
          query: async (q, p) => (await query(q, p)).rows,
          transaction: async (ss) => {
            const c = await isolatedPool.connect();
            try {
              await c.query("BEGIN");
              for (const s of ss) await c.query(s.sql, s.params);
              await c.query("COMMIT");
            } catch (e) {
              await c.query("ROLLBACK");
              throw e;
            } finally {
              c.release();
            }
          },
        },
        await loadMigrations(),
        () => {},
      );
      await query(
        "INSERT INTO external_alpha_policy(owner_id,policy_sha256,policy)VALUES($1,$2,$3)",
        [owner, policyHash, { ownerId: owner, kind: "TWO_EXTERNAL_OWNERS_V1" }],
      );
      await query(
        "UPDATE external_alpha_policy SET activated_at=clock_timestamp()",
      );
      await query(
        "INSERT INTO agents(id,owner_id,name,slug,role,instructions)VALUES('executing-agent',$1,'Agent','agent','Helper','Use only owned context')",
        [owner],
      );
      const allowance = await invoke(
        "admit",
        admission("effect-session:effect-turn"),
      );
      const reservation = {
        id: randomUUID(),
        ownerId: owner,
        policySha256: policyHash,
        allowanceId: allowance.id,
        stepKey: "effect-turn:0",
        requestSha256: "d".repeat(64),
        microusd: 30000,
      };
      const op = await invoke("model_reserve", reservation);
      await invoke("model_finish", {
        ...reservation,
        operationId: op.id,
        state: "SETTLED",
        microusd: 1000,
        result: {
          content: [
            {
              type: "tool-call",
              toolCallId: "accepted-call",
              toolName: "manage_agent",
            },
            {
              type: "tool-call",
              toolCallId: "revoked-call",
              toolName: "manage_agent",
            },
          ],
        },
      });
      const effect = {
        ownerId: owner,
        policySha256: policyHash,
        allowanceId: allowance.id,
        agentId: "executing-agent",
        sessionId: "effect-session",
        turnId: "effect-turn",
        callId: "accepted-call",
        toolName: "manage_agent",
        inputSha256: "e".repeat(64),
      };
      const outcomes = await Promise.allSettled(
        Array.from({ length: 8 }, () => invoke("tool_claim", effect)),
      );
      expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      await expect(invoke("admit", admission("new-paid-turn"))).rejects.toThrow(
        "Unresolved",
      );
      // Revocation owns the same policy row lock before the second claim begins.
      const revoker = await isolatedPool.connect();
      await revoker.query("BEGIN");
      await revoker.query(
        "UPDATE external_alpha_policy SET revoked_at=clock_timestamp()",
      );
      let mutations = 0;
      const pending = invoke("tool_claim", {
        ...effect,
        callId: "revoked-call",
      }).then(async () => {
        await query(
          "INSERT INTO agents(id,owner_id,name,slug,role,instructions)VALUES('forbidden-agent',$1,'Forbidden','forbidden','Helper','Never created')",
          [owner],
        );
        mutations++;
      });
      const denied = expect(pending).rejects.toThrow("revoked");
      await revoker.query("COMMIT");
      revoker.release();
      await denied;
      expect(mutations).toBe(0);
      expect(
        (await query("SELECT count(*) FROM agents WHERE id='forbidden-agent'"))
          .rows[0].count,
      ).toBe("0");
      // The first effect was durably accepted before revocation. Only recording
      // its outcome is permitted afterward; a second effect is never admitted.
      expect(
        await invoke("tool_finish", {
          ...effect,
          state: "COMPLETED",
          result: { retained: true },
        }),
      ).toBe("COMPLETED");
      await expect(invoke("tool_claim", effect)).rejects.toThrow("revoked");
      expect(
        (await query("SELECT state,result FROM external_alpha_tool_effect"))
          .rows,
      ).toEqual([{ state: "COMPLETED", result: { retained: true } }]);
    } finally {
      await isolatedPool.end();
      await admin.query("DROP DATABASE " + isolated + " WITH (FORCE)");
    }
  });
});
