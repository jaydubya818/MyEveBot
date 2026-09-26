import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {assertCandidateIdentity,createCandidate} from '../lib/engineering/github.ts';
import {digest} from '../lib/engineering/contract.ts';
import {nowIso} from '../lib/engineering/execution.ts';

const fixtureSource=`let input='';
for await (const chunk of process.stdin) input+=chunk;
const value=input.trim();
const quantity=Number(value);
console.log(JSON.stringify(/^[1-9]\\d*$/.test(value)&&Number.isSafeInteger(quantity)
  ? {quantity} : {error:'invalid_quantity'}));
`;

async function simulatedCheck(check){
  const child=spawn(process.execPath,['--input-type=module','-e',fixtureSource],
    {stdio:['pipe','pipe','pipe'],env:{PATH:process.env.PATH,NODE_ENV:'test'}});
  let stdout='',stderr='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),10_000);
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>16_000)child.kill('SIGKILL');});
  child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>16_000)child.kill('SIGKILL');});
  child.stdin.end(check.input);
  let code;
  try {code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}
  finally {clearTimeout(timer);}
  if(code!==check.expectedExitCode||stdout!==check.expectedOutput)
    throw Error(`Synthetic UI source failed check ${check.id}.`);
  return {code,stdout,stderr};
}

/** Candidate identity is real; verification and provider observations stay simulation-only. */
export async function syntheticCandidate(contract,generation){
  const base={sha:contract.baseSha,files:{'quantity.mjs':'console.log(0);'}};
  const id=randomUUID(),at=nowIso();
  const run={id,attemptId:randomUUID(),reason:'SIMULATED browser fixture candidate',generation,
    parentSha:base.sha,publicationParentSha:base.sha,status:'candidate',resource:`myeve-golden-${id}`,
    startedAt:at,endedAt:at,resourceReleasedAt:at,inputSnapshot:base};
  const candidate=createCandidate(contract,run,base,{'quantity.mjs':fixtureSource});
  run.candidate=candidate.sha;
  assertCandidateIdentity(contract,run,base,candidate);
  const localChecks=[];
  for(const check of contract.profile.checks){
    const observed=await simulatedCheck(check);
    const artifact=JSON.stringify({simulation:true,method:'local-host-check',check:check.id,...observed,
      limitation:'UI-only simulated evidence; no protected verifier or live provider ran.'});
    localChecks.push({id:randomUUID(),workId:contract.workId,candidate:candidate.sha,base:contract.baseSha,
      criteriaVersion:contract.criteriaVersion,profileHash:contract.profileHash,environment:'SIMULATED local host',
      check:check.id,producer:'simulation-local',attemptId:run.attemptId,observedAt:nowIso(),
      result:'PASS',artifact,artifactHash:digest(artifact)});
  }
  return {run,candidate,localChecks};
}
