type Admin = {
  query(sql: string, params?: unknown[]): Promise<{ rows: { pid: number }[] }>;
};

// Disposable composition fixtures only. Pool.end() can resolve before the
// PostgreSQL backend observes the socket close; a forced drop then emits 57P01.
export async function dropIdleCompositionDatabase(admin: Admin, name: string) {
  if (!/^myapps_composition_[a-f0-9]{32}$/.test(name))
    throw new Error('COMPOSITION_DATABASE_NAME_REQUIRED');
  for (let attempt = 0; attempt < 100; attempt++) {
    const { rows } = await admin.query(
      'SELECT pid FROM pg_stat_activity WHERE datname=$1', [name],
    );
    if (rows.length === 0) {
      // PostgreSQL also refuses this non-forced drop if a new session appears.
      await admin.query('DROP DATABASE IF EXISTS ' + name);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('COMPOSITION_DATABASE_SESSIONS_STILL_OPEN');
}
