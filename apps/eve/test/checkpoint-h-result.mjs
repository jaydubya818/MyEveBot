import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),output=resolve(process.argv[2]);await mkdir(output,{recursive:true});
const mc=resolve(process.env.MISSIONCONTROL_SOURCE_ROOT??'');
const sha=path=>execFileSync('git',['rev-parse','HEAD'],{cwd:path,encoding:'utf8'}).trim();
assert.equal(sha(mc),'5e628f8e7a718a35437f63abb1f406cb2f966c37');
const report={schema:'checkpoint-h-result-browser/v1',myEveSha:sha(root),missionControlSha:sha(mc),status:'IN_PROGRESS',releaseGate:'ADVISORY',fullJourney:'NOT_RUN',paidOperations:0,productionIntegration:'NOT_RUN',externalAlphaChanges:0};
try {
 if(!process.env.MC_GOLDEN_RUNTIME_BUILD) {report.status='NOT_RUN';report.reason='Exact locked native runtime package unavailable; no substitute or expiry extension allowed.';}
 else {
  assert.equal(sha(process.env.MC_LOCAL_MYFACTORY_ROOT),'e498c31db8b749fa91b0544ecd1d1a661b971c2c');
  const controlEnvironment={...process.env};
  for(const key of ['MC_SOFIE_RESULT_CONSUMER_ROOT','MYEVE_CHECKPOINT_H_BROWSER','MC_COMPOSED_BROWSER_OUTPUT'])delete controlEnvironment[key];
  const controls=spawnSync(process.execPath,['--import','tsx','scripts/qualification/native-successor-journey.mts',process.env.MC_GOLDEN_RUNTIME_BUILD,process.env.MC_GOLDEN_DOCKER,join(output,'native-controls'),'execute'],{cwd:mc,encoding:'utf8',maxBuffer:32*1024*1024,env:controlEnvironment});
  await writeFile(join(output,'native-controls.log'),(controls.stdout??'')+(controls.stderr??''));
  assert.equal(controls.status,0,'Separate native fault and gate controls must pass before the positive linked journey');
  const controlJourney=JSON.parse(await readFile(join(output,'native-controls/journey.json'),'utf8'));
  const {validateNativeControls,validateHybrid}=await import(pathToFileURL(join(mc,'scripts/enterprise-golden-journey/evidence.mjs')).href);
  report.nativeControls=validateNativeControls(controlJourney,report.missionControlSha);
  const scratch=await mkdtemp(join(tmpdir(),'checkpoint-h-result-')),fixture=join(scratch,'source');
  execFileSync(process.execPath,['apps/eve/test/browser/prepare-enterprise.mjs',root,fixture],{stdio:'pipe',env:{...process.env,MC_COMPOSED_BROWSER_OUTPUT:join(output,'browser')}});
  const log=spawnSync(process.execPath,['--import','tsx','scripts/qualification/native-successor-journey.mts',process.env.MC_GOLDEN_RUNTIME_BUILD,process.env.MC_GOLDEN_DOCKER,join(output,'hybrid'),'hybrid'],{cwd:mc,encoding:'utf8',maxBuffer:32*1024*1024,env:{...process.env,MC_SOFIE_RESULT_CONSUMER_ROOT:fixture,MYEVE_CHECKPOINT_H_BROWSER:'1',MC_COMPOSED_BROWSER_OUTPUT:join(output,'browser')}});
  await writeFile(join(output,'hybrid.log'),(log.stdout??'')+(log.stderr??''));
  const journey=JSON.parse(await readFile(join(output,'hybrid/journey.json'),'utf8'));
  const records=JSON.parse(await readFile(join(output,'hybrid/durable-records.json'),'utf8'));
  report.proof=validateHybrid(journey,records,report.missionControlSha);
  report.browser=journey.stages.completedEnterpriseResultConsumer?.browser??{status:'NOT_RUN'};
  report.execution={native:journey.nativeExecution,hybrid:journey.hybridMission,accounting:journey.nativeDelegatedAccounting};
  report.status=log.status===0&&report.browser.status==='PASS'?'PASS':'FAIL';
 }
} catch(error){report.status='FAIL';report.error=String(error);}
await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(report.status!=='PASS')process.exitCode=1;
