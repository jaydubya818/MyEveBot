import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';

const root=resolve('.'),app=join(root,'apps/eve'),out=resolve(process.argv[2]);
const require=createRequire(join(app,'package.json'));
await mkdir(out,{recursive:true});
const entry=`import React from 'react';import{createRoot}from'react-dom/client';
import{IntegratedExperience}from'${app}/components/owner/integrated.tsx';import{BetaFeedbackPanel}from'${app}/components/owner/beta-feedback.tsx';import Login from '${app}/app/login/page.tsx';import{OwnerCandidateDecision}from'${app}/components/owner/candidate-decision.tsx';
createRoot(document.getElementById('root')).render(['/results','/needs-you'].includes(location.pathname)?<div className="owner-shell"><IntegratedExperience view={location.pathname==='/results'?'results':'needs-you'}/></div>:location.pathname==='/feedback'?<BetaFeedbackPanel workId="11111111-1111-4111-8111-111111111111"/>:location.pathname==='/login'?<Login/>:<div className="owner-shell"><OwnerCandidateDecision workId="fixture-work"/></div>);`;
await build({stdin:{contents:entry,loader:'tsx',resolveDir:app},bundle:true,format:'esm',outfile:join(out,'app.js'),jsx:'automatic',
  alias:{'@':app,react:dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json'))},define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_AGENT_NAME':'"Sofie"','process.env.NEXT_PUBLIC_OWNER_NAME':'"Synthetic owner"'}});
const fixture=(scenario)=>({binding:{allowedPaths:['quantity.mjs'],candidate:'a'.repeat(40),verifiedTree:'b'.repeat(40),resultId:'fixture-result',repository:'fixture/repo',baseRef:'main',expectedBaseSha:'c'.repeat(40),branch:'fixture',version:1,generation:1},
  bindingHash:'d'.repeat(64),implementation:{passed:12,total:12},verification:{passed:6,total:6},accounting:{settledMicrousd:100,sofieMicrousd:40,factoryMicrousd:60},
  proof:{evidence:[{criterionId:'fixture',state:'PASS',producer:'retained verifier',sourceRef:'fixture-proof'}],artifactRefs:['fixture-proof']},decision:null,
  publication:scenario==='none'?null:{state:'PR_OPEN'},readback:scenario==='none'?null:{observedAt:'2026-10-12T00:00:00Z',
    ci:{status:scenario==='ci-fail'?'FAIL':scenario==='pending'?'PENDING':'PASS',url:'https://example.invalid/ci'},
    review:{status:scenario==='review-fail'?'FAIL':scenario==='pending'?'PENDING':'PASS',summary:scenario==='review-fail'?'Retained independent finding.':'Current review observation.'}}});
