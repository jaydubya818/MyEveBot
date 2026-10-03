# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: golden-journey.spec.ts >> P0 real Eve → canonical CLOUD Work → browser-off → independent Proof
- Location: apps/eve/test/cloud/golden-journey.spec.ts:13:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  1  | import {test,expect,type Page} from '@playwright/test';
  2  | import {readFileSync,mkdtempSync,rmSync,chmodSync} from 'node:fs';
  3  | import {spawnSync} from 'node:child_process';
  4  | import {tmpdir} from 'node:os';
  5  | import path from 'node:path';
  6  | const trigger=JSON.parse(readFileSync(path.resolve(import.meta.dirname,'../../../../.github/'+(process.env.MYEVE_CONSOLIDATION_P0==='1'?'consolidation-cloud-qualification.json':'cloud-qualification-trigger.json')),'utf8'));
  7  | const enabled=process.env.MYEVE_CLOUD_P0==='approved-deterministic-staging';
  8  | // The backend proxy carries only the separately authorized Sofie protection
  9  | // credential. This browser never receives Factory infrastructure credentials.
  10 | const credentials=()=>JSON.parse(readFileSync(process.env.MYEVE_CLOUD_OWNER_CREDENTIAL_FILE!,'utf8')) as {MYEVE_ACCESS_PASSWORD:string};
  11 | async function login(page:Page){await page.goto('/login');await page.getByLabel('Your access password').fill(credentials().MYEVE_ACCESS_PASSWORD);await page.getByRole('button',{name:'Open Sofie',exact:true}).click();await page.waitForURL(u=>u.pathname!=='/login');}
  12 | async function read(page:Page,path:string){return page.evaluate(async path=>{const r=await fetch(path);if(!r.ok)throw Error('Canonical read failed: '+r.status);return r.json();},path);}
  13 | test('P0 real Eve → canonical CLOUD Work → browser-off → independent Proof',async({browser,baseURL},info)=>{
  14 |  test.skip(!enabled,'NOT_RUN: dedicated staging configuration and explicit deterministic runner activation are required.');
  15 |  expect(Object.keys(process.env).filter(k=>/FACTORY.*(TOKEN|BYPASS|SECRET|OIDC)/i.test(k))).toEqual([]);
  16 |  const report:any={kind:'CONNECTED',modelBoundary:'DETERMINISTIC',retries:0,startedAt:new Date().toISOString(),macOff:process.env.GITHUB_ACTIONS==='true'?'REMOTE_RUNNER_NO_MAC_DEPENDENCY':'NOT_RUN',runner:process.env.GITHUB_RUN_ID??'local',status:'RUNNING'};
  17 |  let context=await browser.newContext({baseURL}),page=await context.newPage(),tracing=false;
  18 |  const traces=mkdtempSync(path.join(tmpdir(),'cloud-p0-trace-'));let phase=0;
  19 |  async function retainTrace(){if(!tracing)return;tracing=false;const raw=path.join(traces,'raw-'+phase+'.zip'),clean=path.join(traces,'safe-'+phase+'.zip');const secrets=[...Object.values(credentials()),...(await context.cookies()).map(c=>c.value)];await context.tracing.stop({path:raw});chmodSync(raw,0o600);const sanitized=spawnSync('python3',[path.join(import.meta.dirname,'sanitize-trace.py'),raw,clean],{input:JSON.stringify(secrets),encoding:'utf8'});rmSync(raw,{force:true});if(sanitized.status!==0)throw Error('TRACE_CREDENTIAL_SCAN_FAILED');await info.attach('cloud-trace-'+phase++,{path:clean,contentType:'application/zip'});}
  20 |  try{
  21 |   await login(page);await context.tracing.start({snapshots:true,screenshots:true,sources:false});tracing=true;const before=(await read(page,'/api/beta/work')).works.map((w:any)=>w.id);
  22 |   await page.goto('/chat');const session=page.waitForResponse(r=>new URL(r.url()).pathname==='/eve/v1/session'&&r.request().method()==='POST');
  23 |   await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill('Sofie, please implement project slug validation, verify the change, and bring it back for my review.');await page.getByRole('button',{name:'Send',exact:true}).click();expect((await session).status()).toBe(202);
  24 |   let created:any[]=[];await expect.poll(async()=>{created=(await read(page,'/api/beta/work')).works.filter((w:any)=>!before.includes(w.id));return created.length;},{timeout:90000,intervals:[2000]}).toBe(1);
  25 |   const work=created[0];report.workId=work.id;expect(work.control).toBe('paused');
  26 |   await page.goto('/work?kind=work&id='+work.id);await expect(page.getByRole('button',{name:'Resume Work',exact:true})).toBeVisible();
  27 |   const resumed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/beta/work'&&r.request().method()==='POST');await page.getByRole('button',{name:'Resume Work',exact:true}).click();const r=await resumed;expect(r.status()).toBe(200);const queued=await r.json();expect(queued.admission.status).toBe('QUEUED');report.generation=queued.work.generation;report.commandId=queued.admission.receipt.command.id;
  28 |   await retainTrace();await context.close();report.browserClosedAt=new Date().toISOString();
  29 |   // No browser poll, local worker or local verifier drives this interval.
  30 |   await new Promise(resolve=>setTimeout(resolve,210000));
  31 |   context=await browser.newContext({baseURL});page=await context.newPage();await login(page);await context.tracing.start({snapshots:true,screenshots:true,sources:false});tracing=true;report.reconnectedAt=new Date().toISOString();
  32 |   const results=(await read(page,'/api/beta/results')).results.filter((r:any)=>r.work_id===work.id);expect(results).toHaveLength(1);const result=results[0];expect(result.route).toBe('MYFACTORY');expect(result.proof.artifactRefs).toContain('factory-version:'+trigger.factoryVersion);expect(result.proof.evidence.length).toBeGreaterThan(0);expect(result.proof.evidence.every((e:any)=>e.state==='PASS'&&e.producer==='trusted-verifier')).toBe(true);expect(result.proof.outcome).toBe('PARTIAL');expect(result.proof.artifactRefs.some((r:string)=>r.startsWith('factory-receipt:'))).toBe(true);expect(result.proof.limitations.some((r:string)=>r.includes('independent cloud'))).toBe(true);
  33 |   if(process.env.MYEVE_CONSOLIDATION_P0==='1'){
  34 |    const refs=result.proof.artifactRefs.filter((ref:string)=>ref.startsWith('factory-evidence:sha256:'));expect(refs).toHaveLength(2);
  35 |    report.evidence=[];
  36 |    for(const ref of refs){
  37 |     const url=`/api/beta/evidence?workId=${work.id}&resultId=${result.id}&reference=${encodeURIComponent(ref)}`;
> 38 |     const response=await page.request.get(url);expect(response.status()).toBe(200);expect(response.headers()['content-type']).toBe('application/octet-stream');
     |                                                                          ^ Error: expect(received).toBe(expected) // Object.is equality
  39 |     const bytes=await response.body();expect(bytes.length).toBeGreaterThan(0);report.evidence.push({reference:ref,bytes:bytes.length,disposition:response.headers()['content-disposition']});
  40 |     const denied=await page.request.get(url+'&owner=other-owner');expect([403,404]).toContain(denied.status());
  41 |     if(before.length){const other=await page.request.get(url.replace('workId='+work.id,'workId='+before[0]));expect(other.status()).toBe(404);}
  42 |    }
  43 |    await page.goto('/results');await page.getByText('Proof of Work',{exact:true}).first().click();
  44 |    await expect(page.getByRole('link',{name:'Download retained Factory evidence'})).toHaveCount(2);
  45 |    const decision=await page.request.get('/api/beta/owner-decision?workId='+work.id);expect(decision.status()).toBe(200);
  46 |    report.ownerDecisionSurface='READ_QUALIFIED_NO_EFFECT';
  47 |    report.noLocalStatement='zero local runtime dependencies were observed; physical Mac power state was not independently observed.';
  48 |   }
  49 |   await page.goto('/work?kind=work&id='+work.id);await page.getByText('Proof of Work',{exact:true}).click();await expect(page.getByText('Candidate: '+result.candidate_sha,{exact:true})).toBeVisible();
  50 |   const body=await page.locator('body').innerText();expect(body).not.toContain(credentials().MYEVE_ACCESS_PASSWORD);report.result={id:result.id,candidate:result.candidate_sha,proof:result.proof};report.status='PASS';
  51 |   // Physical Mac-off is an independent connected gate, never inferred from this test.
  52 |  }catch(error){report.status='FAIL';report.failure=String(error).slice(0,1200);throw error;}
  53 |  finally{
  54 |   const evidenceErrors:string[]=[];
  55 |   try{await retainTrace();}catch{evidenceErrors.push('TRACE_RETENTION_FAILED');}
  56 |   if(report.status==='FAIL'&&!page.isClosed())try{
  57 |    const body=await page.locator('body').innerText({timeout:2000});
  58 |    if(!body.includes(credentials().MYEVE_ACCESS_PASSWORD))await info.attach('failure-screen',{body:await page.screenshot({timeout:2000}),contentType:'image/png'});
  59 |   }catch{evidenceErrors.push('SCREENSHOT_UNAVAILABLE');}
  60 |   try{await context.close();}catch{evidenceErrors.push('CONTEXT_ALREADY_CLOSED');}
  61 |   rmSync(traces,{recursive:true,force:true});
  62 |   report.evidenceErrors=evidenceErrors;
  63 |   const traceFailure=report.status==='PASS'&&evidenceErrors.includes('TRACE_RETENTION_FAILED');
  64 |   if(traceFailure){report.status='FAIL';report.failure='TRACE_RETENTION_FAILED';}
  65 |   const text=JSON.stringify(report,null,2);
  66 |   if(text.includes(credentials().MYEVE_ACCESS_PASSWORD))throw Error('EVIDENCE_CREDENTIAL_EXPOSURE');
  67 |   await info.attach('cloud-journey',{body:text,contentType:'application/json'});
  68 |   if(traceFailure)throw Error('TRACE_RETENTION_FAILED');
  69 |  }
  70 | });
  71 | 
```