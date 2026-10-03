import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdtempSync,rmSync,chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
const trigger=JSON.parse(readFileSync(path.resolve(import.meta.dirname,'../../../../.github/'+(process.env.MYEVE_CONSOLIDATION_P0==='1'?'consolidation-cloud-qualification.json':'cloud-qualification-trigger.json')),'utf8'));
const enabled=process.env.MYEVE_CLOUD_P0==='approved-deterministic-staging';
// The backend proxy carries only the separately authorized Sofie protection
// credential. This browser never receives Factory infrastructure credentials.
const credentials=()=>JSON.parse(readFileSync(process.env.MYEVE_CLOUD_OWNER_CREDENTIAL_FILE!,'utf8')) as {MYEVE_ACCESS_PASSWORD:string};
async function login(page:Page){await page.goto('/login');await page.getByLabel('Your access password').fill(credentials().MYEVE_ACCESS_PASSWORD);await page.getByRole('button',{name:'Open Sofie',exact:true}).click();await page.waitForURL(u=>u.pathname!=='/login');}
async function read(page:Page,path:string){return page.evaluate(async path=>{const r=await fetch(path);if(!r.ok)throw Error('Canonical read failed: '+r.status);return r.json();},path);}
test('P0 real Eve → canonical CLOUD Work → browser-off → independent Proof',async({browser,baseURL},info)=>{
 test.skip(!enabled,'NOT_RUN: dedicated staging configuration and explicit deterministic runner activation are required.');
 expect(Object.keys(process.env).filter(k=>/FACTORY.*(TOKEN|BYPASS|SECRET|OIDC)/i.test(k))).toEqual([]);
 const report:any={kind:'CONNECTED',modelBoundary:'DETERMINISTIC',retries:0,startedAt:new Date().toISOString(),macOff:process.env.GITHUB_ACTIONS==='true'?'REMOTE_RUNNER_NO_MAC_DEPENDENCY':'NOT_RUN',runner:process.env.GITHUB_RUN_ID??'local',status:'RUNNING'};
 let context=await browser.newContext({baseURL}),page=await context.newPage(),tracing=false;
 const traces=mkdtempSync(path.join(tmpdir(),'cloud-p0-trace-'));let phase=0;
 async function retainTrace(){if(!tracing)return;tracing=false;const raw=path.join(traces,'raw-'+phase+'.zip'),clean=path.join(traces,'safe-'+phase+'.zip');const secrets=[...Object.values(credentials()),...(await context.cookies()).map(c=>c.value)];await context.tracing.stop({path:raw});chmodSync(raw,0o600);const sanitized=spawnSync('python3',[path.join(import.meta.dirname,'sanitize-trace.py'),raw,clean],{input:JSON.stringify(secrets),encoding:'utf8'});rmSync(raw,{force:true});if(sanitized.status!==0)throw Error('TRACE_CREDENTIAL_SCAN_FAILED');await info.attach('cloud-trace-'+phase++,{path:clean,contentType:'application/zip'});}
 try{
  await login(page);await context.tracing.start({snapshots:true,screenshots:true,sources:false});tracing=true;const before=(await read(page,'/api/beta/work')).works.map((w:any)=>w.id);
  await page.goto('/chat');const session=page.waitForResponse(r=>new URL(r.url()).pathname==='/eve/v1/session'&&r.request().method()==='POST');
  await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill('Sofie, please implement project slug validation, verify the change, and bring it back for my review.');await page.getByRole('button',{name:'Send',exact:true}).click();expect((await session).status()).toBe(202);
  let created:any[]=[];await expect.poll(async()=>{created=(await read(page,'/api/beta/work')).works.filter((w:any)=>!before.includes(w.id));return created.length;},{timeout:90000,intervals:[2000]}).toBe(1);
  const work=created[0];report.workId=work.id;expect(work.control).toBe('paused');
  await page.goto('/work?kind=work&id='+work.id);await expect(page.getByRole('button',{name:'Resume Work',exact:true})).toBeVisible();
  const resumed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/beta/work'&&r.request().method()==='POST');await page.getByRole('button',{name:'Resume Work',exact:true}).click();const r=await resumed;expect(r.status()).toBe(200);const queued=await r.json();expect(queued.admission.status).toBe('QUEUED');report.generation=queued.work.generation;report.commandId=queued.admission.receipt.command.id;
  await retainTrace();await context.close();report.browserClosedAt=new Date().toISOString();
  // No browser poll, local worker or local verifier drives this interval.
  await new Promise(resolve=>setTimeout(resolve,210000));
  context=await browser.newContext({baseURL});page=await context.newPage();await login(page);await context.tracing.start({snapshots:true,screenshots:true,sources:false});tracing=true;report.reconnectedAt=new Date().toISOString();
  const results=(await read(page,'/api/beta/results')).results.filter((r:any)=>r.work_id===work.id);expect(results).toHaveLength(1);const result=results[0];expect(result.route).toBe('MYFACTORY');expect(result.proof.artifactRefs).toContain('factory-version:'+trigger.factoryVersion);expect(result.proof.evidence.length).toBeGreaterThan(0);expect(result.proof.evidence.every((e:any)=>e.state==='PASS'&&e.producer==='trusted-verifier')).toBe(true);expect(result.proof.outcome).toBe('PARTIAL');expect(result.proof.artifactRefs.some((r:string)=>r.startsWith('factory-receipt:'))).toBe(true);expect(result.proof.limitations.some((r:string)=>r.includes('independent cloud'))).toBe(true);
  if(process.env.MYEVE_CONSOLIDATION_P0==='1'){
   const refs=result.proof.artifactRefs.filter((ref:string)=>ref.startsWith('factory-evidence:sha256:'));expect(refs).toHaveLength(2);
   report.evidence=[];
   for(const ref of refs){
    const url=`/api/beta/evidence?workId=${work.id}&resultId=${result.id}&reference=${encodeURIComponent(ref)}`;
    const response=await page.request.get(url);expect(response.status()).toBe(200);expect(response.headers()['content-type']).toBe('application/octet-stream');
    const bytes=await response.body();expect(bytes.length).toBeGreaterThan(0);report.evidence.push({reference:ref,bytes:bytes.length,disposition:response.headers()['content-disposition']});
    const denied=await page.request.get(url+'&owner=other-owner');expect([403,404]).toContain(denied.status());
    if(before.length){const other=await page.request.get(url.replace('workId='+work.id,'workId='+before[0]));expect(other.status()).toBe(404);}
   }
   await page.goto('/results');await page.getByText('Proof of Work',{exact:true}).first().click();
   await expect(page.getByRole('link',{name:'Download retained Factory evidence'})).toHaveCount(2);
   const decision=await page.request.get('/api/beta/owner-decision?workId='+work.id);expect(decision.status()).toBe(200);
   report.ownerDecisionSurface='READ_QUALIFIED_NO_EFFECT';
   report.noLocalStatement='zero local runtime dependencies were observed; physical Mac power state was not independently observed.';
  }
  await page.goto('/work?kind=work&id='+work.id);await page.getByText('Proof of Work',{exact:true}).click();await expect(page.getByText('Candidate: '+result.candidate_sha,{exact:true})).toBeVisible();
  const body=await page.locator('body').innerText();expect(body).not.toContain(credentials().MYEVE_ACCESS_PASSWORD);report.result={id:result.id,candidate:result.candidate_sha,proof:result.proof};report.status='PASS';
  // Physical Mac-off is an independent connected gate, never inferred from this test.
 }catch(error){report.status='FAIL';report.failure=String(error).slice(0,1200);throw error;}
 finally{
  const evidenceErrors:string[]=[];
  try{await retainTrace();}catch{evidenceErrors.push('TRACE_RETENTION_FAILED');}
  if(report.status==='FAIL'&&!page.isClosed())try{
   const body=await page.locator('body').innerText({timeout:2000});
   if(!body.includes(credentials().MYEVE_ACCESS_PASSWORD))await info.attach('failure-screen',{body:await page.screenshot({timeout:2000}),contentType:'image/png'});
  }catch{evidenceErrors.push('SCREENSHOT_UNAVAILABLE');}
  try{await context.close();}catch{evidenceErrors.push('CONTEXT_ALREADY_CLOSED');}
  rmSync(traces,{recursive:true,force:true});
  report.evidenceErrors=evidenceErrors;
  const traceFailure=report.status==='PASS'&&evidenceErrors.includes('TRACE_RETENTION_FAILED');
  if(traceFailure){report.status='FAIL';report.failure='TRACE_RETENTION_FAILED';}
  const text=JSON.stringify(report,null,2);
  if(text.includes(credentials().MYEVE_ACCESS_PASSWORD))throw Error('EVIDENCE_CREDENTIAL_EXPOSURE');
  await info.attach('cloud-journey',{body:text,contentType:'application/json'});
  if(traceFailure)throw Error('TRACE_RETENTION_FAILED');
 }
});
