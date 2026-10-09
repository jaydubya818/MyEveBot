import {Denied} from './postgres.mjs';
/** Synthetic operator commands are control-plane RPC, not extra HTTP proxies.
 * Application workers invoke the existing owner library locally; every outbound
 * federation/provider request still goes through exactly one transport permit. */
export async function job(controller,p,action,input){
 const a=controller.authority;
 return a.transaction((s,now)=>{
  controller.live(s,now,p);s.jobs??={};
  if(action==='job-submit'){
   if(p.role!=='operator'||!['myeve','peer'].includes(input.worker)||!/^[a-zA-Z0-9_-]{8,120}$/.test(input.id)||Object.keys(s.jobs).length>=120||s.jobs[input.id])throw new Denied('JOB_DENIED');
   const command=input.command;
   if(!command||!['connect','preview','confirm','publication-status','grant','revoke-grant','send','get','decide','policy','peer','artifact-share','artifact-revoke','rotate','revoke-credential'].includes(command.operation)||JSON.stringify(command).length>16000||/"(?:password|credential|token|secret)"\s*:/.test(JSON.stringify(command)))throw new Denied('JOB_COMMAND_DENIED');
   s.jobs[input.id]={worker:input.worker,command,state:'QUEUED'};return {id:input.id};
  }
  if(action==='job-take'){
   if(p.role!=='worker'||!['myeve','peer'].includes(p.component))throw new Denied('JOB_ROLE_DENIED');
   const next=Object.entries(s.jobs).find(([,v])=>v.worker===p.name&&v.state==='QUEUED');
   if(!next)return {job:null};next[1].state='STARTED';return {job:{id:next[0],command:next[1].command}};
  }
  const current=s.jobs[input.id];if(!current)throw new Denied('JOB_MISSING');
  if(action==='job-result'){if(p.role!=='operator')throw new Denied('JOB_ROLE_DENIED');return {state:current.state,result:current.result};}
  if(action==='job-complete'){
   if(p.role!=='worker'||current.worker!==p.name||current.state!=='STARTED'||!['COMPLETED','FAILED'].includes(input.state)||(JSON.stringify(input.result)?.length??Infinity)>131072)throw new Denied('JOB_DENIED');
   current.state=input.state;current.result=input.result;return {recorded:true};
  }
  throw new Denied('JOB_ACTION_DENIED');
 });
}
