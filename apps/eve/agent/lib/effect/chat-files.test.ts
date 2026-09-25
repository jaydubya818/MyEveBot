import { Effect, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatFiles, ChatFilesLive } from "./chat-files";
import { Db, type DbRow, type DbStatement } from "./db";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("chat file owner identity", () => {
  it("never claims legacy rows on behalf of the listing owner", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://chat-files.test/database");
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const query = (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      return Effect.succeed([] as DbRow[]);
    };
    const database = Layer.succeed(Db, {
      query,
      transaction: (statements: readonly DbStatement[]) =>
        Effect.forEach(statements, (statement) =>
          query(statement.sql, statement.params),
        ),
    });
    const layer = ChatFilesLive.pipe(Layer.provide(database));

    await Effect.runPromise(
      Effect.gen(function* () {
        const files = yield* ChatFiles;
        return yield* files.list("deployment-owner");
      }).pipe(Effect.provide(layer)),
    );

    const create = queries.find(({ sql }) => sql.includes("CREATE TABLE IF NOT EXISTS chat_files"));
    const claim = queries.find(({ sql }) => sql.includes("UPDATE chat_files SET owner_id"));
    expect(create?.sql).not.toContain("DEFAULT 'web:owner'");
    expect(claim).toBeUndefined();
    expect(queries.find(({ sql }) => sql.includes("WHERE f.owner_id = $1"))?.params).toContain("deployment-owner");
  });
});
