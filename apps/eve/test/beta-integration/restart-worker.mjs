import {betaTestPort} from './test-postgres.mjs';
import { Pool } from "pg";
import { neonConfig } from "@neondatabase/serverless";
import { BetaIntegration } from "../../lib/beta-integration/runtime.ts";
import { LearningStore } from "../../lib/total-recall/store.ts";
import { memoryStore } from "../../agent/lib/memory-store.ts";
const input = JSON.parse(process.argv[2]);
const pool = new Pool({
  host: "127.0.0.1",
  port: betaTestPort,
  user: "postgres",
  database: "myeve_beta_phase2",
});
const beta = new BetaIntegration(pool, {
  repository: "qualification/design-partner",
  maxCostUsd: 1,
  maxDurationSeconds: 300,
});
process.env.DATABASE_URL =
  "postgresql://fixture:fixture@beta-fixture.neon.tech/qualification";
delete process.env.SUPERMEMORY_API_KEY;
neonConfig.fetchFunction = async (_url, options) => {
  const { query, params } = JSON.parse(options.body);
  const r = await pool.query({
    text: query,
    values: params,
    rowMode: "array",
    types: { getTypeParser: () => (v) => v },
  });
  return Response.json({
    fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: r.rows,
    rowCount: r.rowCount,
    command: r.command,
    rowAsArray: true,
  });
};
try {
  let result;
  const service = beta.service(input.owner);
  switch (input.stage) {
    case "memory":
      result = await memoryStore.add("Recovery deadline is Friday", {
        context: { ownerId: input.owner, agentId: "sofie" },
        scope: { type: "owner", id: input.owner },
        sourceType: "owner",
        sourceId: "local-restart-fixture",
      });
      break;
    case "dependency":
      result = await beta
        .service(input.owner, "owner")
        .addTask(input.goalId, input.task);
      break;
    case "work":
      result = await service.continue(
        await service.context(input.goalId, input.taskId),
      );
      break;
    case "inbox":
      result = await service.tick(input.goalId);
      break;
    case "decision":
      result = await beta.inbox(input.owner).respond(input.response);
      break;
    case "delivery":
      result = await beta.deliver(input.owner);
      break;
    case "result":
      result = await service.receiveResult(
        input.goalId,
        input.taskId,
        input.workId,
        input.resultId,
      );
      break;
    case "promotion":
      result = await new LearningStore(beta.store(input.owner)).command(
        input.familyId,
        input.revision,
        input.command,
      );
      break;
    default:
      throw Error("Unknown recovery stage");
  }
  if (input.kill) process.kill(process.pid, "SIGKILL");
  console.log(JSON.stringify(result));
} finally {
  await pool.end();
}
