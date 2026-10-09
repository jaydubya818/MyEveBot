import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import path from 'node:path';
const trigger=JSON.parse(readFileSync(path.resolve(import.meta.dirname,'../../../../.github/consolidation-cloud-qualification.json'),'utf8'));
const enabled=process.env.MYEVE_CONSOLIDATION_P0==='1'&&trigger.maxNewWork===0&&!!trigger.recoverWorkId;
const credentials=()=>JSON.parse(readFileSync(process.env.MYEVE_CLOUD_OWNER_CREDENTIAL_FILE!,'utf8'));
async function read(page:Page,url:string){return page.evaluate(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Canonical read failed: '+r.status);return r.json();},url);}
async function evidence(page:Page,url:string){return page.evaluate(async url=>{const r=await fetch(url),bytes=await r.arrayBuffer();return {status:r.status,type:r.headers.get('content-type'),disposition:r.headers.get('content-disposition'),bytes:bytes.byteLength};},url);}
test('read-only browser recovery retains the original hosted candidate and evidence',async({page},info)=>{
 test.skip(!enabled,'Only the explicitly pinned existing Work may be read.');
 const report:any={kind:'CONNECTED_READBACK',priorExecutionRunId:trigger.priorExecutionRunId,workId:trigger.recoverWorkId,candidate:trigger.candidate,newWork:0,executionRetries:0,status:'RUNNING'};
 try{
  await page.goto('/login');await page.getByLabel('Your access password').fill(credentials().MYEVE_ACCESS_PASSWORD);await page.getByRole('button',{name:'Open Sofie',exact:true}).click();await page.waitForURL(u=>u.pathname!=='/login');
  const before=(await read(page,'/api/beta/work')).works.map((w:any)=>w.id).sort();expect(before).toContain(trigger.recoverWorkId);
  const results=(await read(page,'/api/beta/results')).results.filter((r:any)=>r.work_id===trigger.recoverWorkId);expect(results).toHaveLength(1);
  const result=results[0];expect(result.candidate_sha).toBe(trigger.candidate);expect(result.route).toBe('MYFACTORY');expect(result.proof.outcome).toBe('PARTIAL');
  expect(result.proof.artifactRefs).toContain('factory-version:'+trigger.factoryVersion);expect(result.proof.evidence.length).toBeGreaterThan(0);expect(result.proof.evidence.every((e:any)=>e.state==='PASS'&&e.producer==='trusted-verifier')).toBe(true);
  const refs=result.proof.artifactRefs.filter((x:string)=>x.startsWith('factory-evidence:sha256:'));expect(refs).toHaveLength(2);report.evidence=[];
  for(const ref of refs){
   const url=`/api/beta/evidence?workId=${trigger.recoverWorkId}&resultId=${result.id}&reference=${encodeURIComponent(ref)}`;
   const response=await evidence(page,url);expect(response.status).toBe(200);expect(response.type).toBe('application/octet-stream');expect(response.bytes).toBeGreaterThan(0);expect(response.disposition).toContain('attachment');
   const denied=await evidence(page,url+'&owner=other-owner');expect([403,404]).toContain(denied.status);
   const other=before.find((id:string)=>id!==trigger.recoverWorkId);expect(other).toBeTruthy();const crossWork=await evidence(page,url.replace('workId='+trigger.recoverWorkId,'workId='+other));expect(crossWork.status).toBe(404);
   report.evidence.push({reference:ref,...response,crossOwnerStatus:denied.status,crossWorkStatus:crossWork.status});
  }
  await page.goto('/results');await page.getByText('Proof of Work',{exact:true}).first().click();await expect(page.getByRole('link',{name:'Download retained Factory evidence'})).toHaveCount(2);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Download retained Factory evidence'}).first().click();const download=await downloadPromise;expect(await download.failure()).toBeNull();report.browserDownload=download.suggestedFilename();
  await read(page,'/api/beta/owner-decision?workId='+trigger.recoverWorkId);report.ownerDecisionSurface='READ_QUALIFIED_NO_EFFECT';
  await page.goto('/work?kind=work&id='+trigger.recoverWorkId);await page.getByText('Proof of Work',{exact:true}).click();await expect(page.getByText('Candidate: '+trigger.candidate,{exact:true})).toBeVisible();
  const body=await page.locator('body').innerText();expect(body).not.toContain(credentials().MYEVE_ACCESS_PASSWORD);
  expect((await read(page,'/api/beta/work')).works.map((w:any)=>w.id).sort()).toEqual(before);
  report.resultId=result.id;report.proof=result.proof;report.noLocalStatement='zero local runtime dependencies were observed; physical Mac power state was not independently observed.';report.status='PASS';
  await info.attach('owner-proof',{body:await page.screenshot(),contentType:'image/png'});
 }catch(error){report.status='FAIL';report.failure=String(error).slice(0,1200);throw error;}
 finally{const text=JSON.stringify(report,null,2);if(text.includes(credentials().MYEVE_ACCESS_PASSWORD))throw Error('EVIDENCE_CREDENTIAL_EXPOSURE');await info.attach('cloud-readback',{body:text,contentType:'application/json'});}
});
