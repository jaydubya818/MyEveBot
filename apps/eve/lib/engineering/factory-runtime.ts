import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {factoryConfig,FactoryRouteAuthority} from './factory-routing.ts';
import {FactoryWorkDriver} from './factory-work-driver.ts';
import {DirectDevelopmentStore} from './direct-development.ts';
import {DockerProtectedVerifier} from './docker-executor.ts';
import {WorkStore} from './store.ts';
import {preflightApprovedBase} from './base-preflight.ts';
const exec=promisify(execFile);
/** Only reviewed exact Git objects; no ambient credentials or mutable checkout. */
export async function factoryRuntime(store:WorkStore){
 const config=await factoryConfig(),c=config.engineering;
 if('transport' in config.connection)throw new Error('Cloud source and independent verifier runtime are not yet qualified');
 const repositoryPath=config.connection.repositoryPath;
 const source=async()=>{
  const files:Record<string,string>={};
  for(const file of c.approvedBase.files){
   const {stdout}=await exec('git',['-C',repositoryPath,'show',`${c.approvedBase.sha}:${file.path}`],{encoding:'utf8',maxBuffer:1000000,timeout:10000});
   files[file.path]=stdout;
  }
  const snapshot={sha:c.approvedBase.sha,files};preflightApprovedBase(c.profile,c.approvedBase,snapshot,1);return snapshot;
 };
 return new FactoryWorkDriver(store,new FactoryRouteAuthority(store),new DirectDevelopmentStore(store,{profile:c.profile,approvedBase:c.approvedBase,objective:c.objective,criteria:c.criteria,agentId:c.agentId,issueNumber:1}),new DockerProtectedVerifier(),source);
}
