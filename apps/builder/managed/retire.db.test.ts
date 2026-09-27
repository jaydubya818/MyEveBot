import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, it } from "node:test";
import { managedDb } from "./db";
import { encryptRelayInvite } from "./invites";
import { recoverFailedEmptyProject, retireManagedEve } from "./retire";
import { managedProjectName } from "./state";

const enabled = Boolean(process.env.MANAGED_EVE_TEST_DATABASE_URL);
const previousFetch = globalThis.fetch;

it("retires only the bound paused project and dedicated Neon store after export", { skip: !enabled }, async () => {
  process.env.MANAGED_EVE_DATABASE_URL = process.env.MANAGED_EVE_TEST_DATABASE_URL;
  process.env.MANAGED_EVE_RETIREMENT_ENABLED = "true";
  process.env.MANAGED_EVE_VERCEL_TOKEN = "disposable-test-token";
  process.env.MANAGED_EVE_INVITE_KEY = Buffer.alloc(32, 7).toString("base64url");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 24);
  const id = `env_${suffix}`;
  const inviteId = `inv_${suffix}`;
  const projectName = managedProjectName(id);
  const projectId = `prj_${suffix}`;
  const storeId = `store_${suffix}`;
  const exportSha256 = "d".repeat(64);
  const relayToken = "r".repeat(43);
  const relayInvite = encryptRelayInvite(`https://relay-sage-nine.vercel.app/signup#invite=${relayToken}`);
  await managedDb().query(
    "INSERT INTO managed_beta_invites (id,email,token_hash,relay_invite_ciphertext,monthly_model_budget_usd,expires_at,claimed_at) VALUES ($1,$2,$3,$4,5,now()+interval '1 day',now())",
    [inviteId, `retire-${suffix}@example.test`, "e".repeat(40) + suffix, relayInvite],
  );
  await managedDb().query(
    `INSERT INTO managed_eve_environments
      (id,invite_id,email,owner_name,agent_name,project_name,project_id,database_store_id,state,monthly_model_budget_usd,last_export_verified_at)
     VALUES ($1,$2,$3,'Owner','Eve',$4,$5,$6,'paused',5,now())`,
    [id, inviteId, `retire-${suffix}@example.test`, projectName, projectId, storeId],
  );
  await managedDb().query(
    "INSERT INTO managed_eve_events (id,environment_id,kind,detail) VALUES ($1,$2,'owner_export_verified',$3)",
    [`evt_${suffix}`, id, JSON.stringify({ sha256: exportSha256 })],
  );
  const calls: string[] = [];
  let connected = true;
  let storeExists = true;
  let projectExists = true;
  let relayRetired = false;
  let relayActiveGrants = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    if (method === "POST" && url.origin === "https://relay-sage-nine.vercel.app" && url.pathname === "/api/beta-invites/lifecycle") {
      assert.deepEqual(JSON.parse(String(init?.body)), { token: relayToken });
      return Response.json({ invitationId: "bin_test", state: "ACCEPTED", accountId: "acc_test",
        accountState: relayRetired ? "RETIRED" : "ACTIVE", activeSessions: 0, activeCredentials: 0,
        activeAgentIdentities: 0, activeDelegations: 0, activeGrants: relayActiveGrants, queuedDeliveries: 0,
        publishedKnowledge: 0, privateDataObjects: 0 });
    }
    if (method === "GET" && url.pathname === `/v9/projects/${projectName}`) {
      return projectExists
        ? Response.json({ id: projectId, name: projectName, paused: true, link: null })
        : Response.json({ error: { message: "Not found" } }, { status: 404 });
    }
    if (method === "GET" && url.pathname === "/v1/storage/stores") {
      return Response.json({ stores: storeExists ? [{
        id: storeId, name: `${projectName.slice(0, 16)}-db-123456789abc`, type: "integration",
        ownership: "owned", product: { name: "Neon Postgres" },
        projectsMetadata: connected ? [{ id: "conn_disposable", projectId }] : [],
      }] : [] });
    }
    if (method === "DELETE" && url.pathname === `/v1/storage/stores/${storeId}/connections/conn_disposable`) {
      connected = false;
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE" && url.pathname === `/v1/storage/stores/integration/${storeId}`) {
      storeExists = false;
      return new Response(null, { status: 204 });
    }
    if (method === "DELETE" && url.pathname === `/v9/projects/${projectId}`) {
      projectExists = false;
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected Vercel request: ${method} ${url.pathname}`);
  };
  try {
    await assert.rejects(retireManagedEve({
      id, confirmProjectName: projectName, confirmDatabaseStoreId: storeId, exportSha256,
    }), /Retire the bound account in Relay Settings/);
    assert.equal(calls.some((item) => item.startsWith("DELETE")), false);
    relayRetired = true;
    relayActiveGrants = 1;
    await assert.rejects(retireManagedEve({
      id, confirmProjectName: projectName, confirmDatabaseStoreId: storeId, exportSha256,
    }), /Retire the bound account in Relay Settings/);
    assert.equal(calls.some((item) => item.startsWith("DELETE")), false);
    relayActiveGrants = 0;
    const outcome = await retireManagedEve({
      id, confirmProjectName: projectName, confirmDatabaseStoreId: storeId, exportSha256,
    });
    assert.deepEqual(outcome, { id, state: "retired" });
    assert.deepEqual(calls.filter((item) => item.startsWith("DELETE")), [
      `DELETE /v1/storage/stores/${storeId}/connections/conn_disposable`,
      `DELETE /v1/storage/stores/integration/${storeId}`,
      `DELETE /v9/projects/${projectId}`,
    ]);
    const result = await managedDb().query<{ state: string; database_deleted_at: Date | null; project_deleted_at: Date | null }>(
      "SELECT state,database_deleted_at,project_deleted_at FROM managed_eve_environments WHERE id=$1", [id],
    );
    assert.equal(result.rows[0]?.state, "retired");
    assert.ok(result.rows[0]?.database_deleted_at);
    assert.ok(result.rows[0]?.project_deleted_at);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

it("recovers only an undeployed failed project once", { skip: !enabled }, async () => {
  process.env.MANAGED_EVE_DATABASE_URL = process.env.MANAGED_EVE_TEST_DATABASE_URL;
  process.env.MANAGED_EVE_RETIREMENT_ENABLED = "true";
  process.env.MANAGED_EVE_VERCEL_TOKEN = "disposable-test-token";
  const suffix = randomUUID().replaceAll("-", "").slice(0, 24);
  const id = `env_${suffix}`;
  const inviteId = `inv_${suffix}`;
  const projectName = managedProjectName(id);
  const projectId = `prj_${suffix}`;
  await managedDb().query(
    "INSERT INTO managed_beta_invites (id,email,token_hash,monthly_model_budget_usd,expires_at,claimed_at) VALUES ($1,$2,$3,5,now()+interval '1 day',now())",
    [inviteId, `recover-${suffix}@example.test`, "f".repeat(40) + suffix],
  );
  await managedDb().query(
    `INSERT INTO managed_eve_environments
      (id,invite_id,email,owner_name,agent_name,project_name,project_id,state,monthly_model_budget_usd)
     VALUES ($1,$2,$3,'Owner','Eve',$4,$5,'failed',5)`,
    [id, inviteId, `recover-${suffix}@example.test`, projectName, projectId],
  );
  let projectExists = true;
  let deployments = false;
  let deletions = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    if (method === "GET" && url.pathname === `/v9/projects/${projectName}`) {
      return projectExists ? Response.json({ id: projectId, name: projectName, link: null })
        : Response.json({ error: { message: "Not found" } }, { status: 404 });
    }
    if (method === "GET" && url.pathname === "/v6/deployments") {
      return Response.json({ deployments: deployments ? [{ uid: "dpl_untracked" }] : [] });
    }
    if (method === "GET" && url.pathname === "/v1/storage/stores") return Response.json({ stores: [] });
    if (method === "DELETE" && url.pathname === `/v9/projects/${projectId}`) {
      projectExists = false;
      deletions++;
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected Vercel request: ${method} ${url.pathname}`);
  };
  try {
    deployments = true;
    await assert.rejects(recoverFailedEmptyProject({ id, confirmProjectName: projectName }), /deployment exists/);
    assert.equal(deletions, 0);
    deployments = false;
    await assert.rejects(recoverFailedEmptyProject({ id, confirmProjectName: "wrong-project" }), /empty project/);
    assert.deepEqual(await recoverFailedEmptyProject({ id, confirmProjectName: projectName }), { id, state: "retired" });
    assert.equal(deletions, 1);
    await assert.rejects(recoverFailedEmptyProject({ id, confirmProjectName: projectName }), /empty project/);
    assert.equal(deletions, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

after(async () => {
  globalThis.fetch = previousFetch;
  if (enabled) await managedDb().end();
});
