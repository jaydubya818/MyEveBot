import {beforeAll,afterAll,expect,test} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {Env,connection} from '../../../apps/eve/lib/external-alpha/work-test-fixture.ts';
import {digest} from '../src/alpha-tasks/contracts.ts';
// @ts-ignore Public synthetic runtime, no candidate code is run by these entrypoint checks.
import {fixture} from '../test/alpha-tasks/fixtures.mjs';
const run=promisify(execFile),enabled=Boolean(connection);
let env:Env,role:string,root:string,childEnv:NodeJS.ProcessEnv;
beforeAll(async()=>{
  if(!enabled)return;
  env=await Env.create();role='app_boot_'+env.name.slice(8);root=await mkdtemp(join(tmpdir(),'myapps-cold-bootstrap-'));
  const password=randomUUID();
  await env.pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await env.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await env.pool.query(`GRANT SELECT ON myapps_installations,myapps_candidates,myapps_receipts,myapps_install_requests TO ${role}`);
  const url=new URL(connection!);url.pathname='/'+env.name;url.username=role;url.password=password;
  const config={version:1,kind:'OWNER_FACTORY',ownerId:env.owner,installationId:'synthetic-owner-installation',agentId:'synthetic-agent',
    runtimeId:'synthetic-local-host',target:'private-tasks',sourceRoot:root,runtime:fixture().runtime};
  childEnv={PATH:process.env.PATH,NODE_ENV:'test',MYAPPS_LOCAL_INTEGRATION:'1',MYAPPS_LOCAL_REGISTRATION:JSON.stringify(config),
    MYAPPS_LOCAL_REGISTRATION_SHA256:digest(config),MYEVE_OWNER_ID:env.owner,MYEVE_MISSIONCONTROL_MODE:'APPROVED_NONPRODUCTION',
    MYEVE_CAPABILITY_CONTROL_ENABLED:'true',MYEVE_CAPABILITY_INSTALLATION_ID:config.installationId,MYEVE_CAPABILITY_ENVIRONMENT:'qualification',
    MYEVE_CAPABILITY_ORIGIN:'http://localhost:3999',DATABASE_URL:url.href,MYEVE_CAPABILITY_DATABASE_URL:url.href,
    MYEVE_ACCESS_PASSWORD:randomUUID(),MYEVE_SESSION_SECRET:randomUUID()+randomUUID()};
},30000);
afterAll(async()=>{
  if(env){await env.pool.query('DROP OWNED BY '+role);await env.pool.query('DROP ROLE '+role);await env.close();}
  if(root)await rm(root,{recursive:true,force:true});
});
test.skipIf(!enabled)('cold web entrypoint initializes exact local owner without manual binding and keeps signed authentication',async()=>{
  const {stdout}=await run(process.execPath,['--import','tsx','--input-type=module','-e',`
    import {handleInstalledApps} from './apps/eve/lib/myapps/hosting.ts';
    import {closeLocalAppsBootstrap} from './apps/eve/lib/myapps/local-bootstrap.ts';
    import {createWebSessionToken,WEB_SESSION_COOKIE} from './apps/eve/lib/web-auth.ts';
    const request=extra=>new Request('http://localhost:3999/api/myapps/alpha',{method:'POST',
      headers:{origin:'http://localhost:3999','content-type':'application/json',...extra},body:JSON.stringify({operation:'catalog'})});
    try {
      const anonymous=await handleInstalledApps(request({}));
      const cookie=WEB_SESSION_COOKIE+'='+createWebSessionToken();
      const own=await handleInstalledApps(request({cookie}));
      const foreign=await handleInstalledApps(request({cookie,'x-myeve-browser-owner':'foreign'}));
      process.stdout.write(JSON.stringify({anonymous:anonymous.status,own:own.status,body:await own.json(),foreign:foreign.status}));
    } finally {await closeLocalAppsBootstrap();}
  `],{cwd:resolve('.'),env:childEnv,maxBuffer:10000});
  expect(JSON.parse(stdout)).toEqual({anonymous:401,own:200,body:{apps:[]},foreign:401});
  expect(await env.count('myapps_installations')).toBe(0);expect(await env.count('myapps_receipts')).toBe(0);
},30000);
test.skipIf(!enabled)('cold Inbox delivery preserves an unrelated hashed action without activating the legacy adapter',async()=>{
  const {stdout}=await run(process.execPath,['--import','tsx','--input-type=module','-e',`
    import {consumeInstalledAppResponse} from './apps/eve/lib/myapps/hosting.ts';
    import {closeLocalAppsBootstrap} from './apps/eve/lib/myapps/local-bootstrap.ts';
    try {
      const result=await consumeInstalledAppResponse({ownerId:process.env.MYEVE_OWNER_ID,action:{id:'sha256:'+'a'.repeat(64)}});
      process.stdout.write(JSON.stringify({result}));
    } finally {await closeLocalAppsBootstrap();}
  `],{cwd:resolve('.'),env:childEnv,maxBuffer:10000});
  expect(JSON.parse(stdout)).toEqual({result:null});expect(await env.count('myapps_receipts')).toBe(0);
},30000);
