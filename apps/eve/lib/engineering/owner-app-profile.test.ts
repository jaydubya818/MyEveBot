import {describe,it,expect,beforeAll,afterAll} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {localLiveFactoryEnabled,ownerAppFactoryConfig,type OwnerAppProfile} from './owner-app-profile.ts';
import {digest} from './contract.ts';
import type {Work} from './types.ts';

let root:string,repo:string,baseSha:string;
const owner='owner-1',hex=(c:string)=>c.repeat(64);
beforeAll(()=>{
 root=mkdtempSync(join(tmpdir(),'owner-app-profile-'));repo=join(root,'repo');mkdirSync(join(repo,'src'),{recursive:true});
 const git=(...a:string[])=>execFileSync('git',['-C',repo,...a],{encoding:'utf8'}).trim();
 git('init','-q');writeFileSync(join(repo,'package.json'),'{}\n');writeFileSync(join(repo,'src','App.jsx'),'export default 1;\n');writeFileSync(join(repo,'.gitignore'),'node_modules\n');
 git('add','.');git('-c','user.name=t','-c','user.email=t@example.invalid','commit','-qm','base');baseSha=git('rev-parse','HEAD');
 writeFileSync(join(repo,'src','App.jsx'),'uncommitted\n');
});
afterAll(()=>rmSync(root,{recursive:true,force:true}));
type Profile=Omit<OwnerAppProfile,'connection'>&{connection:{qualification:Record<string,unknown>}&Record<string,unknown>};
function profile(overrides:Partial<Profile>={}):Profile{
 const sourceDigest=hex('1'),configurationDigest=hex('2');
 return {ownerId:owner,agentId:'agent-1',repository:'owner/app',repositoryPath:repo,baseBranch:'main',baseSha,
  allowedPaths:['src/App.jsx','src/App.test.jsx'],checks:[{id:'build',command:'vite build'},{id:'test',command:'vitest run'}],
  image:'sha256:'+hex('9'),limits:{maxCostUsd:1.35,maxDurationSeconds:600},
  connection:{origin:'http://127.0.0.1:8789',token:hex('a'),factoryId:'factory-local',sourceDigest,configurationDigest,
   factoryVersion:digest({sourceDigest,configurationDigest}),repositoryPath:repo,
   keys:[{factoryId:'factory-local',keyId:'k',publicKey:'pem',activeFrom:'2026-01-01T00:00:00Z',notAfter:'2027-01-01T00:00:00Z'}],
   qualification:{scopeId:owner,profileHash:hex('0'),evidenceRef:'owner local live',qualifiedAt:'2026-11-01T00:00:00Z',expiresAt:'2026-12-01T00:00:00Z',mode:'LIVE',spendEnforced:true}},
  ...overrides} as Profile;
}
function work(overrides:Partial<Work>={}):Work{
 return {id:randomUUID(),scopeId:owner,repository:'owner/app',objective:'Build a counter with a reset button',maxCostUsd:1.35,maxDurationSeconds:600,
  criteria:[{id:randomUUID(),statement:'Clicking + increments',method:'test'},{id:randomUUID(),statement:'Reset returns to 0',method:'test'}],...overrides} as Work;
}
describe('owner app Factory profile',()=>{
 it('is enabled only by the explicit host switch in local dogfood',()=>{
  const env={MYEVE_FACTORY_LOCAL_LIVE:'true',MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_FACTORY_OWNER_PROFILE:'/abs/profile.json'} as unknown as NodeJS.ProcessEnv;
  expect(localLiveFactoryEnabled(env)).toBe(true);
  expect(localLiveFactoryEnabled({...env,MYEVE_FACTORY_LOCAL_LIVE:'1'})).toBe(false);
  expect(localLiveFactoryEnabled({...env,VERCEL_ENV:'production'})).toBe(false);
  expect(localLiveFactoryEnabled({...env,MYEVE_ENGINEERING_MODE:'private-alpha'})).toBe(false);
  expect(()=>localLiveFactoryEnabled({...env,MYEVE_FACTORY_OWNER_PROFILE:'relative.json'})).toThrow();
 });
 it('derives objective, criteria and per-criterion command checks from the Work, with the base read from Git at the pinned SHA',async()=>{
  const w=work(),config=await ownerAppFactoryConfig(w,profile());
  expect(config.engineering.objective).toBe(w.objective);
  expect(config.engineering.criteria).toEqual(w.criteria);
  expect(config.engineering.profile.checks).toEqual([{id:'build',command:'vite build',criterionIds:w.criteria.map(c=>c.id)},{id:'test',command:'vitest run',criterionIds:w.criteria.map(c=>c.id)}]);
  expect(config.commands).toEqual(['vite build','vitest run']);
  expect(config.routing).toEqual({intent:'PRODUCE',boundedOperationQualified:false});
  expect(config.engineering.approvedBase.sha).toBe(baseSha);
  expect(config.engineering.approvedBase.files.find(f=>f.path==='src/App.jsx')!.sha256).toBe(createHash('sha256').update('export default 1;\n').digest('hex'));
  expect(config.engineering.approvedBase.files.map(f=>f.path)).toEqual(['.gitignore','package.json','src/App.jsx']);
  expect(config.connection.qualification.profileHash).toBe(digest(config.engineering.profile));
 });
 it('refuses Work outside the bound owner, repository or the $1.35 / 600 s envelope',async()=>{
  for(const w of [work({scopeId:'other'}),work({repository:'owner/other'}),work({maxCostUsd:1.36}),work({maxDurationSeconds:601}),
   work({criteria:[{id:randomUUID(),statement:'Owner judges',method:'human'}]})])
   await expect(ownerAppFactoryConfig(w,profile())).rejects.toThrow();
 });
 it('refuses a non-loopback, non-LIVE or mismatched Factory connection',async()=>{
  const base=profile();
  for(const connection of [{...base.connection,origin:'https://factory.example.com'},{...base.connection,origin:'http://localhost:8789'},
   {...base.connection,qualification:{...base.connection.qualification,mode:'LOCAL_FIXTURE'}},{...base.connection,repositoryPath:'/tmp/elsewhere'},
   {...base.connection,qualification:{...base.connection.qualification,scopeId:'other'}}])
   await expect(ownerAppFactoryConfig(work(),profile({connection}))).rejects.toThrow();
  await expect(ownerAppFactoryConfig(work(),profile({limits:{maxCostUsd:2,maxDurationSeconds:600}}))).rejects.toThrow();
 });
});
describe('LIVE Factory tool authorization',()=>{
 it('allows LIVE only under the host switch, on loopback, with qualified spend admission',async()=>{
  const {liveFactoryAuthorized}=await import('./owner-app-profile.ts');
  const env={MYEVE_FACTORY_LOCAL_LIVE:'true',MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_FACTORY_OWNER_PROFILE:'/abs/p.json'} as unknown as NodeJS.ProcessEnv;
  const c=profile().connection as Record<string,unknown>&{qualification:Record<string,unknown>};
  const spend={spendContract:{version:'WORK_LEDGER_V2',sourceDigest:hex('1')},spendPlan:{version:'WORK_LEDGER_V2',pricingRevision:'r1',plannedProductiveOperations:2,plannedCompletionOperations:1,maxPaidOperations:3,completionReserveMicrousd:336864}};
  const proof={status:'QUALIFIED',evidenceRef:'owner local'};
  const review={environment:'LIVE',sourceDigest:hex('1'),factoryVersion:c.factoryVersion,expiresAt:'2099-01-01T00:00:00Z',hardCeiling:proof,preCallEnforcement:proof,accounting:proof,unknownRetention:proof,completion:proof,pricing:{...proof,model:'m',revision:'r1',validUntil:'2099-01-01T00:00:00Z'}};
  const live={...c,...spend,qualification:{...c.qualification,spendReview:review}};
  expect(liveFactoryAuthorized(live as never,env)).toBe(true);
  expect(liveFactoryAuthorized(live as never,{...env,MYEVE_FACTORY_LOCAL_LIVE:'false'})).toBe(false);
  expect(liveFactoryAuthorized({...live,origin:'http://10.0.0.2:8789'} as never,env)).toBe(false);
  expect(liveFactoryAuthorized({...live,qualification:{...live.qualification,spendReview:undefined}} as never,env)).toBe(false);
 });
});
