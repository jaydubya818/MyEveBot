import {localSqlFixture} from './local-sql-fixture.mjs';
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { neonConfig } from "@neondatabase/serverless";
import { toolActionRequest } from "../agent/lib/action-context.ts";
import { provisionComputerSession } from "../agent/lib/computer-context.ts";
import { validateAgentInput } from "../lib/agents.ts";
import { ActionGateway, consumeActionAuthority, consumeProviderAuthority } from "../lib/action-gateway.ts";

// Fixed loopback fixture only: never read an environment file or shared URL.
process.env.DATABASE_URL = "postgresql://myeve_test@action-context.invalid/postgres";
const pool = new Pool(localSqlFixture({ host: "127.0.0.1", port: 55442, user: "myeve_test", database: "postgres" }));
const client = await pool.connect();
const schema = `action_context_${Date.now()}`;
const originalFetch = globalThis.fetch;
const originalTransport = neonConfig.fetchFunction;
let providerCalls = 0, checks = 0;
globalThis.fetch = async () => { providerCalls++; throw new Error("External providers forbidden in SQL regression"); };
// Exercise the application's real Neon query serialization and PostgreSQL parser.
neonConfig.fetchFunction = async (_url, options) => {
  const body = JSON.parse(options.body);
  const query = async ({ query, params }) => {
    const result = await client.query({ text: query, values: params, rowMode: "array", types: { getTypeParser: () => value => value } });
    return { fields: result.fields.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })), rows: result.rows, rowCount: result.rowCount, command: result.command, rowAsArray: true };
  };
  if (!body.queries) return Response.json(await query(body));
  await client.query("BEGIN");
  try {
    const results = [];
    for (const item of body.queries) results.push(await query(item));
    await client.query("COMMIT");
    return Response.json({ results });
  } catch (error) { await client.query("ROLLBACK"); throw error; }
};
const owner = "owner_action_context", agent = "agent_action_context";
const principal = { principalId: owner, principalType: "user", attributes: { owner: "true", myeveAgentId: agent } };
const context = id => ({ session: { id, auth: { current: principal, initiator: principal } }, callId: id,
  getSandbox: async () => { providerCalls++; throw new Error("Unexpected Sandbox access"); } });
const input = { capabilityId: "computer.session.create", actionClass: "create", parameters: {} };
const check = async (name, work) => { await work(); checks++; console.log(`PASS: ${name}`); };
const denied = error => error.status === "denied";
try {
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter(f => f.endsWith(".sql")).sort()) await client.query(await readFile(new URL(file, directory), "utf8"));
  await client.query("INSERT INTO agents(id,owner_id,slug,name,role,instructions,is_primary,status,max_steps,max_runtime_seconds,max_estimated_cost_usd) VALUES($1,$2,'context','Context','Test','Test',false,'active',30,600,1)", [agent, owner]);
  await check("actual Action Context creates and reuses a bounded Run", async () => {
    const request = await toolActionRequest(context("valid"), input);
    assert.equal((await toolActionRequest(context("valid"), input)).runId, request.runId);
    const row = (await client.query("SELECT max_duration_seconds,extract(epoch FROM deadline_at-started_at)::int AS duration FROM task_runs WHERE id=$1", [request.runId])).rows[0];
    assert.deepEqual(row, { max_duration_seconds: 600, duration: 600 });
  });
  for(const value of [10,600,86400])await check(`canonical initializer uses current Agent runtime ${value}`,async()=>{
    await client.query('UPDATE agents SET max_runtime_seconds=$1 WHERE id=$2',[value,agent]);
    const request=await toolActionRequest(context('boundary-'+value),input);
    const row=(await client.query('SELECT max_duration_seconds,extract(epoch FROM deadline_at-started_at)::int AS duration FROM task_runs WHERE id=$1',[request.runId])).rows[0];
    assert.deepEqual(row,{max_duration_seconds:value,duration:value});
  });
  await client.query('UPDATE agents SET max_runtime_seconds=600 WHERE id=$1',[agent]);
  for (const value of [null, 0, 1, 9, 10.5, 86401]) await check(`Agent rejects invalid runtime ${value}`, async () => {
    assert.match(validateAgentInput({ name: "Test", role: "Test", instructions: "Test", limits: { maxRuntimeSeconds: value } }), /Max runtime/);
  });
  for (const value of [10, 600, 86400]) await check(`Agent accepts whole seconds ${value}`, async () => {
    assert.equal(validateAgentInput({ name: "Test", role: "Test", instructions: "Test", limits: { maxRuntimeSeconds: value } }), null);
  });
  await check("missing context denies before provider", async () => { await assert.rejects(provisionComputerSession(undefined), denied); });
  await check("wrong Agent binding denies", async () => {
    const ctx = context("wrong-agent"); ctx.session.auth = { current: principal, initiator: { ...principal, attributes: { ...principal.attributes, myeveAgentId: "other" } } };
    await assert.rejects(toolActionRequest(ctx, input), /Agent does not match/);
  });
  await check("missing capability denies before preparation", async () => { await assert.rejects(provisionComputerSession(context("no-grant")), denied); });
  const database = { query: async (sql, params) => (await client.query(sql, params)).rows };
  const gateway = new ActionGateway(database, { evaluate: async () => ({ decision: "ALLOW", source: "fixture", reason: "fixture" }) });
  const adapter = {
    resolveTarget: async () => ({ provider: "sandbox", account: owner, resource: "fixture" }),
    async execute(parameters, authority) { await consumeActionAuthority(authority, parameters, input.capabilityId); await consumeProviderAuthority(authority, parameters, input.capabilityId); return {}; },
    verify: async () => ({ verified: true, receipt: {} }),
  };
  for (const [name, mutation] of [
    ["terminal Run", "status='failed'"], ["cost exhausted", "estimated_cost_usd=max_estimated_cost_usd"],
    ["step limit reached", "model_steps=max_model_steps"], ["step limit exceeded", "model_steps=max_model_steps+1"],
    ["expired Run / deadline exceeded", "deadline_at=now()-interval '1 second'"],
  ]) await check(name, async () => {
    const request = await toolActionRequest(context(name), input);
    await client.query(`UPDATE task_runs SET ${mutation} WHERE id=$1`, [request.runId]);
    await assert.rejects(gateway.execute(request, { ...adapter, execute: async () => { providerCalls++; throw new Error("Budget bypass"); } }), denied);
  });
  await check("stale Agent revision at provider boundary denies", async () => {
    const request = await toolActionRequest(context("stale-revision"), input);
    let boundaryDenied = false;
    await assert.rejects(gateway.execute(request, { ...adapter, async execute(parameters, authority) {
      await consumeActionAuthority(authority, parameters, input.capabilityId);
      await client.query("UPDATE agents SET updated_at=updated_at+interval '1 second' WHERE id=$1", [agent]);
      try { await consumeProviderAuthority(authority, parameters, input.capabilityId); }
      catch (error) { assert.ok(denied(error)); boundaryDenied = true; throw error; }
      providerCalls++; return {};
    } }), error => error.status === "result_unknown"); // Existing Gateway conservatively records adapter failures.
    assert.equal(boundaryDenied, true);
  });
  assert.equal(providerCalls, 0);
  console.log(`PASS: ${checks} PostgreSQL/Action Context cases; provider calls=0`);
} finally {
  neonConfig.fetchFunction = originalTransport; globalThis.fetch = originalFetch;
  await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  client.release(); await pool.end();
}
