import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {enterpriseBrowserEnvironment} from './browser/enterprise-browser.mjs';
import {instrumentEnterpriseRuntimeConfig} from './browser/enterprise-runtime-config-overlay.mjs';
const original=await readFile(new URL('../lib/missioncontrol/consumer.ts',import.meta.url),'utf8');
const configSource=original.slice(original.indexOf('export function enterpriseConfig('),original.indexOf('export function signedCommand('));
const pending={MYEVE_MISSIONCONTROL_MODE:'ISOLATED_DETERMINISTIC',MYEVE_MISSIONCONTROL_URL:'http://127.0.0.1:3390',
  MYEVE_MISSIONCONTROL_SECRET:'fixture-secret-'.repeat(4),MYEVE_MISSIONCONTROL_OWNER_ID:'owner',MYEVE_MISSIONCONTROL_OPERATOR_ID:'operator',
  MYEVE_MISSIONCONTROL_TENANT_ID:'tenant',MYEVE_MISSIONCONTROL_PROJECT_ID:'project',MYEVE_MISSIONCONTROL_CONNECTION_ID:'pending-draft'};
async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'enterprise-runtime-config-')),path=join(root,'consumer.ts'),config=join(root,'private-config.json');
  const previous=process.env.MC_COMPOSED_BROWSER_CONFIG_FILE;
  try {
    delete process.env.MC_COMPOSED_BROWSER_CONFIG_FILE;
    await writeFile(path,instrumentEnterpriseRuntimeConfig(configSource));
    // Warm startup may load the module before Result credentials exist. Only a tool call reads them.
    process.env.MC_COMPOSED_BROWSER_CONFIG_FILE=config;
    const {enterpriseConfig}=await import(pathToFileURL(path).href);
    delete process.env.MC_COMPOSED_BROWSER_CONFIG_FILE;
    await fn({enterpriseConfig,config});
  } finally {
    if(previous===undefined)delete process.env.MC_COMPOSED_BROWSER_CONFIG_FILE;else process.env.MC_COMPOSED_BROWSER_CONFIG_FILE=previous;
    await rm(root,{recursive:true,force:true});
  }
}
test('actual transformed consumer preserves unconfigured env and rereads complete draft-to-Result file updates',async()=>fixture(async({enterpriseConfig,config})=>{
  assert.equal(enterpriseConfig(pending).connectionId,'pending-draft');
  process.env.MC_COMPOSED_BROWSER_CONFIG_FILE=config;
  await writeFile(config,JSON.stringify(pending),{mode:0o600});
  assert.equal(enterpriseConfig(pending).connectionId,'pending-draft');
  await writeFile(config,JSON.stringify({...pending,MYEVE_MISSIONCONTROL_CONNECTION_ID:'actual-result'}));
  const current=enterpriseConfig(pending);assert.equal(current.connectionId,'actual-result');assert.ok(Object.isFrozen(current));
  await writeFile(config,JSON.stringify({...pending,MYEVE_MISSIONCONTROL_CONNECTION_ID:'reconnected-result'}));
  assert.equal(enterpriseConfig(pending).connectionId,'reconnected-result');assert.equal(current.connectionId,'actual-result');
}));
test('configured missing or malformed file fails closed without leaking path or contents',async()=>fixture(async({enterpriseConfig,config})=>{
  process.env.MC_COMPOSED_BROWSER_CONFIG_FILE=config;
  assert.throws(()=>enterpriseConfig(pending),{message:'FIXTURE_ENTERPRISE_CONFIG_UNAVAILABLE'});
  await writeFile(config,'PRIVATE_SENTINEL_INVALID_JSON');
  assert.throws(()=>enterpriseConfig(pending),{message:'FIXTURE_ENTERPRISE_CONFIG_UNAVAILABLE'});
  process.env.MC_COMPOSED_BROWSER_CONFIG_FILE='';
  assert.throws(()=>enterpriseConfig(pending),{message:'FIXTURE_ENTERPRISE_CONFIG_UNAVAILABLE'});
}));
test('incomplete or malformed JSON never inherits pending connection or secret from startup env',async()=>fixture(async({enterpriseConfig,config})=>{
  process.env.MC_COMPOSED_BROWSER_CONFIG_FILE=config;
  for(const body of [null,[],true,'PRIVATE_SENTINEL',{},...Object.keys(pending).map(key=>{const body={...pending};delete body[key];return body;}),
    {...pending,MYEVE_MISSIONCONTROL_CONNECTION_ID:7},{...pending,MYEVE_MISSIONCONTROL_SECRET:''}]) {
    await writeFile(config,JSON.stringify(body));
    assert.throws(()=>enterpriseConfig(pending),{message:'FIXTURE_ENTERPRISE_CONFIG_INVALID'});
  }
}));
test('configured file cannot bypass canonical endpoint, mode or credential checks',async()=>fixture(async({enterpriseConfig,config})=>{
  process.env.MC_COMPOSED_BROWSER_CONFIG_FILE=config;
  for(const [patch,message] of [[{MYEVE_MISSIONCONTROL_URL:'https://production.invalid'},'ENTERPRISE_DESTINATION_DENIED'],
    [{MYEVE_MISSIONCONTROL_MODE:'production'},'ENTERPRISE_DISABLED'],[{MYEVE_MISSIONCONTROL_SECRET:'short'},'ENTERPRISE_UNCONFIGURED']]) {
    await writeFile(config,JSON.stringify({...pending,...patch}));assert.throws(()=>enterpriseConfig(pending),{message});
  }
}));
test('overlay rejects missing, repeated and already transformed declarations',()=>{
  assert.throws(()=>instrumentEnterpriseRuntimeConfig(''));
  assert.throws(()=>instrumentEnterpriseRuntimeConfig(configSource+configSource));
  assert.throws(()=>instrumentEnterpriseRuntimeConfig(instrumentEnterpriseRuntimeConfig(configSource)));
});

test('actual browser startup env uses canonical proposal env and explicit Result runtime file',async()=>fixture(async({enterpriseConfig,config})=>{
  const options={source:'/fixture-source',owner:'owner',databaseUrl:'postgresql://localhost/fixture',output:'/fixture-output',password:'fixture-only'};
  // Even an inherited file setting cannot turn the proposal browser into a Result consumer.
  process.env.MC_COMPOSED_BROWSER_CONFIG_FILE=config;
  const proposal=enterpriseBrowserEnvironment(options);
  assert.equal(proposal.MC_COMPOSED_BROWSER_CONFIG_FILE,undefined);
  delete process.env.MC_COMPOSED_BROWSER_CONFIG_FILE;
  assert.equal(enterpriseConfig({...pending,...proposal}).connectionId,'pending-draft');
  const result=enterpriseBrowserEnvironment({...options,runtimeConfigFile:config});
  assert.equal(result.MC_COMPOSED_BROWSER_CONFIG_FILE,config);
  process.env.MC_COMPOSED_BROWSER_CONFIG_FILE=result.MC_COMPOSED_BROWSER_CONFIG_FILE;
  assert.throws(()=>enterpriseConfig({...pending,...result}),{message:'FIXTURE_ENTERPRISE_CONFIG_UNAVAILABLE'});
  await writeFile(config,JSON.stringify({...pending,MYEVE_MISSIONCONTROL_CONNECTION_ID:'actual-result'}),{mode:0o600});
  assert.equal(enterpriseConfig({...pending,...result}).connectionId,'actual-result');
}));
