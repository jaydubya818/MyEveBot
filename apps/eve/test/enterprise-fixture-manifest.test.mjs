import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

test('fixture source and transformed hashes survive successful and failed instrumentation in retained artifacts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'enterprise-manifest-')),source=join(root,'source');
  try {
    await mkdir(source);
    const files={
      'apps/eve/test/browser/enterprise-model.fixture.ts':'export const model="fixture";',
      'apps/eve/agent/agent.ts':'export const model="original";',
      'apps/eve/test/browser/local-transport.cjs':"const allowed=configured.pathname !== '/blocker_fixes';",
      'apps/eve/lib/missioncontrol/consumer.ts':"export function enterpriseConfig(env: NodeJS.ProcessEnv = process.env): EnterpriseConfig {return env;}\nexport async function sendEnterpriseCommand(body:any) {if(body.status!=='success')throw Error('ENTERPRISE_COMMAND_DENIED');return body.value;}",
      'apps/eve/agent/lib/missioncontrol.ts':'export function enterpriseAdapter(adapter:any) {return adapter;}',
      'apps/eve/lib/action-gateway.ts':'async function run(){try{throw Error();\n    } catch {\n      await this.record(action.ownerId,actionId,"result_unknown",{});\nthrow Error("unknown");}}',
    };
    for(const [path,bytes] of Object.entries(files)){await mkdir(dirname(join(source,path)),{recursive:true});await writeFile(join(source,path),bytes);}
    execFileSync('git',['init','-q'],{cwd:source});execFileSync('git',['add','.'],{cwd:source});
    execFileSync('git',['-c','user.name=Fixture Test','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','Disposable manifest test'],{cwd:source});
    const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
    for(const failed of [false,true]) {
      if(failed){files['apps/eve/agent/lib/missioncontrol.ts']='export function changedAdapter() {}';await writeFile(join(source,'apps/eve/agent/lib/missioncontrol.ts'),files['apps/eve/agent/lib/missioncontrol.ts']);}
      const target=join(root,failed?'failed':'passed'),output=join(root,failed?'failed-artifact':'passed-artifact');
      const result=spawnSync(process.execPath,[fileURLToPath(new URL('./browser/prepare-enterprise.mjs',import.meta.url)),source,target],{encoding:'utf8',env:{...process.env,MC_COMPOSED_BROWSER_OUTPUT:output}});
      assert.equal(result.status,failed?1:0,result.stderr);
      const bytes=await readFile(join(target,'CHECKPOINT_H_FIXTURE.json'),'utf8');
      assert.equal(await readFile(join(output,'fixture-source.json'),'utf8'),bytes);
      const manifest=JSON.parse(bytes);assert.equal(manifest.sha,sha);assert.equal(manifest.instrumentation,failed?'FAILED':'PASS');
      for(const [path,original] of Object.entries(files))assert.equal(manifest.hashes[path],createHash('sha256').update(original).digest('hex'));
      for(const [path,digest] of Object.entries(manifest.transformedHashes))assert.equal(digest,createHash('sha256').update(await readFile(join(target,path))).digest('hex'));
      assert.notEqual(manifest.transformedHashes['apps/eve/lib/missioncontrol/consumer.ts'],manifest.hashes['apps/eve/lib/missioncontrol/consumer.ts']);
      if(failed)assert.equal(manifest.transformedHashes['apps/eve/agent/lib/missioncontrol.ts'],manifest.hashes['apps/eve/agent/lib/missioncontrol.ts']);
    }
  } finally {await rm(root,{recursive:true,force:true});}
});
