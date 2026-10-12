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
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{Markdown}from'${app}/components/markdown.tsx';import{ArtifactPreview}from'${app}/components/artifact-preview.tsx';const root=createRoot(document.getElementById('root'));window.renderMarkdown=text=>root.render(<Markdown>{text}</Markdown>);window.renderArtifact=text=>root.render(<ArtifactPreview kind="html" filename="untrusted.html" mimeType="text/html" contentUrl="/unused" text={text}/>);`,loader:'tsx',resolveDir:app},
  bundle:true,format:'esm',outfile:join(output,'app.js'),jsx:'automatic',
  alias:{'@':app,react:dirname(require.resolve('react/package.json')),'react-dom':dirname(require.resolve('react-dom/package.json'))},
  plugins:[{name:'unused-artifact-formats',setup(build){build.onResolve({filter:/^next\/dynamic$/},()=>({path:'next/dynamic',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default function dynamic(){return function UnsupportedPreview(){throw Error("Non-HTML artifact path is outside this fixture")}}',loader:'js'}));}}],
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
  report.checks.push('Ordinary links remain usable without automatic requests');
  const before=requests.length;
  await render('```html\n<img src="https://attacker.invalid/preview"><script>fetch("https://attacker.invalid/script")</script><style>body{background:url(https://attacker.invalid/css)}</style>\n```');
  await page.getByRole('button',{name:'Preview HTML',exact:true}).click();
  await expect(page.getByTitle('HTML preview')).toHaveAttribute('sandbox','');
  await page.waitForTimeout(300);assert.equal(requests.length,before);
  report.checks.push('Static HTML preview blocks image, CSS and script network requests');
  for(const media of ['', ' media="(min-width: 1px)"']) {
    const before=requests.length,chosen='https://chosen.invalid/approved'+(media?'media':'plain');
    await render(`<picture><source${media} srcset="https://tracker.invalid/alternate 1x, https://tracker2.invalid/alternate 2x"><img src="${chosen}" alt="Chosen host"></picture>`);
    await expect(page.getByText('Chosen host · chosen.invalid')).toBeVisible();
    assert.equal(requests.length,before);await expect(page.locator('picture,source')).toHaveCount(0);
    await page.getByRole('button',{name:'Load image',exact:true}).click();
    await expect.poll(()=>requests.length).toBe(before+1);assert.equal(requests.at(-1),chosen);
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
    assert.equal(requests.length,before+1);await page.setViewportSize({width:1280,height:720});
    report.checks.push('Picture '+(media?'media ':'')+'sources cannot replace the displayed consent destination');
  }
  for(const [name,content] of Object.entries({
    noHead:'<img src="https://attacker.invalid/A">',
    commentHead:'<!--<head>--><img src="https://attacker.invalid/B">',
    imageBeforeHead:'<img src="https://attacker.invalid/C"><html><head></head><body></body></html>',
    normalHead:'<html><head></head><body><img src="https://attacker.invalid/D"></body></html>',
    scriptNavigation:'<script>location.replace("https://attacker.invalid/navigation")</script>',
    metaRefresh:'<meta http-equiv="refresh" content="0;url=https://attacker.invalid/refresh">',
  })) {
    const before=requests.length;
    await page.evaluate(content=>window.renderArtifact('<h1>Safe static preview</h1>'+content),content);
    await expect(page.getByText('Static preview. Scripts and external resources are disabled.',{exact:true})).toBeVisible();
    const preview=page.getByTitle('Preview of untrusted.html');await expect(preview).toHaveAttribute('sandbox','');
    await expect(page.frameLocator('iframe').getByRole('heading',{name:'Safe static preview'})).toBeVisible();
    await page.waitForTimeout(300);assert.equal(requests.length,before);
    assert.equal(page.frames()[1].url(),'about:srcdoc');
    report.checks.push('Actual HTML artifact blocks '+name+' automatic requests and renders static content');
  }
  assert.deepEqual(errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error);throw error;}
finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
