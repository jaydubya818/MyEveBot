import { Pool, type PoolClient } from "pg";

let pool: Pool | null = null;

function databaseUrl(): string {
  const value = process.env.MANAGED_EVE_DATABASE_URL;
  if (!value) throw new Error("Managed Eve control database is not configured");
  return value;
}

export function managedDb(): Pool {
  pool ??= new Pool({ connectionString: databaseUrl(), max: 3, idleTimeoutMillis: 10_000 });
  return pool;
}

export async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await managedDb().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
