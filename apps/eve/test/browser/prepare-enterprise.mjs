import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {materializeFixtureDependencies} from '../../../../scripts/myapps-composition/fixture-dependencies.mjs';
import {instrumentEnterpriseRuntimeConfig} from './enterprise-runtime-config-overlay.mjs';
import {disableFixtureDevIndicator} from './enterprise-visual-overlay.mjs';
import {instrumentEnterpriseConsumer,instrumentEnterpriseResponseFailure,instrumentEnterpriseAdapter,instrumentActionGateway} from './enterprise-diagnostics-overlay.mjs';
const source=resolve(process.argv[2]),target=resolve(process.argv[3]);
const sourceDirty=!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:source,encoding:'utf8'}).trim();
execFileSync('git',['clone','--no-hardlinks',source,target],{stdio:'pipe'});
const files=execFileSync('git',['ls-files','--cached','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean),hashes={};
for(const file of files){await mkdir(dirname(join(target,file)),{recursive:true});await copyFile(join(source,file),join(target,file));hashes[file]=createHash('sha256').update(await readFile(join(source,file))).digest('hex');}
const manifest={sourceDirty,sha:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),hashes,transformedHashes:{},instrumentation:'IN_PROGRESS',overlays:['Deterministic model','Loopback PostgreSQL transport','Fixture-only authoritative runtime credential file; missing or invalid configuration fails closed; canonical signatures and owner checks unchanged','Fixture-only allowlisted command error diagnostics; original error rethrown','Isolated next.config devIndicators:false; application and framework errors remain visible; runtime mode is reported separately'],paidOperations:0};
async function retainManifest() {
  const bytes=JSON.stringify(manifest,null,2)+'\n';
  await writeFile(join(target,'CHECKPOINT_H_FIXTURE.json'),bytes);
  if(process.env.MC_COMPOSED_BROWSER_OUTPUT){await mkdir(process.env.MC_COMPOSED_BROWSER_OUTPUT,{recursive:true});await writeFile(join(process.env.MC_COMPOSED_BROWSER_OUTPUT,'fixture-source.json'),bytes);}
}
await retainManifest();
try {
materializeFixtureDependencies(source,target);
await copyFile(join(source,'apps/eve/test/browser/enterprise-model.fixture.ts'),join(target,'apps/eve/agent/agent.ts'));
const config=join(target,'apps/eve/next.config.ts');await writeFile(config,disableFixtureDevIndicator(await readFile(config,'utf8')));
const transport=join(target,'apps/eve/test/browser/local-transport.cjs');await writeFile(transport,(await readFile(transport,'utf8')).replace("configured.pathname !== '/blocker_fixes'","configured.pathname !== '/postgres'"));
const consumer=join(target,'apps/eve/lib/missioncontrol/consumer.ts');
const code=instrumentEnterpriseRuntimeConfig(await readFile(consumer,'utf8'));
await writeFile(consumer,instrumentEnterpriseConsumer(instrumentEnterpriseResponseFailure(code)));
const adapter=join(target,'apps/eve/agent/lib/missioncontrol.ts');
await writeFile(adapter,instrumentEnterpriseAdapter(await readFile(adapter,'utf8')));
const gateway=join(target,'apps/eve/lib/action-gateway.ts');
await writeFile(gateway,instrumentActionGateway(await readFile(gateway,'utf8')));
manifest.instrumentation='PASS';
} catch(error) {
  manifest.instrumentation='FAILED';
  throw error;
} finally {
  for(const file of ['apps/eve/lib/missioncontrol/consumer.ts','apps/eve/agent/lib/missioncontrol.ts','apps/eve/lib/action-gateway.ts','apps/eve/next.config.ts']) {
    try {manifest.transformedHashes[file]=createHash('sha256').update(await readFile(join(target,file))).digest('hex');}
    catch { /* A missing source file is already represented by the failed instrumentation marker. */ }
  }
  try {await retainManifest();}
  catch(error) {if(manifest.instrumentation!=='FAILED')throw error;console.error('FIXTURE_MANIFEST_RETENTION_FAILED');}
}
