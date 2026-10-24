import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(import.meta.url);
const output=resolve(process.argv[2]??'output/playwright/beta-feedback');await mkdir(output,{recursive:true});
const bundle=await build({stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {BetaFeedbackPanel} from './components/owner/beta-feedback';createRoot(document.getElementById('root')).render(<BetaFeedbackPanel/>);",resolveDir:app,loader:'tsx'},
  // Next is hoisted, so its Link import must share the app renderer's React.
  alias:{react:dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json'))},
  bundle:true,write:false,outdir:'out',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},logLevel:'silent'});
const js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).text,css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).text;
const server=createServer((request,response)=>{
  response.setHeader('content-type',request.url==='/app.js'?'application/javascript':request.url==='/app.css'?'text/css':'text/html');
  response.end(request.url==='/app.js'?js:request.url==='/app.css'?css:'<!doctype html><html lang="en" data-mode="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Beta feedback qualification</title><link rel="stylesheet" href="/app.css"><style>body{margin:0}#root{display:block}.owner-content{margin:auto}</style></head><body><div id="root" class="owner-shell"></div><script src="/app.js"></script></body></html>');
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message);});
  let records=[],postCount=0,firstPayload,failRead=false,delayRead=true;
  await page.route('**/api/beta/issues*',async route=>{
    const request=route.request();
    if(request.method()==='GET'){
      if(delayRead){delayRead=false;await new Promise(resolve=>setTimeout(resolve,250));}
      return route.fulfill({status:failRead?503:200,contentType:'application/json',body:JSON.stringify(failRead?{error:'Synthetic read outage.'}:{reports:records,next:null})});
    }
    postCount++;const input=request.postDataJSON();
    if(postCount===1){firstPayload=input;records=[{...input,priority:'P2',missionId:null,status:'REPORTED',triageNote:null,createdAt:new Date().toISOString()}];return route.abort('failed');}
    assert.deepEqual(input,firstPayload,'retry retains exact committed request identity');
    return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({report:records[0]})});
  });
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByText('No reports yet',{exact:true}).waitFor();
  await page.getByLabel('Summary',{exact:true}).fill('Status did not refresh after a finished task');
  await page.getByLabel('What happened?',{exact:true}).fill('I returned to Work and expected the completed status. It still showed running.');
  await page.getByRole('button',{name:'Save report',exact:true}).focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Retry report',exact:true}).waitFor();
  assert.equal(await page.getByLabel('Summary',{exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Retry report',exact:true}).click();
  await page.getByText(/Report saved\. Reference/).waitFor();
  await page.locator('article').getByText('Awaiting review',{exact:false}).waitFor();
  assert.equal(postCount,2);assert.equal(records.length,1);assert.equal(await page.getByLabel('Summary',{exact:true}).inputValue(),'');
  const axe=await readFile(require.resolve('axe-core'),'utf8');
  const checks=[];
  for(const [name,width,height] of [['desktop',1280,1000],['mobile',390,844]]){
    await page.setViewportSize({width,height});await page.evaluate(axe);
    const violations=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.filter(item=>['critical','serious'].includes(item.impact)));
    checks.push({name,violations});assert.deepEqual(violations.map(item=>item.id),[]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no horizontal overflow');
    await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});
  }
  failRead=true;await page.reload();await page.getByText('Synthetic read outage.',{exact:true}).waitFor();
  failRead=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await page.locator('article').getByText('Awaiting review',{exact:false}).waitFor();
  assert.deepEqual(errors,[]);
  await writeFile(resolve(output,'receipt.json'),JSON.stringify({status:'PASS',scope:'Actual React component with synthetic same-origin API; not an installed authenticated journey',checks:['empty','keyboard submit','response loss','same-ID retry','save confirmation','private history','read failure/retry','desktop/mobile overflow','axe serious/critical'],postCount,storedRecords:records.length,errors,accessibility:checks},null,2));
  console.log('Beta feedback rendered component: PASS (desktop/mobile, response-loss recovery, keyboard, accessibility).');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
