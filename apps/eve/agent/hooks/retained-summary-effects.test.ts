import {it,expect,vi} from 'vitest';
import chatRun from './owner-chat-run.ts';
import taskLedger from './task-ledger.ts';
import agentRuns from './agent-runs.ts';
const m=vi.hoisted(()=>({recover:vi.fn(),resolve:vi.fn(),query:vi.fn(),budget:vi.fn(),record:vi.fn(),register:vi.fn(),complete:vi.fn(),fail:vi.fn()}));
vi.mock('../lib/action-context.ts',()=>({ownerChatRun:m.recover}));
vi.mock('../lib/session-settings.ts',()=>({resolveSessionAgent:m.resolve}));
vi.mock('../lib/receipts-db.ts',()=>({db:()=>({query:m.query})}));
vi.mock('../../lib/task-runs.ts',()=>({assertTaskBudget:m.budget,recordTaskModelStep:m.record,registerTaskSubagent:m.register,completeTaskSubagent:m.complete,failTaskSubagent:m.fail}));
const ctx={session:{id:'existing-session',auth:{current:{principalType:'user',principalId:'owner',attributes:{owner:'true',myeveRetainedSummary:'server-bound'}}}}} as any;
it('observation never renews old execution, budgets or model accounting',async()=>{
 const event={data:{message:'Explain the completed result',usage:{costUsd:0}}} as any;
 await (chatRun.events!['message.received'] as any)(event,ctx);
 await (taskLedger.events!['step.started'] as any)(event,ctx);
 await (taskLedger.events!['step.completed'] as any)(event,ctx);
 await (agentRuns.events!['step.completed'] as any)(event,ctx);
 for(const fn of Object.values(m))expect(fn).not.toHaveBeenCalled();
});
it('observation rejects compaction and delegation instead of gaining auxiliary authority',async()=>{
 for(const name of ['actions.requested','compaction.requested','subagent.called','subagent.completed','action.result'])await expect((taskLedger.events as any)[name]({data:{}},ctx)).rejects.toThrow();
 for(const fn of Object.values(m))expect(fn).not.toHaveBeenCalled();
});
