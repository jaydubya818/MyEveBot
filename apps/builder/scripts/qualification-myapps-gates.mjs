// Exercise generated adapters without a database, credentials or paid execution.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.argv[2];
assert.ok(root && path.isAbsolute(root));
const load = (file) => import(pathToFileURL(path.join(root, file)).href);
const { localAppsAllowed, bindLocalApps, handleInstalledApps } = await load('lib/myapps/hosting.ts');
const { default: dynamic } = await load('agent/tools/installed_apps.ts');
const owner = { principalType:'user', principalId:'owner-a', attributes:{owner:'true'} };
const context = (current, parent) => ({session:{id:'offline',auth:{current},parent}});
let authenticationCalls = 0;
for (const env of [
  {NODE_ENV:'production',VERCEL:'',MYAPPS_LOCAL_INTEGRATION:'1'},
  {NODE_ENV:'development',VERCEL:'1',MYAPPS_LOCAL_INTEGRATION:'1'},
  {NODE_ENV:'development',VERCEL:'',MYAPPS_LOCAL_INTEGRATION:''},
]) {
  Object.assign(process.env, env);
  assert.equal(localAppsAllowed(),false);
  assert.throws(()=>bindLocalApps({}), /APP_PRODUCTION_DISABLED/);
  assert.equal(await dynamic.events['step.started']({}, context(owner)),null);
  for (const asset of ['ui','app.js','app.css']) {
    const response = await handleInstalledApps(new Request(`http://localhost/api/myapps/${asset}`), async()=>{authenticationCalls++; throw Error('unexpected authentication');});
    assert.equal(response.status,404);
  }
}
assert.equal(authenticationCalls,0);
Object.assign(process.env,{NODE_ENV:'development',VERCEL:'',MYAPPS_LOCAL_INTEGRATION:'1'});
assert.equal(localAppsAllowed(),true);
for (const caller of [null, {...owner,principalType:'agent'}, {...owner,attributes:{owner:'false'}}, {...owner,attributes:{owner:'true',role:'guest'}}, {...owner,attributes:{owner:'true',myeveRoleId:'other-role'}}]) {
  assert.equal(await dynamic.events['step.started']({},context(caller)),null);
}
let admitted = 0;
let principal = {ownerId:'owner-a',actorId:'owner-a',kind:'human',allowedOperations:[]};
bindLocalApps({apps:{list:async()=>{admitted++;return[];},sofie:async()=>{throw Error('unexpected execution');}},policy:async()=>principal});
for (const asset of ['ui','app.js','app.css']) {
  const response=await handleInstalledApps(new Request(`http://localhost/api/myapps/${asset}`),async()=>({id:'owner-a'}));
  assert.equal(response.status,200);
  assert.ok((await response.text()).length>0);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'),'nosniff');
}
assert.equal(admitted,3);
for (const denied of [{...principal,ownerId:'owner-b'},{...principal,kind:'agent'}]) {
  principal=denied;
  assert.equal((await handleInstalledApps(new Request('http://localhost/api/myapps/ui'),async()=>({id:'owner-a'}))).status,404);
}
assert.equal(admitted,3);
assert.equal((await handleInstalledApps(new Request('http://localhost/api/myapps/ui'),async()=>null)).status,401);
const tool=await dynamic.events['step.started']({},context(owner));
assert.equal(tool.availableInSubagents,false);
principal={...principal,ownerId:'owner-b'};
for (const ctx of [context({...owner,principalId:'owner-b'}),context(owner,'parent-session'),context({...owner,attributes:{owner:'true',role:'guest'}}),context(owner)]) {
  await assert.rejects(tool.execute({request:'Show me my CRM.',requestId:'00000000-0000-4000-8000-000000000001'},ctx), /APP_UNAVAILABLE/);
}
console.log('PASS: generated production/Vercel/opt-in denials; guest, role, subagent and foreign-owner denials; three authenticated local assets; no execution.');
