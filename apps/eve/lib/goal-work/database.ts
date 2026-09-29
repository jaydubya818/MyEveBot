import type { GoalDatabase, Query } from "./contracts.ts";
export interface GoalConnection {
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, any>[] }>;
  release(): void;
}
export interface GoalPool {
  connect(): Promise<GoalConnection>;
}
/** Inject an existing qualified connection pool; this module reads no credentials,
 * applies no schema, and creates no connection or role on import. */
export function goalDatabase(pool: GoalPool, ownerId: string): GoalDatabase {
  if (!ownerId.trim() || ownerId.length > 255)
    throw new Error("Authenticated owner required");
  async function transaction<T>(body: (tx: Query) => Promise<T>): Promise<T> {
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query(
        "SELECT set_config('app.owner_id',$1,true),set_config('lock_timeout','5s',true),set_config('statement_timeout','15s',true)",
        [ownerId],
      );
      const output = await body({
        query: async (sql, params) =>
          (await connection.query(sql, params)).rows,
      });
      await connection.query("COMMIT");
      return output;
    } catch (error) {
      await connection.query("ROLLBACK");
      throw error;
    } finally {
      connection.release();
    }
  }
  return {
    transaction,
    query: (sql, params) => transaction((tx) => tx.query(sql, params)),
  };
}