const integratedFixture=(scenario)=>{
  const id='11111111-1111-4111-8111-111111111111',criterion='22222222-2222-4222-8222-222222222222',sha='a'.repeat(40);
  const work={id,scopeId:'synthetic-owner',title:'Synthetic retained Work',lifecycle:'active',control:'human',version:2,generation:3,criteriaVersion:2,criteria:[{id:criterion,statement:'Synthetic criterion',method:'test'}]};
  const result={id:'33333333-3333-4333-8333-333333333333',work_id:id,work_version:2,work_generation:3,current_work_version:2,current_work_generation:3,candidate_sha:sha,content_hash:'d'.repeat(64),source:'CANONICAL',created_at:'2026-10-12T00:00:00Z',route:'MYFACTORY',verification_mode:'NOT_LIVE_QUALIFIED',
    proof:{workId:id,workVersion:2,criteriaVersion:2,outcome:'PARTIAL',resultRevision:sha,evidence:[{criterionId:criterion,resultRevision:sha,state:'PASS',producer:'trusted-verifier',sourceRef:'synthetic-proof'}],artifactRefs:[],limitations:[]}};
  result.publicationReadback={binding:{owner:work.scopeId,workId:id,resultId:result.id,resultHash:result.content_hash,version:2,generation:3,candidate:sha},observedAt:'2026-10-12T00:00:00Z',ci:{status:scenario==='ci-fail'?'FAIL':scenario==='pending'?'PENDING':'PASS'},review:{status:scenario==='review-fail'?'FAIL':scenario==='pending'?'PENDING':'PASS',summary:'Synthetic independent observation'},ownerAcceptance:'NOT_RUN',merge:'NOT_RUN',deployment:'NOT_RUN'};
  if(scenario==='empty')result.proof.evidence=[];
  if(scenario==='failed')result.proof.evidence[0].state='FAIL';
  if(scenario==='wrong-producer')result.proof.evidence[0].producer='executor';
  if(scenario==='stale-version')result.proof.workVersion=1;
  if(scenario==='stale-generation')result.work_generation=2;
  if(scenario==='missing-generation')delete result.work_generation;
  if(scenario==='stale-criteria')result.proof.criteriaVersion=1;
  if(scenario==='foreign-work')result.proof.workId='44444444-4444-4444-8444-444444444444';
  if(scenario==='missing-criterion')work.criteria.push({id:'44444444-4444-4444-8444-444444444444',method:'human'});
  if(scenario==='duplicate-evidence')result.proof.evidence.push({...result.proof.evidence[0]});
  if(scenario==='foreign-publication')result.publicationReadback.binding.owner='other-owner';
  if(scenario==='old-candidate')result.proof.evidence[0].resultRevision='b'.repeat(40);
  if(scenario==='none')result.publicationReadback=null;
  return {work,result};
};
let scenario='none',unexpectedWrites=0;
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Source boundary qualification</title><link rel="stylesheet" href="/app.css"></head><body style="margin:0;font:16px sans-serif"><div id="root"></div><script type="module" src="/app.js"></script></body></html>';
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(['/api/beta/results','/api/beta/work','/api/beta/goals','/api/beta/inbox'].includes(url.pathname)){
    if(req.method!=='GET'){unexpectedWrites++;res.writeHead(405);res.end();return;}
    const data=integratedFixture(scenario),body=url.pathname.endsWith('/results')?{results:[data.result]}:url.pathname.endsWith('/work')?{works:scenario==='missing-work'?[]:[data.work]}:url.pathname.endsWith('/inbox')?{items:[],nextCursor:null}:{goals:[],nextCursor:null,canProceed:[],doing:[],blocked:[],needsYou:[],recentlyCompleted:[]};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));return;
  }
  if(url.pathname==='/api/beta/issues'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({next:null,reports:[{id:'fixture-report',platform:'MyEve / Sofie',title:'Synthetic feedback',details:'Synthetic readback only',impact:'MINOR',priority:'P3',workId:'11111111-1111-4111-8111-111111111111',missionId:null,status:scenario,triageNote:null,createdAt:'2026-10-12T00:00:00Z'}]}));return;}
  if(url.pathname==='/api/auth/login'){res.setHeader('Content-Type','application/json');res.end('{"ok":true}');return;}
  if(url.pathname==='/api/beta/owner-decision'){
    if(req.method!=='GET'){unexpectedWrites++;res.writeHead(405);res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixture(scenario)));return;
  }
  if(['/app.js','/app.css'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript':'text/css');res.end(await readFile(join(out,url.pathname.slice(1))));return;}
  if(url.pathname!=='/login'&&url.pathname!=='/decision'&&url.pathname!=='/feedback'&&url.pathname!=='/results'&&url.pathname!=='/needs-you'){res.end('<!doctype html><html lang="en"><title>Local destination</title><body>Local destination</body></html>');return;}
  res.setHeader('Content-Type','text/html');res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const report={scope:'ACTUAL_COMPONENTS_WITH_SYNTHETIC_HTTP_RESPONSES',authentication:'NOT_QUALIFIED_BY_THIS_FIXTURE',publication:'NOT_RUN',status:'RUNNING',checks:[]};
try{
  const context=await browser.newContext(),outside=[],errors=[];
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){outside.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>{errors.push(String(error));report.pageErrors=errors;});
  for(const value of ['/%5Cevil.example','/%09/evil.example','/%0A/evil.example','/%0D/evil.example','/\\evil.example','//evil.example']){
    await page.goto(origin+'/login?returnTo='+value);await page.getByLabel('Your access password').fill('synthetic-login-response-only');
    await page.getByRole('button',{name:'Open Sofie',exact:true}).click();await page.waitForURL(origin+'/today');
    assert.equal(new URL(page.url()).origin,origin);report.checks.push('login rejects '+JSON.stringify(value));
  }
  for(const value of ['/settings?tab=capabilities#mission-control','/work/fixture?view=proof','/a/..//evil.example']){
    await page.goto(origin+'/login?'+new URLSearchParams({returnTo:value}));await page.getByLabel('Your access password').fill('synthetic-login-response-only');
    await page.getByRole('button',{name:'Open Sofie',exact:true}).click();await page.waitForURL(new URL(value,origin).href);
    assert.equal(new URL(page.url()).origin,origin);report.checks.push('login preserves '+value);
  }
  for(const width of [1440,390])for(const value of ['review-fail','ci-fail','pending','pass','none']){
    scenario=value;await page.setViewportSize({width,height:1000});await page.goto(origin+'/decision');
    await page.getByRole('heading',{name:/Result needs attention|Review retained candidate|Sofie finished the work/}).waitFor();
    await expect(page.getByText('was implemented and independently verified.',{exact:false})).toHaveCount(0);
    await page.getByText('Retained candidate files: quantity.mjs').waitFor();
    await page.getByText('Proof of Work',{exact:true}).click();
    if(value==='none'){
      await expect(page.getByLabel('Current publication evidence')).toHaveCount(0);
      await page.getByRole('radio',{name:'Keep private',exact:true}).check();await page.getByRole('button',{name:'Review decision'}).click();
      await expect(page.getByRole('heading',{name:'Confirm: Keep private'})).toBeVisible();
    }else{
      const section=page.getByLabel('Current publication evidence');
      await expect(section).toContainText('GitHub CI: '+fixture(value).readback.ci.status+' · Independent review: '+fixture(value).readback.review.status);
      await expect(section).not.toContainText('): PASS');
      await expect(section).toContainText('Owner acceptance remains a separate decision.');
    }
    if(value==='review-fail')await expect(page.getByRole('alert')).toContainText('Retained independent finding.');
    await page.addScriptTag({path:createRequire(import.meta.url).resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
    assert.deepEqual(axe.violations,[]);
    await page.screenshot({path:join(out,`candidate-${value}-${width}.png`),fullPage:true});
    report.checks.push(`candidate ${value} at ${width}`);
  }
  for(const width of [1440,390])for(const [status,label] of [['REPORTED','Awaiting review'],['TRIAGED','Reviewed'],['RESOLVED','Resolved'],['UNKNOWN_NEW_STATE','Status unavailable']]){
    scenario=status;await page.setViewportSize({width,height:1000});await page.goto(origin+'/feedback');
    await page.getByRole('heading',{name:'Synthetic feedback',exact:true}).waitFor();
    await expect(page.locator('article')).toContainText(label);
    if(status!=='RESOLVED')await expect(page.locator('article')).not.toContainText('Resolved');
    for(const name of ['your Work','Open linked Work']){
      const href=await page.getByRole('link',{name,exact:true}).getAttribute('href'),url=new URL(href,origin);
      assert.equal(url.pathname,'/work');assert.equal(url.searchParams.get('kind'),'work');assert.equal(url.searchParams.get('id'),'11111111-1111-4111-8111-111111111111');
    }
    await page.addScriptTag({path:createRequire(import.meta.url).resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(axe.violations,[]);
    report.checks.push(`feedback ${status} at ${width}: exact Work links, truthful status, zero WCAG2.1AA violations`);
  }
  for(const width of [1440,390])for(const view of ['results','needs-you'])for(const value of ['pass','ci-fail','review-fail','pending','none','empty','failed','wrong-producer','stale-version','stale-generation','missing-generation','stale-criteria','foreign-work','missing-criterion','duplicate-evidence','foreign-publication','old-candidate','missing-work']){
    scenario=value;await page.setViewportSize({width,height:1000});await page.goto(origin+'/'+view);
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByText('Verified work needs your decision',{exact:true})).toHaveCount(0);
    const eligible=['pass','ci-fail','review-fail','pending','none','foreign-publication'].includes(value);
    await expect(page.getByRole('link',{name:'Review owner decision',exact:true})).toHaveCount(eligible?1:0);
    if(view==='results'){
      await page.getByText('Proof of Work',{exact:true}).click();
      await expect(page.getByText('Current publication: PASS',{exact:false})).toHaveCount(0);
      await expect(page.getByText('Current Result: PARTIAL.',{exact:false})).toHaveCount(0);
      const publicationCurrent=!['none','stale-version','stale-generation','missing-generation','stale-criteria','foreign-work','foreign-publication','missing-work'].includes(value);
      await expect(page.getByLabel('Publication readback')).toHaveCount(publicationCurrent?1:0);
      if(publicationCurrent){
        await expect(page.getByLabel('Publication readback')).toContainText('GitHub CI: '+integratedFixture(value).result.publicationReadback.ci.status+' · Independent review: '+integratedFixture(value).result.publicationReadback.review.status);
        await expect(page.getByLabel('Publication readback')).toContainText('Owner acceptance: NOT_RUN · Merge: NOT_RUN · Deployment: NOT_RUN');
      }else await expect(page.getByText('Current publication evidence is unavailable.',{exact:false})).toBeVisible();
    }
    await page.addScriptTag({path:createRequire(import.meta.url).resolve('axe-core/axe.min.js')});
    const axe=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));assert.deepEqual(axe.violations,[]);
    report.checks.push(`integrated ${view} ${value} at ${width}: bound review link, observed publication, zero WCAG2.1AA violations`);
  }
  assert.equal(unexpectedWrites,0);assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
  report.checks.push('zero WCAG2.1AA violations across all10 owner decision states; no publication writes or external requests');report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
