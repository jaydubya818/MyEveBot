import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Effect, Layer } from "effect";
import { ChatFiles, ChatFilesLive } from "../../agent/lib/effect/chat-files";
import { Db, DatabaseError, type DbRow, type DbStatement } from "../../agent/lib/effect/db";

// Run after blockers.spec.cjs. No seeded chat_files records: this inspects the
// file produced by the actual browser composer and its real database metadata.
const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const url = new URL(process.env.MYEVE_TEST_DATABASE_URL ?? "");
assert(["localhost", "127.0.0.1"].includes(url.hostname));
assert.equal(url.pathname, "/blocker_fixes");
assert(url.port);
process.env.DATABASE_URL = url.href;
const pool = new Pool({ connectionString: url.href });
const query = (sql: string, params: unknown[] = []) => Effect.tryPromise({
  try: async () => (await pool.query(sql, params)).rows as DbRow[],
  catch: (cause) => new DatabaseError({ cause }),
});
const database = Layer.succeed(Db, { query, transaction: (statements: readonly DbStatement[]) =>
  Effect.forEach(statements, (statement) => query(statement.sql, statement.params)),
});
try {
  await Effect.runPromise(Effect.gen(function* () {
    const files = yield* ChatFiles;
    const owned = yield* files.list("acceptance-sarah");
    const target = owned.find((file) => file.filename.startsWith("atlas-"));
    assert(target, "The browser-uploaded file must exist before isolation qualification");
    const other = yield* files.list("acceptance-owner-b");
    assert(!other.some((file) => file.id === target.id));
    const denied = yield* files.open("acceptance-owner-b", target.id).pipe(Effect.result);
    assert.equal(denied._tag, "Failure");
    if (denied._tag === "Failure") assert.equal(denied.failure._tag === "ChatFileError" && denied.failure.code, "not_found");
    const [row] = yield* query("SELECT owner_id, thread_id, blob_path, blob_url FROM chat_files WHERE id=$1", [target.id]);
    assert.equal(row.owner_id, "acceptance-sarah");
    assert.equal(row.thread_id, target.threadId);
    assert.equal(row.blob_path, `chat-files/${target.id}/${target.filename}`);
    assert.equal(row.blob_url, `https://fixture.private.blob.vercel-storage.com/${row.blob_path}`);
    console.log("PASS: 5 file checks: owner list isolation, owner read denial, authenticated owner, thread identity, canonical storage reference");
  }).pipe(Effect.provide(ChatFilesLive.pipe(Layer.provide(database)))));
} finally { await pool.end(); }
