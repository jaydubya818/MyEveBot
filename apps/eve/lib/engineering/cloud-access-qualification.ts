import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { factoryTransport } from './factory-transport.ts';

export const sofieCloudProject = 'prj_XU7fJW735PtsnKoAYtGfzdnsotIB';
export function cloudQualificationProject(env: Readonly<Record<string,string|undefined>> = process.env) {
 return env.VERCEL_PROJECT_ID === sofieCloudProject;
}
/** Fixed operator diagnostic, never an arbitrary proxy or Work launcher. */
export async function qualifyCloudAccess(request: Request, env: Readonly<Record<string,string|undefined>>, send: typeof fetch = fetch) {
 const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } });
 if (!cloudQualificationProject(env) || env.VERCEL_ENV !== 'preview') return respond({ error: 'NOT_FOUND' }, 404);
 const expected = env.SOFIE_CLOUD_QUALIFICATION_TOKEN;
 const actual = request.headers.get('authorization') ?? '';
 const hash = (s: string) => createHash('sha256').update(s).digest();
 if (!expected || expected.length < 64 || !timingSafeEqual(hash(actual), hash('Bearer ' + expected))) return respond({ error: 'UNAUTHORIZED' }, 401);
 if (request.method !== 'POST' || new URL(request.url).search || await request.text() !== '') return respond({ error: 'INVALID_REQUEST' }, 400);
 try {
  const token = env.FACTORY_SOFIE_STAGING_TOKEN, bypass = env.FACTORY_STAGING_PROTECTION_BYPASS;
  if (!token || !bypass || token === bypass) throw Error('CONFIGURATION');
  const transport = factoryTransport({ origin: env.FACTORY_STAGING_ORIGIN ?? '', token, protectionBypass: bypass,
   transport: 'CLOUD', protocol: 'MYFACTORY_EXECUTION_V2', projectId: 'prj_IRXTY6HOzS2q9wRPdabsJnmddzl4' });
  const deniedWork = { protocol: 'MYFACTORY_EXECUTION_V2', requestId: randomUUID(), workId: randomUUID(), workGeneration: 1,
   repository: 'qualification/unauthorized', source: {repository: 'qualification/unauthorized', commit: 'a'.repeat(40), tree: 'b'.repeat(40)},
   deadline: new Date(Date.now()+60000).toISOString(), maxSpendUsd: 0.01,
   input: {title: 'Unauthorized scope probe', description: 'Must be denied without creating Work', kind: 'investigation', acceptanceCriteria: ['Denied'], checkCommands: ['true'], allowedPaths: ['file.txt']} };
  const cases = [
   {name: 'without_bypass', headers: {authorization: 'Bearer '+token}, path: '/actions'},
   {name: 'bypass_only', headers: {'x-vercel-protection-bypass': bypass}, path: '/actions'},
   {name: 'authorized_identity', headers: transport.headers, path: '/actions'},
   {name: 'invalid_identity', headers: {...transport.headers, authorization: 'Bearer invalid-qualification-identity'}, path: '/actions'},
   {name: 'missing_work_authority', headers: transport.headers, path: '/dispatches', body: JSON.stringify(deniedWork)},
  ];
  const results = [];
  for (const item of cases) {
   const response = await send(new URL(transport.prefix+item.path, transport.origin), {method: item.body ? 'POST' : 'GET', headers: item.headers as Record<string,string>, body: item.body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15000)});
   const reader = response.body?.getReader(); let text = '', bytes = 0;
   if(reader) {try {while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>128000)throw Error('RESPONSE_BOUND');text+=new TextDecoder().decode(chunk.value);}} finally {await reader.cancel();}}
   if ([token,bypass,expected,env.VERCEL_AUTOMATION_BYPASS_SECRET].filter((secret): secret is string=>!!secret).some(secret=>text.includes(secret))) throw Error('CREDENTIAL_DISCLOSURE');
   let body: Record<string,unknown> = {}; try {body=JSON.parse(text);} catch { /* Provider protection can return HTML. */ }
   const pass = item.name==='without_bypass' ? [302,307,401,403].includes(response.status) && body.error!=='UNAUTHORIZED'
    : item.name==='authorized_identity' ? response.status===200 && body.admission==='DISABLED' && body.qualificationOnly===true
    : item.name==='missing_work_authority' ? response.status===403 && body.error==='WORK_AUTHORITY_DENIED'
    : response.status===401 && body.error==='UNAUTHORIZED';
   results.push({name:item.name,status:response.status,pass});
  }
  return respond({kind:'CONNECTED', results, passed: results.every(r=>r.pass), cloudProductionAdmission:'DISABLED', paidModelCalls:0, workDispatched:false}, results.every(r=>r.pass)?200:409);
 } catch {return respond({error:'ACCESS_QUALIFICATION_FAILED'},503);}
}
