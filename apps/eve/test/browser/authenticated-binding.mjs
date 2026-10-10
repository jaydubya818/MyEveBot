import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,readdir,writeFile,copyFile,symlink,open} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {Pool} from 'pg';
import {chromium} from '@playwright/test';
const root=resolve(process.argv[2]),output=resolve(process.argv[3]);await mkdir(output,{recursive:true});
const require=createRequire(join(root,'package.json'));
const scratch=await mkdtemp(join(tmpdir(),'checkpoint-h-binding-')),source=join(scratch,'source');
const sourceFiles={};
for(const file of execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean)) {await mkdir(dirname(join(source,file)),{recursive:true});await copyFile(join(root,file),join(source,file));sourceFiles[file]=createHash('sha256').update(await readFile(join(root,file))).digest('hex');}
await symlink(join(root,'node_modules'),join(source,'node_modules'));await symlink(join(root,'apps/eve/node_modules'),join(source,'apps/eve/node_modules'));
const app=join(source,'apps/eve');await copyFile(join(root,'apps/eve/test/browser/eve-session-fixture.ts'),join(app,'agent/agent.ts'));
const docker=process.env.MC_GOLDEN_DOCKER||'docker',name='checkpoint-h-'+randomUUID(),port=55539,webPort=3081,owner='checkpoint-h-owner';
const report={schema:'checkpoint-h-binding/v1',source:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceDirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),sourceTreeDigest:createHash('sha256').update(JSON.stringify(sourceFiles)).digest('hex'),checks:[],status:'IN_PROGRESS',paidOperations:0,productionIntegration:'NOT_RUN',sourceCopy:source};
let pool,server,browser,page,log,container=false;
const audit=async()=>{
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 return page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),passes:r.passes.length};});
};
try {
 execFileSync(docker,['run','--detach','--name',name,'--pull=never','--memory=768m','--cpus=2','-p',`127.0.0.1:${port}:5432`,'--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=blocker_fixes','pgvector/pgvector@sha256:7b822b0aac60967beb1ea5e576b8602c94c300a157d187f385ae3e0da199b90a'],{stdio:'pipe'});container=true;
 pool=new Pool({host:'127.0.0.1',port,user:'postgres',database:'blocker_fixes'});
 for(let n=0;;n++){try{await pool.query('SELECT 1');break;}catch(e){if(n===60)throw e;await new Promise(r=>setTimeout(r,200));}}
 for(const f of (await readdir(join(app,'migrations'))).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile(join(app,'migrations',f),'utf8'));
 const password=randomBytes(24).toString('hex');
 const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,MYEVE_TEST_DATABASE_URL:`postgresql://postgres@localhost:${port}/blocker_fixes`,DATABASE_URL:`postgresql://postgres@localhost:${port}/blocker_fixes`,MYEVE_OWNER_ID:owner,OWNER_NAME:'Qualification Owner',NEXT_PUBLIC_OWNER_NAME:'Qualification Owner',NEXT_PUBLIC_AGENT_NAME:'Sofie',MYEVE_ENGINEERING_MODE:'dogfood',MYEVE_ACCESS_PASSWORD:password,MYEVE_SESSION_SECRET:randomBytes(32).toString('hex'),NODE_OPTIONS:'--require='+join(app,'test/browser/local-transport.cjs'),NEXT_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1'};
 const databaseTests=await new Promise((resolveCode,reject)=>{
   const child=spawn(process.execPath,['--import','tsx','--test','test/agent-session-binding.integration.mjs'],{cwd:app,env,stdio:['ignore','pipe','pipe']});
   let logs='';child.stdout.on('data',data=>logs+=data);child.stderr.on('data',data=>logs+=data);
   child.once('error',reject);child.once('exit',async code=>{await writeFile(join(output,'database-binding.log'),logs);resolveCode(code);});
 });
 assert.equal(databaseTests,0,'Real database ownership and concurrent Agent binding tests');report.checks.push('real database ownership and concurrent binding');
 log=await open(join(output,'server.log'),'wx');server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port',String(webPort)],{cwd:app,env,stdio:['ignore',log.fd,log.fd]});
 for(let n=0;;n++){try{if((await fetch(`http://localhost:${webPort}/login`)).ok)break;}catch{}if(n===180)throw Error('Server not ready');await new Promise(r=>setTimeout(r,500));}
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1280,height:900}});page=await context.newPage();
 report.sessionPosts=[];page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.startsWith('/eve/v1/session'))report.sessionPosts.push(new URL(r.url()).pathname);});
 assert.equal((await context.request.get(`http://localhost:${webPort}/api/threads`)).status(),401);report.checks.push('anonymous denied');
 await page.goto(`http://localhost:${webPort}/login?returnTo=/chat`);await page.getByLabel('Your access password').fill(password);await page.getByRole('button',{name:'Open Sofie',exact:true}).click();await page.waitForURL(u=>u.pathname==='/chat',{timeout:60000});
 assert.ok((await context.cookies()).some(c=>c.name==='myeve_session'&&c.httpOnly));report.checks.push('actual password login');
 await page.getByRole('button',{name:'New conversation',exact:true}).click();
 let release;const gate=new Promise(r=>release=r);let blocked=false;
 await page.route('**/api/threads/*',async route=>{if(route.request().method()==='PUT'){blocked=true;await gate;}await route.continue();});
 await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill('fixture hello');await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.waitForTimeout(3000);report.sessionPostsWhileSavePending=report.sessionPosts.length;report.saveWasDelayed=blocked;release();
 await page.unrouteAll({behavior:'wait'});
 try{await page.getByText('Migration fixture reply.',{exact:true}).waitFor({timeout:90000});}catch(e){report.bindingRows=(await pool.query('SELECT id,owner_id,agent_id,role_id FROM web_chat_threads WHERE owner_id=$1',[owner])).rows;throw e;}
 assert.ok(blocked);assert.equal(report.sessionPostsWhileSavePending,0,'First send must await authorized conversation persistence');report.checks.push('delayed save precedes session execution');
 report.bindingRows=(await pool.query('SELECT id,owner_id,agent_id,role_id FROM web_chat_threads WHERE owner_id=$1',[owner])).rows;assert.ok(report.bindingRows.some(r=>r.agent_id));report.checks.push('canonical Agent binding persisted');
 await page.getByRole('button',{name:'Stop',exact:true}).waitFor({state:'hidden',timeout:45000});
 await page.waitForTimeout(1500);
 await page.screenshot({path:join(output,'first-reply.png'),fullPage:true});
 report.desktopAccessibility=await audit();assert.deepEqual(report.desktopAccessibility.violations,[],'Desktop conversation accessibility');
 await page.setViewportSize({width:390,height:844});
 await page.reload();await page.getByText('Migration fixture reply.',{exact:true}).waitFor({timeout:45000});
 await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill('fixture follow-up');await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.waitForFunction(()=>document.body.innerText.split('Migration fixture reply.').length===3,{},{timeout:90000});assert.equal(report.sessionPosts.filter(p=>p==='/eve/v1/session').length,1);report.checks.push('same session follow-up after reconnect');
 await page.getByRole('button',{name:'Stop',exact:true}).waitFor({state:'hidden',timeout:45000});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile conversation must reflow without horizontal scrolling');
 report.mobileAccessibility=await audit();assert.deepEqual(report.mobileAccessibility.violations,[],'Mobile conversation accessibility');
 await page.screenshot({path:join(output,'mobile-follow-up.png'),fullPage:true});report.checks.push('mobile same-session follow-up and accessible reflow');
 await page.getByRole('button',{name:'Open threads',exact:true}).click();
 await page.getByRole('button',{name:'New conversation',exact:true}).click();await page.route('**/api/threads/*',async route=>{if(route.request().method()==='PUT')await route.fulfill({status:503,body:'Unavailable'});else await route.continue();});
 const before=report.sessionPosts.length;await page.getByRole('textbox',{name:'Message Sofie',exact:true}).fill('retain this draft');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('alert').filter({hasText:'conversation'}).waitFor();assert.equal(report.sessionPosts.length,before);assert.equal(await page.getByRole('textbox',{name:'Message Sofie',exact:true}).inputValue(),'retain this draft');report.checks.push('failed save retains draft and prevents execution');
 report.status='PASS';
} catch(e){report.status='FAIL';report.error=String(e);if(page){report.pageText=await page.locator('body').innerText().catch(()=>'');report.draft=await page.getByRole('textbox',{name:'Message Sofie',exact:true}).inputValue().catch(()=>'');await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});}}
finally{await browser?.close();server?.kill('SIGTERM');if(server&&server.exitCode===null&&server.signalCode===null)await new Promise(r=>server.once('exit',r));await log?.close();await pool?.end();if(container)execFileSync(docker,['rm','-f',name],{stdio:'pipe'});report.cleanup='VERIFIED';await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
if(report.status!=='PASS')process.exitCode=1;
