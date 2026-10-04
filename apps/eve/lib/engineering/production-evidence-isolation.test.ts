import {describe,it,expect,vi} from 'vitest';
vi.mock('./factory-request-headers.ts',()=>({factoryRequestHeaders:async()=>({authorization:'Bearer proof-test'})}));
import {productionEvidenceIsolation} from './production-evidence-isolation.ts';
import {WorkStore} from './store.ts';
import type {FactoryConnection} from './factory-live-adapter.ts';
import type {verifyEvidence} from './factory-evidence.ts';
const store=new WorkStore({scopeId:'owner',actorId:'owner',scopeKind:'personal'},{query:async()=>[]});
const connection={transport:'CLOUD',protocol:'MYFACTORY_EXECUTION_V2',projectId:'prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK',origin:'https://myfactory-cloud-production.vercel.app',releaseValidation:true,token:'application',evidence:{token:'proof',ownerScope:'owner',expiresAt:'2099-01-01T00:00:00.000Z'}} as unknown as FactoryConnection;
const evidence=['TestEvidence','DiffEvidence'].map(kind=>({scope:{ownerScope:'owner',repository:'owner/repo',workId:'11111111-1111-4111-8111-111111111111',workGeneration:1,requestId:'request'},ref:{kind,workOrderId:'order',runId:'run',candidateCommit:'candidate',factoryVersion:'version',sha256:'digest'},proofReference:'reference',bytes:Buffer.from('retained')})) as ReturnType<typeof verifyEvidence>[];
describe('live evidence negative probes',()=>{
 it('requires exact Factory denials and independently denied MyEve reads for both retained kinds',async()=>{
  const fetcher=vi.fn(async(_url,init)=>{const body=JSON.parse(init.body);expect(body.ownerScope!=='owner'||body.workId!==evidence[0].scope.workId).toBe(true);return Response.json({error:'NOT_FOUND'},{status:404});});
  expect(await productionEvidenceIsolation(store,connection,'result',evidence,fetcher as typeof fetch)).toMatchObject({crossOwnerDisclosures:0,crossWorkDisclosures:0});expect(fetcher).toHaveBeenCalledTimes(4);
 });
 it.each([200,401,403,503])('does not label HTTP %i as successful isolation',async status=>{
  await expect(productionEvidenceIsolation(store,connection,'result',evidence,async()=>Response.json({error:'NOT_FOUND'},{status}))).rejects.toThrow('VALIDATION_FACTORY_ISOLATION_FAILED');
 });
 it('rejects any response disclosure even with a not-found status',async()=>{
  await expect(productionEvidenceIsolation(store,connection,'result',evidence,async()=>Response.json({error:'NOT_FOUND',base64:'data'},{status:404}))).rejects.toThrow();
 });
});
