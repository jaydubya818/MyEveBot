import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({pending:false,research:0,analysis:0,drafts:0,sends:0,approved:false,
  resume:vi.fn(),client:vi.fn(),saveThread:vi.fn(),query:vi.fn()}));
vi.mock("eve/client",()=>({Client:class {
  constructor(){m.client();}
  session(){return {state:{},send:async function*(){m.research++;m.analysis++;m.drafts++;m.pending=true;yield {type:"turn.completed"};}};}
}}));
vi.mock("./routine-pending-send.ts",()=>({RoutinePendingSend:class {
  get=async()=>m.pending?{status:"awaiting_approval"}:null;
  resume=m.resume;
}}));
vi.mock("./action-gateway.ts",()=>({ActionGateway:class{}}));
vi.mock("./execution-auth.ts",()=>({signExecution:()=>"fixture",EXECUTION_HEADER:"x-fixture",resolveExecution:vi.fn()}));
vi.mock("./threads-db.ts",()=>({upsertThread:m.saveThread}));
vi.mock("../agent/lib/receipts-db.ts",()=>({db:()=>({query:m.query})}));
vi.mock("../agent/lib/email-send-adapter.ts",()=>({agentMailSendAdapter:()=>({})}));
import {routineRunner} from "../agent/lib/routine-runner.ts";
beforeEach(()=>{
  vi.clearAllMocks();Object.assign(m,{pending:false,research:0,analysis:0,drafts:0,sends:0,approved:false});
  m.resume.mockImplementation(async()=>{if(!m.approved)throw new Error("approval required");m.sends++;return "saved-draft";});
});
describe("approved pending send continuation",()=>{
  it("runs research, analysis and drafting once; approval resumes only the checkpoint",async()=>{
    const claim={ownerId:"sarah",runId:"same-run",occurrenceId:"same-occurrence",attempt:1,version:1,workerId:"first",configuration:{instructions:"Draft follow-up"}} as never;
    await expect(routineRunner.run(claim,new AbortController().signal)).rejects.toMatchObject({category:"approval_required"});
    expect([m.research,m.analysis,m.drafts,m.sends]).toEqual([1,1,1,0]);
    expect(m.saveThread).toHaveBeenCalledOnce();
    m.approved=true;
    expect(await routineRunner.run(claim,new AbortController().signal)).toEqual({resultReference:"saved-draft"});
    expect([m.research,m.analysis,m.drafts,m.sends]).toEqual([1,1,1,1]);
    expect(m.resume).toHaveBeenCalledOnce();expect(m.client).toHaveBeenCalledOnce();
    expect(m.resume.mock.calls[0][0]).toBe(claim);
  });
});
