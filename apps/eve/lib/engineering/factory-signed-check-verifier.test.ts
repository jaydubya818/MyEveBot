import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {profileSchema,digest,type RepositoryProfile} from './contract.ts';
import {signedCheckEvidence} from './factory-signed-check-verifier.ts';
import type {ResultManifest} from './factory-producer-protocol.ts';
import type {DirectVerificationContract} from './direct-development.ts';
import type {Candidate} from './execution.ts';

const image='sha256:'+'9'.repeat(64),base='b'.repeat(40),commit='c'.repeat(40),criterion=randomUUID();
const profileValue={id:'owner-app',version:1,repository:'owner/app',privateQualification:true,baseBranch:'main',allowedPaths:['src/App.jsx'],
 checks:[{id:'build',command:'vite build',criterionIds:[criterion]},{id:'test',command:'vitest run',criterionIds:[criterion]}],
 requiredCI:['factory-checks'],reviewerLogins:['owner'],policyVersion:1,executor:'claude-code',image,maxRuns:1,maxModelRequests:4,maxOutputTokens:8192};
function fixture(){
 const profile=profileSchema.parse(structuredClone(profileValue)) as RepositoryProfile;
 const contract={workId:randomUUID(),baseSha:base,criteriaVersion:1,profileHash:digest(profile),profile} satisfies DirectVerificationContract;
 const runId=randomUUID();
 const check=(command:string,status:'passed'|'failed')=>({id:randomUUID(),producer:'factory',runId,candidateCommit:commit,command,status,exitCode:status==='passed'?0:1,startedAt:'2026-11-04T00:00:00.000Z',finishedAt:'2026-11-04T00:00:01.000Z',logArtifactId:'log'});
 const manifest={status:'COMPLETED',candidate:{commit,tree:'d'.repeat(40),base},execution:{factoryVersion:'f'.repeat(64),runId,inputCommit:base,configuration:{verificationImage:image,commands:['vite build','vitest run']}},
  evidence:[check('vite build','passed'),check('vitest run','passed')]} as unknown as ResultManifest;
 const candidate={sha:commit,baseSha:base,attemptId:runId,producer:'MYFACTORY',workId:contract.workId,factoryProvenance:{factoryVersion:'f'.repeat(64),remoteRunId:runId}} as Candidate;
 return {profile,contract,manifest,candidate,expected:{factoryVersion:'f'.repeat(64)}};
}
describe('profile checks',()=>{
 it('accepts Factory command checks and an immutable local image ID',()=>{
  expect(profileSchema.parse(profileValue).checks[0]).toEqual({id:'build',command:'vite build',criterionIds:[criterion]});
 });
 it('still rejects a mutable image tag',()=>{
  expect(()=>profileSchema.parse({...profileValue,image:'node:22-bookworm'})).toThrow();
 });
});
describe('MyFactory signed check evidence',()=>{
 it('projects each signed passed check onto its profile check',()=>{
  const f=fixture(),evidence=signedCheckEvidence(f.manifest,f.contract,f.candidate,f.expected);
  expect(evidence.map(e=>[e.check,e.result])).toEqual([['build','PASS'],['test','PASS']]);
  expect(evidence.every(e=>e.environment===image&&e.candidate===commit&&e.producer==='protected-supervisor'&&e.artifactHash===digest(e.artifact))).toBe(true);
 });
 it('a failed signed check stays FAIL and a missing one is UNKNOWN',()=>{
  const f=fixture();f.manifest.evidence[1].status='failed';
  expect(signedCheckEvidence(f.manifest,f.contract,f.candidate,f.expected).map(e=>e.result)).toEqual(['PASS','FAIL']);
  f.manifest.evidence.pop();
  expect(signedCheckEvidence(f.manifest,f.contract,f.candidate,f.expected).map(e=>e.result)).toEqual(['PASS','UNKNOWN']);
 });
 it('refuses evidence that does not bind to the candidate, base, image or FactoryVersion',()=>{
  const changes:((f:ReturnType<typeof fixture>)=>void)[]=[
   f=>{f.manifest.candidate!.commit='e'.repeat(40);},
   f=>{f.manifest.execution.inputCommit='e'.repeat(40);},
   f=>{f.manifest.execution.configuration.verificationImage='node:22-bookworm';},
   f=>{f.expected.factoryVersion='0'.repeat(64);},
   f=>{f.manifest.evidence[0].candidateCommit='e'.repeat(40);},
   f=>{(f.manifest as {status:string}).status='FAILED';},
   f=>{f.candidate.attemptId=randomUUID();},
  ];
  for(const change of changes){const f=fixture();change(f);expect(()=>signedCheckEvidence(f.manifest,f.contract,f.candidate,f.expected)).toThrow('FACTORY_SIGNED_CHECKS_BINDING');}
 });
});
describe('protected verifier selection',()=>{
 it('local Factory connections with command checks use signed evidence; black-box local profiles keep the injected verifier; cloud stays cloud',async()=>{
  const {protectedVerifierKind}=await import('./factory-signed-check-verifier.ts');
  const command=profileSchema.parse(profileValue),blackBox={...command,checks:[{id:'x',program:'a.mjs',input:'',expectedOutput:'',expectedExitCode:0,criterionIds:[criterion]}]} as RepositoryProfile;
  expect(protectedVerifierKind({},command)).toBe('FACTORY_SIGNED_CHECKS');
  expect(protectedVerifierKind({},blackBox)).toBe('INJECTED');
  expect(protectedVerifierKind({source:{}},command)).toBe('CLOUD');
 });
});
