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
import Login from '${app}/app/login/page.tsx';import{OwnerCandidateDecision}from'${app}/components/owner/candidate-decision.tsx';
createRoot(document.getElementById('root')).render(location.pathname==='/login'?<Login/>:<div className="owner-shell"><OwnerCandidateDecision workId="fixture-work"/></div>);`;
await build({stdin:{contents:entry,loader:'tsx',resolveDir:app},bundle:true,format:'esm',outfile:join(out,'app.js'),jsx:'automatic',
  alias:{'@':app,react:dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json'))},define:{'process.env':'{}','process.env.NODE_ENV':'"production"','process.env.NEXT_PUBLIC_AGENT_NAME':'"Sofie"','process.env.NEXT_PUBLIC_OWNER_NAME':'"Synthetic owner"'}});
const fixture=(scenario)=>({binding:{allowedPaths:['quantity.mjs'],candidate:'a'.repeat(40),verifiedTree:'b'.repeat(40),resultId:'fixture-result',repository:'fixture/repo',baseRef:'main',expectedBaseSha:'c'.repeat(40),branch:'fixture',version:1,generation:1},
  bindingHash:'d'.repeat(64),implementation:{passed:12,total:12},verification:{passed:6,total:6},accounting:{settledMicrousd:100,sofieMicrousd:40,factoryMicrousd:60},
  proof:{evidence:[{criterionId:'fixture',state:'PASS',producer:'retained verifier',sourceRef:'fixture-proof'}],artifactRefs:['fixture-proof']},decision:null,
  publication:scenario==='none'?null:{state:'PR_OPEN'},readback:scenario==='none'?null:{observedAt:'2026-10-12T00:00:00Z',
    ci:{status:scenario==='ci-fail'?'FAIL':scenario==='pending'?'PENDING':'PASS',url:'https://example.invalid/ci'},
    review:{status:scenario==='review-fail'?'FAIL':scenario==='pending'?'PENDING':'PASS',summary:scenario==='review-fail'?'Retained independent finding.':'Current review observation.'}}});
let scenario='none',unexpectedWrites=0;
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Source boundary qualification</title><link rel="stylesheet" href="/app.css"></head><body style="margin:0;font:16px sans-serif"><div id="root"></div><script type="module" src="/app.js"></script></body></html>';
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/auth/login'){res.setHeader('Content-Type','application/json');res.end('{"ok":true}');return;}
  if(url.pathname==='/api/beta/owner-decision'){
    if(req.method!=='GET'){unexpectedWrites++;res.writeHead(405);res.end();return;}
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixture(scenario)));return;
  }
  if(['/app.js','/app.css'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'application/javascript':'text/css');res.end(await readFile(join(out,url.pathname.slice(1))));return;}
  if(url.pathname!=='/login'&&url.pathname!=='/decision'){res.end('<!doctype html><html lang="en"><title>Local destination</title><body>Local destination</body></html>');return;}
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
  assert.equal(unexpectedWrites,0);assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
  report.checks.push('zero WCAG2.1AA violations across all10 owner decision states; no publication writes or external requests');report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
