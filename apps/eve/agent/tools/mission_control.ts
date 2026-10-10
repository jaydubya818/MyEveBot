import { defineTool } from 'eve/tools';
import { ownerOnly } from '../lib/owner-gate.ts';
import { executeEnterpriseTool } from '../lib/missioncontrol.ts';
import { enterpriseInput } from '../../lib/missioncontrol/consumer.ts';

export default defineTool({
  approval:ownerOnly,availableInSubagents:false,inputSchema:enterpriseInput,
  description:'For an owner-requested software initiative spanning multiple workstreams and requiring enterprise governance, propose MissionControl. Direct and multi-agent tasks remain Sofie Native; bounded repository changes remain MyFactory. Prepare an inspectable proposal with a stable intentKey. Present its exact digest and Needs You decision. Only submit after the owner authorizes that digest in MissionControl; this tool cannot authorize it. Read the exact returned Mission and Plan revision to present WorkOrders, milestones, blockers and Quality Gate status. Do not infer enterprise acceptance from Factory success or claim a completed Result when NOT_AVAILABLE. This isolated readiness tool creates zero-budget drafts only and grants no execution authority.',
  label:{start:input=>input.operation==='enterprise.read'?'Read enterprise Mission status':'Prepare enterprise Mission'},
  execute:executeEnterpriseTool,
});
