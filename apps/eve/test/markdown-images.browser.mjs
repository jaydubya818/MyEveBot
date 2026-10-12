import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium, expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join, dirname} from 'node:path';
import {createRequire} from 'node:module';

const app=resolve('apps/eve'), output=resolve(process.argv[2]);
const require=createRequire(join(app,'package.json'));
await mkdir(output,{recursive:true});
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{Markdown}from'${app}/components/markdown.tsx';const root=createRoot(document.getElementById('root'));window.renderMarkdown=text=>root.render(<Markdown>{text}</Markdown>);`,loader:'tsx',resolveDir:app},
  bundle:true,format:'esm',outfile:join(output,'app.js'),jsx:'automatic',
  alias:{'@':app,react:dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json'))},
  define:{'process.env.NODE_ENV':'"production"'}});
const server=createServer(async(req,res)=>{
  if(req.url==='/app.js'){res.setHeader('content-type','application/javascript');res.end(await readFile(join(output,'app.js')));return;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><head><title>Markdown image qualification</title></head><body><main id="root"></main><script type="module" src="/app.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`, browser=await chromium.launch({headless:true});
const report={scope:'ACTUAL_MARKDOWN_COMPONENT_SYNTHETIC_IMAGE_RESPONSES',status:'RUNNING',checks:[],externalNetwork:'NOT_USED'};
try{
  const context=await browser.newContext(), requests=[], errors=[];
  let failImage=false;
  await context.route('**/*',route=>{
    const url=route.request().url();
    if(new URL(url).origin===origin)return route.continue();
    requests.push(url);
    if(failImage)return route.fulfill({status:404,body:'Synthetic missing image'});
    return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(String(error)));
  const render=async(text)=>{await page.evaluate(text=>window.renderMarkdown(text),text);await page.waitForTimeout(150);};
  await page.goto(origin);await page.waitForFunction(()=>typeof window.renderMarkdown==='function');
  for(const text of [
    '![Private report](https://attacker.invalid/pixel?fixture=SYNTHETIC)',
    '<img src="https://attacker.invalid/raw" srcset="https://attacker.invalid/alternate 2x" alt="Raw image">',
    '![Protocol relative](//attacker.invalid/relative)',
    '<picture><source srcset="https://attacker.invalid/source"><img src="https://attacker.invalid/picture" alt="Picture"></picture>',
    '<video poster="https://attacker.invalid/poster" autoplay src="https://attacker.invalid/video"></video><svg><image href="https://attacker.invalid/svg"/></svg>',
  ]){
    await render(text);assert.deepEqual(requests,[]);await expect(page.locator('img')).toHaveCount(0);
    report.checks.push('No automatic request: '+text);
  }
  await render('![Chosen image](https://attacker.invalid/chosen)');
  await expect(page.getByText('Chosen image · attacker.invalid')).toBeVisible();
  await page.getByRole('button',{name:'Load image',exact:true}).click();
  await expect.poll(()=>requests.length).toBe(1);
  await expect(page.getByRole('img',{name:'Chosen image'})).toHaveAttribute('referrerpolicy','no-referrer');
  assert.deepEqual(requests,['https://attacker.invalid/chosen']);report.checks.push('Only the explicitly chosen image is requested');
  await render('![Changed image](https://attacker.invalid/changed)');
  await expect(page.getByRole('button',{name:'Load image',exact:true})).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);assert.equal(requests.length,1);
  report.checks.push('Changed streaming source requires fresh consent');
  failImage=true;await page.getByRole('button',{name:'Load image',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Image could not be loaded.');
  failImage=false;await page.getByRole('button',{name:'Retry image',exact:true}).click();
  await expect(page.getByRole('img',{name:'Changed image'})).toBeVisible();
  assert.equal(requests.length,3);report.checks.push('Failed image has a working explicit retry');
  await render('[Ordinary link](https://example.invalid/reference)');
  await expect(page.getByRole('link',{name:'Ordinary link'})).toHaveAttribute('href','https://example.invalid/reference');
  assert.equal(requests.length,3);assert.deepEqual(errors,[]);
  report.checks.push('Ordinary links remain usable without automatic requests');report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
