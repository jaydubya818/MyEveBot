import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function targetBlockers(target) {
 const blockers=[];
 if(target.independentSecurityGate!=='NOT_RUN'||target.productionPlatformGate!=='NOT_RUN')blockers.push('Preparation must not alter external gate status');
 if(target.implementationMayPassSecurityGate!==false)blockers.push('Implementation agent may not pass security gate');
 const p=target.preparationProofs??{};
 for(const key of ['hostedKms','purposeSeparatedKeys','versionedVerification','isolatedWorkloadIdentity','ingressAdmission','modelHardLiability','workerAdmission','artifactAdmission','outOfBandStop','syntheticEnvironmentIsolation'])
  if(p[key]?.status!=='VERIFIED'||!p[key]?.evidence)blockers.push(key);
 for(const key of ['myeveQualificationDeploymentId','relayQualificationDeploymentId','peerQualificationDeploymentId','operator','peerOperator','stopContact','testWindow'])
  if(!target.target?.[key])blockers.push(key);
 return blockers;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const target=JSON.parse(readFileSync(new URL('../../../docs/federation/production-readiness/target-manifest.json',import.meta.url)));
 const blockers=targetBlockers(target);console.log(JSON.stringify({launchable:blockers.length===0,blockers,executesGate:false},null,2));
 if(blockers.length)process.exitCode=1;
}
