import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=await readFile(new URL('./check-production-trust-denial.mjs',import.meta.url),'utf8');
const claims={project_id:'prj_L6faw25wnFGUZtrLKBIccg8gIDLR',owner_id:'team_p8z8exJRTGfOPk1GC9vUOpv3',environment:'preview',exp:Math.floor(Date.now()/1000)+600};
async function run({env={},claim={},status=403,code='TRUSTED_SOURCES_ENVIRONMENT_MISMATCH'}={}) {
 const token='signature.'+Buffer.from(JSON.stringify({...claims,...claim})).toString('base64url')+'.signature';
 const process={env:{VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:claims.project_id,VERCEL_OIDC_TOKEN:token,...env},exitCode:0};
 const calls=[],logs=[];
 await vm.runInNewContext(`(async()=>{${source}})()`,{process,Buffer,Date,AbortSignal,console:{log:value=>logs.push(value),error:value=>logs.push(value)},fetch:async(...args)=>{calls.push(args);return {status,headers:new Headers({'x-vercel-error':code}),body:{cancel:async()=>{}}};}});
 assert.ok(!logs.join('\n').includes(token));
 return {process,calls,logs,token};
}
test('requires an exact provider trust denial, never application authentication denial',async()=>{
 const result=await run();assert.equal(result.process.exitCode,0);assert.equal(result.calls.length,1);
 const [url,options]=result.calls[0];assert.equal(url,'https://myfactory-cloud-production.vercel.app/api/readiness');assert.equal(options.redirect,'manual');assert.deepEqual(Object.keys(options.headers),['x-vercel-trusted-oidc-idp-token']);
 const report=JSON.parse(result.logs[0]);assert.equal(report.status,'PASS');assert.equal(report.modelOperations,0);
 for(const response of [{status:401,code:''},{status:200,code:''},{status:403,code:'OTHER_ERROR'},{status:302,code:''}])assert.equal((await run(response)).process.exitCode,1);
});
for(const [name,patch] of Object.entries({local:{env:{VERCEL:'0'}},production:{env:{VERCEL_ENV:'production'}},otherProject:{env:{VERCEL_PROJECT_ID:'other'}},wrongTokenProject:{claim:{project_id:'other'}},wrongTokenEnvironment:{claim:{environment:'production'}},expired:{claim:{exp:1}}}))test('no request for '+name,async()=>{const r=await run(patch);assert.equal(r.calls.length,0);assert.equal(r.process.exitCode,1);});
