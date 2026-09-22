import assert from 'node:assert/strict';
/** Optional shared isolated fixture, never the qualified owner databases. */
export function localSqlFixture(fallback) {
  if(!process.env.RUN_TEST_DATABASE_URL)return fallback;
  const u=new URL(process.env.RUN_TEST_DATABASE_URL);
  assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/fq_run_lifecycle_test');
  return {connectionString:u.href,ssl:false,max:8};
}
