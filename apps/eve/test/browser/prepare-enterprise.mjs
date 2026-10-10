import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,symlink,writeFile,readFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {instrumentEnterpriseRuntimeConfig} from './enterprise-runtime-config-overlay.mjs';
import {instrumentEnterpriseConsumer,instrumentEnterpriseResponseFailure,instrumentEnterpriseAdapter,instrumentActionGateway} from './enterprise-diagnostics-overlay.mjs';
const source=resolve(process.argv[2]),target=resolve(process.argv[3]);
execFileSync('git',['clone','--no-hardlinks',source,target],{stdio:'pipe'});
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:source,encoding:'utf8'}).split('\0').filter(Boolean),hashes={};
for(const file of files){await mkdir(dirname(join(target,file)),{recursive:true});await copyFile(join(source,file),join(target,file));hashes[file]=createHash('sha256').update(await readFile(join(source,file))).digest('hex');}
const manifest={sha:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),hashes,transformedHashes:{},instrumentation:'IN_PROGRESS',overlays:['Deterministic model','Loopback PostgreSQL transport','Fixture-only authoritative runtime credential file; missing or invalid configuration fails closed; canonical signatures and owner checks unchanged','Fixture-only allowlisted command error diagnostics; original error rethrown'],paidOperations:0};
async function retainManifest() {
  const bytes=JSON.stringify(manifest,null,2)+'\n';
  await writeFile(join(target,'CHECKPOINT_H_FIXTURE.json'),bytes);
  if(process.env.MC_COMPOSED_BROWSER_OUTPUT){await mkdir(process.env.MC_COMPOSED_BROWSER_OUTPUT,{recursive:true});await writeFile(join(process.env.MC_COMPOSED_BROWSER_OUTPUT,'fixture-source.json'),bytes);}
}
await retainManifest();
try {
await symlink(join(source,'node_modules'),join(target,'node_modules'));await symlink(join(source,'apps/eve/node_modules'),join(target,'apps/eve/node_modules'));
await copyFile(join(source,'apps/eve/test/browser/enterprise-model.fixture.ts'),join(target,'apps/eve/agent/agent.ts'));
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
  for(const file of ['apps/eve/lib/missioncontrol/consumer.ts','apps/eve/agent/lib/missioncontrol.ts','apps/eve/lib/action-gateway.ts']) {
    try {manifest.transformedHashes[file]=createHash('sha256').update(await readFile(join(target,file))).digest('hex');}
    catch { /* A missing source file is already represented by the failed instrumentation marker. */ }
  }
  try {await retainManifest();}
  catch(error) {if(manifest.instrumentation!=='FAILED')throw error;console.error('FIXTURE_MANIFEST_RETENTION_FAILED');}
}
