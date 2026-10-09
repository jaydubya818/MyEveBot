import assert from 'node:assert/strict';
/** Optional shared isolated fixture, never the qualified owner databases. */
export function localSqlFixture(fallback) {
  if(!process.env.RUN_TEST_DATABASE_URL)return fallback;
  const u=new URL(process.env.RUN_TEST_DATABASE_URL);
  assert.equal(u.hostname,'127.0.0.1');
  assert.ok((u.port==='55439' && u.pathname==='/myeve_combined_v1') || (u.port==='55509' && u.pathname==='/myeve_beta_publication'), 'Only named disposable qualification databases are allowed');
  return {connectionString:u.href,ssl:false,max:8};
}
