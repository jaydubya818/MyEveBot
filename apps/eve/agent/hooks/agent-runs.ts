import { defineHook } from "eve/hooks";

import { db } from "../lib/receipts-db.ts";

export default defineHook({
  events: {
    async "step.started"(_event, ctx) {
      const rows = await db().query(
        `SELECT r.model_steps,r.estimated_cost_usd,r.started_at,a.name,a.status,a.max_steps,a.max_runtime_seconds,a.max_estimated_cost_usd
         FROM agent_runs r JOIN agents a ON a.owner_id=r.owner_id AND a.id=r.agent_id WHERE r.session_id=$1 AND r.status='running' ORDER BY r.updated_at DESC LIMIT 1`,
        [ctx.session.id],
      ) as Array<Record<string, unknown>>;
      const row = rows[0]; if (!row) return;
      if (row.status !== "active") throw new Error(`${row.name} is ${row.status} and cannot execute new work.`);
      const elapsedSeconds = (Date.now() - new Date(String(row.started_at)).getTime()) / 1000;
      if (Number(row.model_steps) >= Number(row.max_steps)) throw new Error(`${row.name} reached its configured step limit.`);
      if (Number(row.estimated_cost_usd) >= Number(row.max_estimated_cost_usd)) throw new Error(`${row.name} reached its configured cost limit.`);
      if (elapsedSeconds >= Number(row.max_runtime_seconds)) throw new Error(`${row.name} reached its configured runtime limit.`);
    },
    async "step.completed"(event, ctx) {
      await db().query(
        `UPDATE agent_runs SET model_steps=model_steps+1, estimated_cost_usd=estimated_cost_usd+$2, updated_at=now() WHERE session_id=$1 AND status='running'`,
        [ctx.session.id, event.data.usage?.costUsd ?? 0],
      );
    },
    async "turn.completed"(_event, ctx) {
      await db().query(`UPDATE agent_runs SET status='completed', completed_at=now(), updated_at=now() WHERE session_id=$1 AND status='running'`, [ctx.session.id]);
    },
    async "turn.failed"(_event, ctx) {
      await db().query(`UPDATE agent_runs SET status='failed', completed_at=now(), updated_at=now() WHERE session_id=$1 AND status='running'`, [ctx.session.id]);
    },
    async "turn.cancelled"(_event, ctx) {
      await db().query(`UPDATE agent_runs SET status='cancelled', completed_at=now(), updated_at=now() WHERE session_id=$1 AND status='running'`, [ctx.session.id]);
    },
  },
});
