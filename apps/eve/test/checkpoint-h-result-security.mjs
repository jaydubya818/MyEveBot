import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateResultSecurity} from './result-security-evidence.mjs';
const root=process.cwd(),output=resolve(process.argv[2]),expectedMcSha=process.argv[3];await mkdir(output,{recursive:true});
const sha=path=>execFileSync('git',['rev-parse','HEAD'],{cwd:path,encoding:'utf8'}).trim();
const clean=path=>assert.equal(execFileSync('git',['status','--porcelain'],{cwd:path,encoding:'utf8'}).trim(),'');
const report={schema:'checkpoint-h-result-security/v1',myEveSha:sha(root),missionControlSha:expectedMcSha,status:'IN_PROGRESS',fullOwnerJourney:'NOT_RUN',releaseGate:'ADVISORY',paidOperations:0,productionIntegration:'NOT_RUN'};
try {
  assert.match(expectedMcSha??'',/^[a-f0-9]{40}$/);
  const mc=resolve(process.env.MISSIONCONTROL_SOURCE_ROOT??'');assert.equal(sha(mc),expectedMcSha);clean(mc);clean(root);
  if(!process.env.MC_GOLDEN_RUNTIME_BUILD){report.status='NOT_RUN';report.reason='Exact locked native runtime is required.';}
  else {
    assert.equal(sha(process.env.MC_LOCAL_MYFACTORY_ROOT),'e498c31db8b749fa91b0544ecd1d1a661b971c2c');
    const env={...process.env,MC_SOFIE_RESULT_CONSUMER_ROOT:root,MC_COMPOSED_BROWSER_OUTPUT:join(output,'observations')};
    for(const name of ['MYEVE_CHECKPOINT_H_BROWSER','MC_COMPOSED_BROWSER_MODULE','MC_COMPOSED_BROWSER_CONFIG_FILE'])delete env[name];
    await mkdir(env.MC_COMPOSED_BROWSER_OUTPUT,{recursive:true});
    const run=spawnSync(process.execPath,['--import','tsx','scripts/qualification/native-successor-journey.mts',process.env.MC_GOLDEN_RUNTIME_BUILD,process.env.MC_GOLDEN_DOCKER,join(output,'hybrid'),'hybrid'],{cwd:mc,encoding:'utf8',maxBuffer:32*1024*1024,env});
    await writeFile(join(output,'hybrid.log'),(run.stdout??'')+(run.stderr??''));assert.equal(run.status,0,'Completed Result security process must pass');
    const journey=JSON.parse(await readFile(join(output,'hybrid/journey.json'),'utf8'));
    const records=JSON.parse(await readFile(join(output,'hybrid/durable-records.json'),'utf8'));
    const {validateHybrid}=await import(pathToFileURL(join(mc,'scripts/enterprise-golden-journey/evidence.mjs')).href);
    report.proof=validateHybrid(journey,records,expectedMcSha);
    report.consumer=validateResultSecurity(journey.stages.completedEnterpriseResultConsumer,report.myEveSha,report.proof.missionId);
    clean(root);clean(mc);report.status='PASS';
  }
} catch(error){report.status='FAIL';report.error=String(error);}
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(report.status!=='PASS')process.exitCode=1;
