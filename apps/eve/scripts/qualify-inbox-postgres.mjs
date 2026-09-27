// Disposable local cluster only. Never reads DATABASE_URL or migration configuration.
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import { PostgresAttentionRepository } from '../lib/universal-inbox/postgres-repository.ts';
import { UniversalInbox } from '../lib/universal-inbox/service.ts';
import { decisionEvent, FIXTURE_NOW, answerFor } from '../lib/universal-inbox/fixtures.ts';
import { todayContribution, dailyBriefContribution } from '../lib/universal-inbox/feeds.ts';

const execFile = promisify(execFileCallback);
const bin = '/opt/homebrew/opt/postgresql@17/bin';
const output = resolve('../../docs/verification/beta-integration/regressions/inbox');
const dir = await mkdtemp(join(tmpdir(), 'inbox-pg-'));
const socket = join(dir, 'socket'); await mkdir(socket);
let started = false; let admin; let runtime;
const checks = [];
try {
  await execFile(join(bin, 'initdb'), ['-D', join(dir, 'data'), '-U', 'inbox_admin', '--auth-local=trust', '--auth-host=reject', '--no-locale', '-E', 'UTF8']);
  await execFile(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-l', join(dir, 'postgres.log'), '-o', `-k ${socket} -h '' -p 55481`, '-w', 'start']); started = true;
  admin = new pg.Pool({ host: socket, port: 55481, user: 'inbox_admin', database: 'postgres', max: 1 });
  const schema = await readFile('../../docs/universal-inbox/activation/schema.sql', 'utf8');
  await admin.query('BEGIN'); await admin.query(schema); await admin.query('ROLLBACK');
  assert.equal((await admin.query("SELECT to_regclass('inbox_attention_items') AS name")).rows[0].name, null); checks.push('schema transaction rollback');
  await admin.query('BEGIN'); await admin.query(schema); await admin.query('COMMIT');
  await admin.query('CREATE ROLE inbox_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS');
  await admin.query('GRANT USAGE ON SCHEMA public TO inbox_runtime');
  await admin.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  await admin.query('GRANT SELECT,INSERT,UPDATE ON inbox_attention_items,inbox_attention_evidence,inbox_attention_responses TO inbox_runtime');
  runtime = new pg.Pool({ host: socket, port: 55481, user: 'inbox_runtime', database: 'postgres', max: 8 });
  const repository = new PostgresAttentionRepository(runtime);
  const inbox = new UniversalInbox('owner-a', repository, () => FIXTURE_NOW);
  const event = { ...decisionEvent(), workGeneration: 3, workVersion: 7 };
  const items = await Promise.all(Array.from({ length: 16 }, () => inbox.ingest(event)));
  assert.equal(new Set(items.map(item => item.id)).size, 1);
  assert.equal((await repository.evidence('owner-a', items[0].id))[0].deliveries, 16); checks.push('16 concurrent source replays, one item');
  const other = new UniversalInbox('owner-b', repository, () => FIXTURE_NOW);
  assert.equal((await other.list()).items.length, 0);
  await assert.rejects(other.respond(answerFor(items[0])), /NOT_FOUND/);
  await other.ingest(event); assert.equal((await other.list()).items.length, 1); checks.push('cross-owner isolation including identical source IDs');
  assert.equal((await runtime.query('SELECT * FROM inbox_attention_items')).rows.length, 0); checks.push('RLS denies reads without transaction owner');
  await assert.rejects(runtime.query('TRUNCATE inbox_attention_items'), /permission denied/);
  await assert.rejects(runtime.query('DELETE FROM inbox_attention_items'), /permission denied/);
  await assert.rejects(runtime.query('CREATE TABLE forbidden(id int)'), /permission denied/); checks.push('runtime denied DDL, delete and truncate');
  const c = await runtime.connect();
  try {
    await c.query('BEGIN'); await c.query("SELECT set_config('myeve.inbox_owner','owner-a',true)");
    const wrong = { ...items[0], ownerId: 'owner-b', id: 'forged-item' };
    await assert.rejects(c.query('INSERT INTO inbox_attention_items(owner_id,id,data) VALUES($1,$2,$3)', ['owner-b', wrong.id, wrong]), /row-level security/);
    await c.query('ROLLBACK');
  } finally { c.release(); }
  checks.push('RLS WITH CHECK rejects cross-owner writes');
  await assert.rejects(repository.transaction(async tx => {
    await tx.getItem('owner-a', items[0].id);
    await tx.getItem('owner-b', items[0].id);
  }), /CROSS_OWNER_TRANSACTION/);
  await assert.rejects(repository.transaction(async tx => {
    const item = await tx.getItem('owner-a', items[0].id); item.title = 'uncommitted'; item.revision++;
    await tx.saveItem(item); throw new Error('process-loss boundary');
  }), /process-loss/);
  assert.notEqual((await inbox.get(items[0].id)).title, 'uncommitted'); checks.push('item rollback and owner transaction fencing');
  const responses = await Promise.all(Array.from({ length: 16 }, () => inbox.respond(answerFor(items[0]))));
  assert.equal(new Set(responses.map(response => response.id)).size, 1);
  assert.equal((await repository.pending('owner-a', 100)).length, 1); checks.push('16 concurrent owner retries, one response');
  await inbox.deliver({ accept: async () => ({ status: 'stale', receipt: 'generation-advanced' }) });
  assert.equal((await inbox.get(items[0].id)).status, 'SUPERSEDED');
  await assert.rejects(repository.transaction(async tx => {
    const item = await tx.getItem('owner-a', items[0].id); item.status = 'NEEDS_ACTION'; item.action = items[0].action; item.actionBinding = items[0].actionBinding; item.revision++; await tx.saveItem(item);
  }), /Stale or redirected/); checks.push('terminal-state database fence');
  await assert.rejects(repository.transaction(async tx => {
    const response = await tx.getResponse('owner-a', responses[0].id); response.answer = 'B'; await tx.saveResponse(response);
  }), /Immutable owner response/); checks.push('historical answer immutability');
  for (let n = 0; n < 500; n++) await inbox.ingest({ ...decisionEvent(n + 20), correlationId: `perf-${n}`, workGeneration: 3, workVersion: 7, priority: { blockingActiveWork: true } });
  const operations = {
    Inbox: () => inbox.list({ limit: 50 }), NeedsYou: () => inbox.list({ view: 'needs_you', limit: 50 }),
    Today: () => todayContribution(inbox, '2026-09-26T00:00:00.000Z', FIXTURE_NOW),
    DailyBrief: () => dailyBriefContribution(inbox, '2026-09-26T00:00:00.000Z', FIXTURE_NOW),
    WorkThread: () => inbox.list({ view: 'thread', workId: 'fixture-work', limit: 50 }),
  };
  const timings = {};
  for (const [name, run] of Object.entries(operations)) {
    const values = [];
    for (let n = 0; n < 30; n++) { const start = performance.now(); await run(); values.push(performance.now() - start); }
    values.sort((a,b) => a-b); timings[name] = { samples: 30, p50Ms: +values[14].toFixed(3), p95Ms: +values[28].toFixed(3) };
  }
  const today = await todayContribution(inbox, '2026-09-26T00:00:00.000Z', FIXTURE_NOW);
  assert.equal(today.needsYouCount.capped, true); assert.equal(today.needsYou.items.length, 20); checks.push('bounded feed/count/thread queries');
  const plan = await admin.query("EXPLAIN (FORMAT JSON) SELECT data FROM inbox_attention_items WHERE owner_id='owner-a' AND needs_action=1 ORDER BY score DESC,deadline,id LIMIT 50");
  await writeFile(join(output, 'postgres.json'), JSON.stringify({ mode: 'disposable local PostgreSQL 17, no production activation', checks, crossOwnerDisclosures: 0,
    duplicateConsequentialResponses: 0, timings, queryPlan: plan.rows, recordedAt: new Date().toISOString() }, null, 2)+'\n');
  console.log(JSON.stringify({ checks, timings }));
} finally {
  if (runtime) await runtime.end(); if (admin) await admin.end();
  if (started) await execFile(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', '-w', 'stop']);
  await rm(dir, { recursive: true, force: true });
}
