import {listAgents} from './apps/eve/lib/agents.ts';
import {listGoals} from './apps/eve/lib/goals.ts';
import {createDelegatedTask,transitionTask,completeDelegatedTask} from './apps/eve/lib/task-runs.ts';
import {requestApproval} from './apps/eve/lib/approvals.ts';
const ownerId='acceptance-sarah';
const agent=(await listAgents(ownerId)).find(x=>x.name==='Analyst');
const goal=(await listGoals(ownerId)).find(x=>x.title==='Launch Project Atlas');
const output=[];
for(const state of ['running','paused','waiting_for_owner','failed','completed','approve','reject','race']){
 const task=await createDelegatedTask({ownerId,agentId:agent.id,goalId:goal.id,sessionId:'fixture-session-'+crypto.randomUUID(),title:'[Local fixture] Atlas '+state,objective:'Deterministic acceptance fixture; no model or external provider executes.',expectedOutput:'A clearly labeled local fixture for UI state validation.',maxWorkers:1,maxDurationSeconds:1800,maxModelSteps:2,maxEstimatedCostUsd:0.01});
 if(['approve','reject','race'].includes(state)){
  const approval=await requestApproval({ownerId,taskId:task.id,requestedBy:agent.id,capabilityId:'web.read',resource:'urn:myeve:acceptance:atlas-synthetic-notes',action:'Read the synthetic Atlas acceptance notes',actionClass:'read',parameters:{fixture:true,scope:'synthetic Atlas notes'},effects:['Read one synthetic local evidence fixture. No external action will execute.'],prompt:'Allow this one synthetic read for the acceptance test?',forceApproval:true});output.push({state,taskId:task.id,approval});
 }else if(state==='completed'){
  await completeDelegatedTask({ownerId,taskId:task.id,summary:'[Deterministic fixture] Atlas qualification findings: mobile drawer and backup validation need fixes.',evidenceSummary:'Based on observed local UI tests: duplicate ZIP and secret-bearing archive accepted; mobile drawer trigger intercepted. This fixture exercises persistence and rendering; no model-backed work is claimed.'});output.push({state,taskId:task.id});
 }else {if(state!=='running')await transitionTask(ownerId,task.id,state,'owner','Deterministic local qualification state');output.push({state,taskId:task.id});}
}
console.log(JSON.stringify(output,null,2));
