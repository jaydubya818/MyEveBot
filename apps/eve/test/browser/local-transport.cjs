// Test-only transport adapters. No production feature flag or storage fallback.
const { Pool } = require('pg');
const { Agent, Dispatcher, setGlobalDispatcher } = require('undici');
const configured = new URL(process.env.MYEVE_TEST_DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(configured.hostname) || !configured.port || configured.pathname !== '/blocker_fixes') throw new Error('Use the isolated local blocker_fixes database.');
const pool = new Pool({connectionString: configured.href, max:8});
const originalFetch = globalThis.fetch;
const fixtureOrigin = 'http://127.0.0.1:3074';
const localAgent = new Agent();
class LocalOnlyDispatcher extends Dispatcher {
  dispatch(options, handler) {
    const origin = new URL(options.origin);
    if (origin.hostname === 'fixture.private.blob.vercel-storage.com') {
      return localAgent.dispatch({...options, origin:fixtureOrigin,
        path:'/content?pathname='+encodeURIComponent(new URL(options.path,origin).pathname.slice(1))},handler);
    }
    if (!['localhost','127.0.0.1','[::1]'].includes(origin.hostname)) throw new Error('External network denied in acceptance tests');
    return localAgent.dispatch(options,handler);
  }
}
setGlobalDispatcher(new LocalOnlyDispatcher());
globalThis.fetch = async (input, init) => {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const connection = headers.get('Neon-Connection-String');
  if (connection) {
    if (new URL(connection).href !== configured.href) throw new Error('Non-isolated database denied');
    const body = JSON.parse(init.body), client = await pool.connect();
    try {
      if (body.queries) await client.query('BEGIN');
      const results=[];
      for (const q of body.queries??[body]) {const r=await client.query({text:q.query,values:q.params,rowMode:'array',types:{getTypeParser:()=>x=>x}});results.push({fields:r.fields,rows:r.rows,command:r.command,rowCount:r.rowCount});}
      if(body.queries)await client.query('COMMIT');
      return Response.json(body.queries?{results}:results[0]);
    } catch(e) {if(body.queries)await client.query('ROLLBACK');return Response.json({message:e.message,code:e.code},{status:400});}
    finally {client.release();}
  }
  const u=new URL(typeof input==='string'?input:input.url??input);
  if(!['localhost','127.0.0.1','::1','fixture.private.blob.vercel-storage.com'].includes(u.hostname))throw new Error('External fetch denied in acceptance tests');
  return originalFetch(input,init);
};
