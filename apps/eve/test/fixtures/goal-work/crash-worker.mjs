import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { GoalWorkService } from "../../../lib/goal-work/service.ts";
const [schema, checkpoint, goalId, taskId, extra] = process.argv.slice(2);
if (!/^goals_[a-f0-9]+$/.test(schema))
  throw new Error("Isolated fixture schema required");
const pool = new Pool({
  host: "127.0.0.1",
  port: Number(process.env.GOAL_TEST_PORT ?? 55473),
  user: "myeve_goals",
  database: "postgres",
});
const connect = async () => {
  const c = await pool.connect();
  await c.query(`SET search_path TO ${schema}`);
  return c;
};
const database = {
  async query(s, p) {
    const c = await connect();
    try {
      return (await c.query(s, p)).rows;
    } finally {
      c.release();
    }
  },
  async transaction(body) {
    const c = await connect();
    await c.query("BEGIN");
    try {
      const result = await body({
        query: async (s, p) => (await c.query(s, p)).rows,
      });
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  },
};
const kill = () => process.kill(process.pid, "SIGKILL");
const work = {
  async ensure(request) {
    if (checkpoint === "eligibility") kill();
    await database.query(
      `INSERT INTO fixture_work(id,owner_id,key,request) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(owner_id,key) DO NOTHING`,
      [
        randomUUID(),
        request.ownerId,
        request.correlationKey,
        JSON.stringify(request),
      ],
    );
    if (checkpoint === "workCreation") kill();
    throw new Error("Unexpected dispatch");
  },
  async find() {
    throw new Error("unused");
  },
  async result(owner, workId, resultId) {
    const [r] = await database.query(
      "SELECT result FROM fixture_work WHERE owner_id=$1 AND id=$2",
      [owner, workId],
    );
    if (r.result.id !== resultId) throw new Error("Result mismatch");
    return r.result;
  },
};
const service = new GoalWorkService("alice", "owner", database, work, {
  async verify() {
    return true;
  },
});
if (checkpoint === "goalCreation")
  await service.create({
    id: goalId,
    objective: "Restart goal",
    criteria: ["Outcome"],
  });
else if (checkpoint === "taskCreation")
  await service.addTask(goalId, {
    id: taskId,
    objective: taskId,
    criteria: ["Verified outcome"],
    provenance: { kind: "owner", reference: "owner-request" },
  });
else if (checkpoint === "dependencyClear")
  await service.signal(JSON.parse(extra));
else if (checkpoint === "result") {
  const { workId, resultId } = JSON.parse(extra);
  await service.ingestResult(goalId, taskId, workId, resultId);
} else if (checkpoint === "goalCompletion") await service.completeGoal(goalId);
else await service.continue(await service.context(goalId, taskId));
kill();
