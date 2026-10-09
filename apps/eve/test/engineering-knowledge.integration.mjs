import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { Client, Pool } from "pg";
import { neonConfig } from "@neondatabase/serverless";

import { currentConversationProvenance } from "../agent/lib/knowledge-context.ts";
import { EngineeringKnowledgeStore } from "../lib/engineering/knowledge.ts";
import { WorkStore } from "../lib/engineering/store.ts";
import { addKnowledgeProvenance, createKnowledge, createKnowledgeRelationship, createKnowledgeSource, getKnowledge, listKnowledge, listKnowledgeRelationships, listKnowledgeSources, transitionKnowledge } from "../lib/knowledge.ts";
import { correctOwnerKnowledge, forgetOwnerKnowledge, searchOwnerKnowledge } from "../lib/owner-knowledge.ts";
import { loadMigrations, runMigrations } from "../scripts/migration-runner.ts";

const adminUrl = new URL(process.env.ENGINEERING_TEST_ADMIN_URL ?? "postgresql://postgres@127.0.0.1:55468/postgres");
assert.equal(adminUrl.hostname, "127.0.0.1");
assert.equal(adminUrl.port, "55468");
assert.equal(adminUrl.pathname, "/postgres");

const admin = new Client({ connectionString: adminUrl.href });
await admin.connect();
const databaseName = `engineering_knowledge_${randomBytes(8).toString("hex")}`;
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousEngineeringMode = process.env.MYEVE_ENGINEERING_MODE;
const previousNeonFetch = neonConfig.fetchFunction;
let pool;
try {
  await admin.query(`CREATE DATABASE ${databaseName}`);
  adminUrl.pathname = `/${databaseName}`;
  pool = new Pool({ connectionString: adminUrl.href, max: 6 });
  const migrationClient = await pool.connect();
  const migrationDatabase = {
    query: async (sql, params) => (await migrationClient.query(sql, params)).rows,
    transaction: async (statements) => {
      await migrationClient.query("BEGIN");
      try {
        for (const statement of statements) await migrationClient.query(statement.sql, statement.params);
        await migrationClient.query("COMMIT");
      } catch (error) {
        await migrationClient.query("ROLLBACK");
        throw error;
      }
    },
  };
  try {
    await runMigrations(migrationDatabase, await loadMigrations(), () => {});
  } finally {
    migrationClient.release();
  }

  const database = { query: async (sql, params) => (await pool.query(sql, params)).rows };
  const owner = `engineering-owner-${randomUUID()}`;
  const stranger = `engineering-stranger-${randomUUID()}`;
  const ownerWork = new WorkStore({ scopeId: owner, scopeKind: "personal", actorId: owner }, database);
  const strangerWork = new WorkStore({ scopeId: stranger, scopeKind: "personal", actorId: stranger }, database);
  const createWork = (repository) => ({
    title: "Quantity validation", objective: "Reject invalid quantities", repository,
    criteria: [{ id: randomUUID(), statement: "Fractional quantities fail", method: "test" }],
    maxCostUsd: 1, maxDurationSeconds: 120, idempotencyKey: randomUUID(),
  });
  const firstWork = (await ownerWork.create(createWork("fixture/parser"))).work;
  const secondWork = (await ownerWork.create(createWork("fixture/other"))).work;
  const sessionWork = (await ownerWork.create(createWork("fixture/session"))).work;
  const foreignWork = (await strangerWork.create(createWork("fixture/parser"))).work;
  const knowledge = new EngineeringKnowledgeStore(ownerWork);
  const foreignKnowledge = new EngineeringKnowledgeStore(strangerWork);

  // Exercise the public Knowledge APIs with their real Neon SQL serialized
  // against the same disposable PostgreSQL database as Engineering Knowledge.
  process.env.DATABASE_URL = "postgresql://fixture:fixture@ep-engineering-knowledge.neon.tech/qualification";
  neonConfig.fetchFunction = async (_url, options) => {
    const body = JSON.parse(options.body);
    const connection = await pool.connect();
    const execute = async ({ query, params }) => {
      const result = await connection.query({ text: query, values: params, rowMode: "array", types: { getTypeParser: () => value => value } });
      return { fields: result.fields.map(field => ({ name: field.name, dataTypeID: field.dataTypeID })),
        rows: result.rows, rowCount: result.rowCount, command: result.command, rowAsArray: true };
    };
    try {
      if (!body.queries) return Response.json(await execute(body));
      await connection.query("BEGIN");
      try {
        const results = [];
        for (const statement of body.queries) results.push(await execute(statement));
        await connection.query("COMMIT");
        return Response.json({ results });
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    } finally {
      connection.release();
    }
  };

  async function source(ownerId, { referenced = true } = {}) {
    const id = `source_${randomUUID()}`;
    await database.query(`INSERT INTO knowledge_sources
      (id,owner_id,source_type,provider,external_id,reference_uri,content_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [
      id, ownerId, referenced ? "run" : "manual", referenced ? "github-ci" : null,
      referenced ? `run_${randomUUID()}` : null,
      referenced ? `https://github.com/fixture/parser/actions/runs/${randomUUID()}` : null,
      referenced ? `sha256:${"a".repeat(64)}` : null,
    ]);
    return id;
  }

  const firstSource = await source(owner);
  const correctionSourceA = await source(owner);
  const correctionSourceB = await source(owner);
  const foreignSource = await source(stranger);
  const unreferencedSource = await source(owner, { referenced: false });

  const original = await knowledge.save({
    workId: firstWork.id, statement: "quantity.mjs accepts fractions", confidence: 0.7,
    sourceId: firstSource, origin: { type: "owner" },
  });
  assert.equal(original.repository, "fixture/parser");
  assert.equal(original.status, "active");
  assert.equal(original.source.id, firstSource);
  assert.equal(original.source.relation, "supports");
  assert.equal((await knowledge.list(firstWork.id))[0].id, original.id);
  assert.equal((await knowledge.list(secondWork.id)).length, 0);
  assert.equal(await foreignKnowledge.get(foreignWork.id, original.id), null);
  assert.equal((await database.query(`SELECT project_ref FROM knowledge_records WHERE owner_id=$1 AND id=$2`, [owner, original.id]))[0].project_ref, "fixture/parser");

  const workSourceBefore = (await database.query(`SELECT provider,external_id,reference_uri,author,captured_at
    FROM knowledge_sources WHERE owner_id=$1 AND id=$2`, [owner, firstSource]))[0];
  await assert.rejects(createKnowledgeSource({ ownerId: owner, sourceType: "run",
    provider: workSourceBefore.provider, externalId: workSourceBefore.external_id,
    referenceUri: "https://example.invalid/forged-evidence", author: "Unbound caller",
    capturedAt: "2099-01-01T00:00:00.000Z" }), /unavailable for generic use/);
  assert.deepEqual((await database.query(`SELECT provider,external_id,reference_uri,author,captured_at
    FROM knowledge_sources WHERE owner_id=$1 AND id=$2`, [owner, firstSource]))[0], workSourceBefore);

  const sessionId = `engineering-session-${randomUUID()}`;
  const turnId = `turn-${randomUUID()}`;
  const threadId = `thread-${randomUUID()}`;
  const agentId = `agent-${randomUUID()}`;
  const runId = `agent_run_${sessionId}_${turnId}`;
  const webAuth = selected => ({ authenticator: "myeve-web-session", principalType: "user", principalId: owner,
    attributes: { owner: "true", webThreadId: threadId, ...(selected ? { myeveEngineeringWorkId: sessionWork.id } : {}) } });
  const context = { toolName: "record_fact", session: { id: sessionId, turn: { id: turnId },
    auth: { current: webAuth(true), initiator: webAuth(false) } } };
  process.env.MYEVE_ENGINEERING_MODE = "dogfood";
  await database.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary)
    VALUES($1,$2,'Sofie','sofie','Engineer','Handle selected Work.',true)`, [agentId, owner]);
  await database.query(`INSERT INTO web_chat_threads(id,owner_id,title,updated_at,chat,agent_id)
    VALUES($1,$2,'Work',1,'{}'::jsonb,$3)`, [threadId, owner, agentId]);
  await database.query(`INSERT INTO agent_runs(id,session_id,owner_id,agent_id,thread_id,executor_kind)
    VALUES($1,$2,$3,$4,$5,'primary-agent')`, [runId, sessionId, owner, agentId, threadId]);
  const [{ version: workVersion }] = await database.query(`SELECT version FROM engineering_work WHERE id=$1`, [sessionWork.id]);
  await database.query(`INSERT INTO context_assemblies(id,owner_id,agent_id,session_id,agent_run_id,thread_id,source_refs,estimated_tokens)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,100)`, [`context-${randomUUID()}`, owner, agentId, sessionId, runId, threadId,
    JSON.stringify([`engineering-work:${sessionWork.id}`, `engineering-work:${sessionWork.id}:v${workVersion}`])]);
  const chatSource = await createKnowledgeSource({ ownerId: owner, sourceType: "chat", provider: "eve",
    externalId: sessionId, referenceUri: `/chat?thread=${threadId}` });
  await knowledge.save({ workId: sessionWork.id, statement: "This session has a bounded source.",
    sourceId: chatSource.id, origin: { type: "owner" } });
  await assert.rejects(createKnowledgeSource({ ownerId: owner, sourceType: "chat", provider: "eve",
    externalId: sessionId, referenceUri: "/chat?thread=forged" }), /unavailable for generic use/);
  assert.equal((await currentConversationProvenance(context, owner, sessionWork.id))[0].sourceId, chatSource.id);
  await assert.rejects(currentConversationProvenance(context, owner), /unavailable for generic use/);
  assert.equal((await knowledge.save({ workId: sessionWork.id, statement: "This session can reuse its source.",
    sourceId: chatSource.id, origin: { type: "owner" } })).source.id, chatSource.id);
  await assert.rejects(knowledge.save({ workId: secondWork.id, statement: "Cross-Work source access.",
    sourceId: chatSource.id, origin: { type: "owner" } }), /earlier fact is unavailable/);
  const generalSource = await createKnowledgeSource({ ownerId: owner, sourceType: "chat", provider: "eve",
    externalId: `general_${randomUUID()}`, referenceUri: "/chat?thread=before" });
  const revisedGeneralSource = await createKnowledgeSource({ ownerId: owner, sourceType: "chat", provider: "eve",
    externalId: generalSource.externalId, referenceUri: "/chat?thread=after" });
  assert.equal(revisedGeneralSource.id, generalSource.id);
  assert.equal(revisedGeneralSource.referenceUri, "/chat?thread=after");

  const generic = await createKnowledge({ ownerId: owner, kind: "fact", statement: "The owner prefers concise notes.",
    createdByType: "owner", provenance: [{ sourceId: correctionSourceA, relation: "supports" }] });
  assert.equal((await getKnowledge(owner, generic.id)).id, generic.id);
  assert.equal(await getKnowledge(owner, original.id), null);
  assert.deepEqual((await listKnowledge(owner, { kind: "fact" })).map(record => record.id), [generic.id]);
  assert.deepEqual((await searchOwnerKnowledge(owner, { type: "fact" })).items.map(item => item.id), [generic.id]);
  assert.equal((await listKnowledgeSources(owner)).some(item => item.id === firstSource), false);
  assert.equal((await listKnowledgeSources(owner)).some(item => item.id === correctionSourceA), true);
  await database.query(`INSERT INTO knowledge_relationships
    (id,owner_id,subject_type,subject_id,predicate,object_type,object_id,confidence)
    VALUES($1,$2,'fact',$3,'supports','fact',$4,1)`, [`relationship_${randomUUID()}`, owner, original.id, generic.id]);
  assert.deepEqual(await listKnowledgeRelationships(owner), []);
  const genericRelation = await createKnowledgeRelationship({ ownerId: owner, subjectType: "fact", subjectId: generic.id,
    predicate: "supports", objectType: "source", objectId: correctionSourceA });
  assert.deepEqual((await listKnowledgeRelationships(owner)).map(item => item.id), [genericRelation.id]);
  await assert.rejects(createKnowledge({ ownerId: owner, kind: "fact", statement: "Unbound correction",
    createdByType: "owner", supersedesId: original.id }), /Superseded knowledge not found/);
  await assert.rejects(transitionKnowledge(owner, original.id, "stale"), /Knowledge record not found/);
  await assert.rejects(addKnowledgeProvenance(owner, original.id,
    { sourceId: correctionSourceA, relation: "confirmed_by" }), /Knowledge record not found/);
  await assert.rejects(createKnowledgeRelationship({ ownerId: owner, subjectType: "fact", subjectId: original.id,
    predicate: "supports", objectType: "fact", objectId: generic.id }), /relationship endpoint not found/);
  await assert.rejects(correctOwnerKnowledge({ ownerId: owner, repository: "knowledge", id: original.id,
    content: "Unbound owner correction" }), /Knowledge record not found/);
  await assert.rejects(forgetOwnerKnowledge({ ownerId: owner, repository: "knowledge", id: original.id }),
    /Knowledge record not found/);
  assert.equal((await knowledge.get(firstWork.id, original.id)).status, "active");
  await addKnowledgeProvenance(owner, generic.id, { sourceId: correctionSourceA, relation: "confirmed_by" });
  assert.equal((await getKnowledge(owner, generic.id)).provenance.length, 2);
  assert.equal((await transitionKnowledge(owner, generic.id, "stale")).status, "stale");
  const genericCorrection = await createKnowledge({ ownerId: owner, kind: "fact", statement: "The owner prefers detailed notes.",
    createdByType: "owner", supersedesId: generic.id, provenance: [{ sourceId: correctionSourceB, relation: "confirmed_by" }] });
  assert.equal((await getKnowledge(owner, generic.id)).supersededById, genericCorrection.id);

  const invalid = [
    { workId: secondWork.id, sourceId: correctionSourceA, supersedesId: original.id },
    { workId: firstWork.id, sourceId: foreignSource, supersedesId: original.id },
    { workId: firstWork.id, sourceId: unreferencedSource, supersedesId: original.id },
  ];
  for (const item of invalid) {
    await assert.rejects(knowledge.save({ ...item, statement: "Invalid correction", origin: { type: "owner" } }),
      /earlier fact is unavailable/);
    assert.equal((await knowledge.get(firstWork.id, original.id)).status, "active");
  }
  await assert.rejects(foreignKnowledge.save({
    workId: firstWork.id, statement: "Cross-owner write", sourceId: foreignSource, origin: { type: "owner" },
  }), /earlier fact is unavailable/);

  const attempts = await Promise.allSettled([correctionSourceA, correctionSourceB].map(sourceId => knowledge.save({
    workId: firstWork.id, statement: "quantity.mjs rejects fractions", confidence: 1,
    sourceId, origin: { type: "owner" }, supersedesId: original.id,
  })));
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(attempts.filter(result => result.status === "rejected").length, 1);
  const corrected = attempts.find(result => result.status === "fulfilled").value;
  assert.equal(corrected.status, "active");
  assert.equal(corrected.supersedesId, original.id);
  assert.equal(corrected.source.relation, "confirmed_by");
  assert.equal((await knowledge.get(firstWork.id, original.id)).status, "superseded");
  assert.equal((await knowledge.get(firstWork.id, original.id)).supersededById, corrected.id);
  assert.deepEqual((await knowledge.list(firstWork.id)).map(record => record.id), [corrected.id]);
  assert.deepEqual(new Set((await knowledge.list(firstWork.id, { includeHistory: true })).map(record => record.id)),
    new Set([original.id, corrected.id]));
  assert.deepEqual((await knowledge.list(firstWork.id, { query: "rejects", status: "active" })).map(record => record.id), [corrected.id]);
  assert.equal((await database.query(`SELECT count(*)::int AS count FROM knowledge_records
    WHERE owner_id=$1 AND supersedes_id=$2`, [owner, original.id]))[0].count, 1);

  await assert.rejects(database.query(`INSERT INTO engineering_work_knowledge
    (scope_id,scope_kind,work_id,knowledge_id,source_id,provenance_relation)
    VALUES($1,'personal',$2,$3,$4,'supports')`, [stranger, foreignWork.id, original.id, foreignSource]),
  /foreign key/);
} finally {
  neonConfig.fetchFunction = previousNeonFetch;
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousEngineeringMode === undefined) delete process.env.MYEVE_ENGINEERING_MODE;
  else process.env.MYEVE_ENGINEERING_MODE = previousEngineeringMode;
  await pool?.end();
  adminUrl.pathname = "/postgres";
  await admin.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await admin.end();
}
