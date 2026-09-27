import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Only the database transport and external model are replaced. All auth,
// assembly, projection, model selection, tools, gateway and admission code is real.
const local = vi.hoisted(() => ({ query: vi.fn(), provider: vi.fn(), catalog: vi.fn() }));
vi.mock("../../agent/lib/receipts-db.ts", () => ({ db: () => ({ query: local.query }) }));
vi.mock("ai", async importOriginal => {
  const original = await importOriginal<typeof import("ai")>();
  return { ...original, gateway: Object.assign(() => ({ doGenerate: local.provider }), { getAvailableModels: local.catalog }) };
});
import { routeAuth } from "eve/channels/auth";
import { eveAuth } from "../../agent/channels/eve.ts";
import { POST as login } from "../../app/api/auth/login/route.ts";
import instructions from "../../agent/instructions/persistent-agent.ts";
import contextHook from "../../agent/hooks/engineering-work-context.ts";
import agentDefinition from "../../agent/agent.ts";
import toolDefinition from "../../agent/tools/engineering_direct.ts";
import { loadMigrations, runMigrations } from "../../scripts/migration-runner.ts";
import { WorkStore } from "./store.ts";
import { runtimeSchema } from "./runtime.ts";
import { NativeRouteAuthority, admitNativeWork, nativeProfileHash, NATIVE_PROVIDER } from "./native-routing.ts";
import { nativeDevelopmentToolSchema } from "./native-input.ts";
import { EngineeringWorkerProjectionStore } from "./worker-projection.ts";
import { currentTruthLines, currentWorkMetadata } from "./current-truth-lines.ts";
import { nativeCompletionState } from "./native-completion.ts";
import { DirectDevelopmentStore } from "./direct-development.ts";
import { DirectVerificationDriver } from "./direct-verification-driver.ts";
import { DockerProtectedVerifier } from "./docker-executor.ts";
import { NativeResultStore } from "./native-results.ts";
import { nativeExecutionCapsule } from "./native-execution-controller.ts";
import { NativeModelBudget } from "./native-model-budget.ts";

const enabled = process.env.ADMISSION_CONTEXT_TEST_POSTGRES === "1";
const { Client, Pool } = createRequire(import.meta.url)("pg");
const owner = "admission-context-owner", agentId = "admission-context-sofie";
const name = `admission_context_${randomBytes(8).toString("hex")}`;
let admin: any, pool: any, store: WorkStore, config: ReturnType<typeof runtimeSchema.parse>, directory: string;
let admissionRace: (() => Promise<void>) | undefined;
const pricing = { input: "0.000002", output: "0.00001", cachedInputTokens: "0.0000002", cacheCreationInputTokens: "0.0000025" };
const captured: any[] = [];
function payloadState(options: any) {
  const part = options.prompt.flatMap((m: any) => Array.isArray(m.content) ? m.content : [])
    .find((p: any) => p.type === "text" && p.text.startsWith("Authoritative selected Work state"));
  if (!part) throw new Error("Missing actual provider-bound Work context");
  return JSON.parse(part.text.slice(part.text.indexOf("\n") + 1));
}
// Deliberately has no access to WorkStore, fixture Work or a closure version.
function proposeFromPayload(options: any) {
  const state = payloadState(options);
  const request = nativeDevelopmentToolSchema.parse({ request: {
    operation: "admit", expectedWorkVersion: state.expectedWorkVersion, expectedWorkGeneration: state.expectedWorkGeneration,
  } });
  if (request.request.operation !== "admit") throw new Error("Expected admission proposal");
  return { request: request.request };
}
async function freshWork() {
  const { work } = await store.create({ title: "Admission contract", objective: config.objective,
    repository: config.profile.repository, criteria: config.criteria, maxCostUsd: 1.3,
    maxDurationSeconds: 1800, idempotencyKey: randomUUID() });
  return store.change(work.id, { operation: "resume", expectedVersion: work.version });
}
async function assembled(workId: string, productive = true) {
  const providerCallsBeforeAssembly = local.provider.mock.calls.length;
  const sessionId = randomUUID(), threadId = randomUUID(), turnId = randomUUID();
  await pool.query("INSERT INTO web_chat_threads(id,owner_id,title,updated_at,chat,agent_id) VALUES($1,$2,'Local contract test',1,'{}',$3)", [threadId, owner, agentId]);
  const loginResponse = await login(new Request("http://localhost/api/auth/login", { method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" }, body: JSON.stringify({ password: "local-only-test" }) }));
  expect(loginResponse.status).toBe(200);
  const cookie = loginResponse.headers.get("set-cookie")!.split(";")[0];
  const request = new Request("http://localhost/eve/v1/session", { method: "POST", headers: {
    cookie, "x-myeve-thread-id": threadId,
    "x-myeve-engineering-work-id": workId, "x-myeve-engineering-intent": productive ? "continue" : "observe",
  } });
  const principal = await routeAuth(request, eveAuth);
  expect(principal).not.toBeInstanceOf(Response);
  const ctx: any = { session: { id: sessionId, turn: { id: turnId }, auth: { current: principal, initiator: principal } },
    callId: randomUUID(), channel: { kind: "http" }, conversation: { mode: "conversation" }, messages: [] };
  const instruction: any = await instructions.events["turn.started"]!({ data: { turnId } }, ctx);
  const markdown = instruction.markdown;
  expect(markdown).toContain("expectedWorkVersion");
  expect(markdown).toContain("expectedWorkGeneration");
  await contextHook.events!["step.started"]!({ data: { turnId } } as never, ctx);
  const tool: any = await toolDefinition.events["step.started"]!({}, ctx);
  const definition: any = agentDefinition;
  const selected = await definition.model.events["step.started"]({ data: { turnId, stepIndex: 0 } }, ctx);
  const options: any = { prompt: [{ role: "system", content: markdown },
    { role: "user", content: [{ type: "text", text: productive ? "Propose admission using only current supplied Work metadata." : "Explain current Work, read-only." }] }],
    tools: [{ type: "function", name: "engineering_direct", inputSchema: tool.inputSchema }] };
  // Framework normally serializes the tool's Zod schema before the provider wrapper.
  const { z } = await import("zod");
  options.tools[0].inputSchema = z.toJSONSchema(tool.inputSchema, { target: "draft-7" });
  expect(local.provider.mock.calls.length).toBe(providerCallsBeforeAssembly);
  return { ctx, tool, model: selected.model, options, markdown, cookie, threadId };
}
async function propose(a: Awaited<ReturnType<typeof assembled>>) {
  const before = captured.length;
  const result = await a.model.doGenerate(a.options);
  expect(captured.length - before).toBe(1); // no inspect/version-discovery call
  const parsed = nativeDevelopmentToolSchema.parse(JSON.parse(result.content[0].input));
  if (parsed.request.operation !== "admit") throw new Error("Expected admission proposal");
  return { request: parsed.request };
}
async function counts(workId: string) {
  const [row] = await local.query(`SELECT
    (SELECT count(*)::int FROM engineering_route_runs WHERE work_id=$1) runs,
    (SELECT count(*)::int FROM engineering_native_runtime WHERE work_id=$1) writers`, [workId]);
  return row;
}

describe.skipIf(!enabled)("authenticated production admission context with real PostgreSQL", () => {
  beforeAll(async () => {
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Network forbidden in local admission qualification"); }));
    admin = new Client({ connectionString: "postgresql://postgres@127.0.0.1:55468/postgres" });
    await admin.connect(); await admin.query(`CREATE DATABASE ${name}`);
    pool = new Pool({ connectionString: `postgresql://postgres@127.0.0.1:55468/${name}` });
    local.query.mockImplementation(async (sql, params) => {
      if (admissionRace && sql.includes("WITH locked_work AS MATERIALIZED") && sql.includes("), admitted AS (")) { const race = admissionRace; admissionRace = undefined; await race(); }
      return (await pool.query(sql, params)).rows;
    });
    const client = await pool.connect();
    try { await runMigrations({ query: async (s, p) => (await client.query(s, p)).rows, transaction: async statements => {
      await client.query("BEGIN"); try { for (const s of statements) await client.query(s.sql, s.params); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    } }, await loadMigrations(), () => {}); } finally { client.release(); }
    directory = await mkdtemp(join(tmpdir(), "admission-context-"));
    const issued = JSON.parse(await readFile(new URL("../../../../docs/verification/2026-09-26-gap2b-qualified/fresh-work.json", import.meta.url), "utf8"));
    const historical = JSON.parse(await readFile(new URL("../../../../docs/verification/2026-09-27-gap2b-live/issued-config.json", import.meta.url), "utf8"));
    config = runtimeSchema.parse({ ...historical, ownerId: owner, agentId, nativeQualification: undefined });
    expect(config.approvedBase).toEqual(issued.approvedBase);
    // Synthetic qualification exists ONLY in this disposable DB/config with the
    // provider mock and network kill switch. No live authority or old Work used.
    config.nativeQualification = { provider: NATIVE_PROVIDER, modelId: "anthropic/claude-sonnet-5", scopeId: owner,
      profileHash: nativeProfileHash(config), evidenceRef: "local-only-controlled-provider",
      qualifiedAt: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() + 1800000).toISOString() };
    await writeFile(join(directory, "config.json"), JSON.stringify(config));
    for (const [key, value] of Object.entries({ MYEVE_ENGINEERING_MODE: "dogfood", VERCEL_ENV: "development",
      MYEVE_ENGINEERING_CONFIG: join(directory, "config.json"), MYEVE_OWNER_ID: owner,
      DATABASE_URL: `postgresql://postgres@127.0.0.1:55468/${name}`,
      MYEVE_ACCESS_PASSWORD: "local-only-test", MYEVE_SESSION_SECRET: "0123456789abcdef0123456789abcdef" })) vi.stubEnv(key, value);
    await pool.query(`INSERT INTO agents(id,owner_id,name,slug,role,instructions,is_primary,status,max_estimated_cost_usd,max_runtime_seconds,max_steps)
      VALUES($1,$2,'Sofie','sofie','engineer','Bounded local contract test',true,'active',1.3,1800,10)`, [agentId, owner]);
    store = new WorkStore({ scopeId: owner, scopeKind: "personal", actorId: owner });
    local.catalog.mockResolvedValue({ models: [{ id: "anthropic/claude-sonnet-5", pricing }] });
    local.provider.mockImplementation(async options => {
      captured.push(options);
      const admitAvailable = JSON.stringify(options.tools).includes('"admit"');
      return { content: admitAvailable ? [{ type: "tool-call", toolName: "engineering_direct", toolCallId: randomUUID(), input: JSON.stringify(proposeFromPayload(options)) }]
        : [{ type: "text", text: "Current persisted Work metadata observed. No writer authority." }],
        usage: { inputTokens: { total: 1000 }, outputTokens: { total: 100 } }, finishReason: { unified: admitAvailable ? "tool-calls" : "stop" },
        warnings: [], providerMetadata: { gateway: { cost: "0.003" } } };
    });
  }, 120000);
  afterAll(async () => {
    await pool?.end(); if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${name}`); await admin.end(); }
    if (directory) await rm(directory, { recursive: true, force: true });
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });

  it("reproduces the preserved failed payload and refuses missing version or generation", async () => {
    const old = JSON.parse(await readFile(new URL("../../../../docs/verification/2026-09-27-gap2b-live/dispatches/payload-ec313b0c8bafbc88153bd6041984a88cde97b7e9b91d3b9db6f2b5f365b681a6.json", import.meta.url), "utf8"));
    expect(() => proposeFromPayload(old)).toThrow();
    const work = await freshWork(), a = await assembled(work.id), request = await propose(a);
    for (const key of ["expectedWorkVersion", "expectedWorkGeneration"] as const) {
      const missing: any = structuredClone(request); delete missing.request[key];
      expect(() => a.tool.inputSchema.parse(missing)).toThrow();
      await expect(admitNativeWork(store, work.id, missing.request.expectedWorkVersion, missing.request.expectedWorkGeneration)).rejects.toThrow();
    }
    expect(await counts(work.id)).toEqual({ runs: 0, writers: 0 });
  });

  it("real authenticated assembly supplies both tokens; model proposes; real tool/gateway admits, and binds the writer atomically", async () => {
    const work = await freshWork(), a = await assembled(work.id);
    expect(await counts(work.id)).toEqual({ runs: 0, writers: 0 });
    await expect(a.tool.execute({ request: { operation: "open" } }, a.ctx)).rejects.toThrow(/writer session/);
    const request = await propose(a), actual = payloadState(captured.at(-1));
    const ui = (await new EngineeringWorkerProjectionStore(store, agentId).get(work.id)).projection;
    expect(actual).toMatchObject(currentWorkMetadata(ui));
    // Budget projection precedes admission conversation reservation, so compare
    // canonical identity and all other facts against that initial assembly.
    for (const line of actual.currentTruth) expect(a.markdown).toContain(line);
    expect(actual.currentTruth[0]).toBe(currentTruthLines(ui)[0]);
    const result = await a.tool.execute(request, a.ctx);
    expect(JSON.stringify(result)).toContain("QUEUED");
    expect(await counts(work.id)).toEqual({ runs: 1, writers: 1 });
    await expect(new NativeModelBudget(store).assertSession(work.id, a.ctx.session.id)).resolves.toBeUndefined();
    const state = await nativeCompletionState(store, work.id);
    expect(state.contract.repairIterations).toBe(1);
    const [budget] = await local.query("SELECT *,engineering_completion_remaining(scope_id,work_id) held FROM engineering_work_model_budget WHERE work_id=$1", [work.id]);
    expect(Number(budget.held)).toBe(1013769);
    expect(Number(budget.spent_microusd) + Number(budget.held)).toBeLessThanOrEqual(1300000);
    expect(ui.readiness.ready).toBe(false);
  }, 30000);

  it.each(["version", "generation"])("denies stale %s after assembly and supplies fresh tokens after change", async field => {
    const work = await freshWork(), a = await assembled(work.id), request = await propose(a);
    await pool.query(`UPDATE engineering_work SET ${field}=${field}+1 WHERE id=$1`, [work.id]);
    await expect(admitNativeWork(store, work.id, request.request.expectedWorkVersion!, request.request.expectedWorkGeneration!)).rejects.toThrow(/current Work/);
    expect(await counts(work.id)).toEqual({ runs: 0, writers: 0 });
    const fresh = await assembled(work.id), next = await propose(fresh);
    const persisted = await store.get(work.id);
    expect(next.request).toMatchObject({ expectedWorkVersion: persisted.version, expectedWorkGeneration: persisted.generation });
    expect(next.request).not.toEqual(request.request);
  });

  it("denies generation changing at the final atomic admission boundary", async () => {
    const work = await freshWork(), a = await assembled(work.id), request = await propose(a);
    admissionRace = async () => { await pool.query("UPDATE engineering_work SET generation=generation+1 WHERE id=$1", [work.id]); };
    await expect(admitNativeWork(store, work.id, request.request.expectedWorkVersion!, request.request.expectedWorkGeneration!, new NativeRouteAuthority(store), a.ctx.session.id)).rejects.toThrow(/changed/);
    expect(await counts(work.id)).toEqual({ runs: 0, writers: 0 });
  });

  it("fresh read-only chat receives current metadata and cannot admit or acquire a writer", async () => {
    const work = await freshWork(), a = await assembled(work.id, false);
    await a.model.doGenerate(a.options);
    const actual = captured.at(-1);
    expect(payloadState(actual)).toMatchObject({ workId: work.id, expectedWorkVersion: work.version, expectedWorkGeneration: work.generation });
    expect(JSON.stringify(actual.tools)).not.toContain('"admit"');
    const proposal = proposeFromPayload(actual);
    await expect(a.tool.execute(proposal, a.ctx)).rejects.toThrow(/read-only/);
    expect(await counts(work.id)).toEqual({ runs: 0, writers: 0 });
  });

  it("rejects anonymous authentication, malformed tokens and future versions", async () => {
    const anonymous = await routeAuth(new Request("http://localhost/eve/v1/session", { method: "POST" }), eveAuth);
    expect(anonymous).toBeInstanceOf(Response);
    const work = await freshWork(), a = await assembled(work.id), proposal = await propose(a);
    for (const key of ["expectedWorkVersion", "expectedWorkGeneration"] as const) {
      for (const value of [null, "2", 0, -1, 1.5]) {
        const malformed = structuredClone(proposal) as any; malformed.request[key] = value;
        expect(() => a.tool.inputSchema.parse(malformed)).toThrow();
      }
    }
    await expect(admitNativeWork(store, work.id, proposal.request.expectedWorkVersion + 1,
      proposal.request.expectedWorkGeneration)).rejects.toThrow(/current Work/);
    expect(await counts(work.id)).toEqual({ runs: 0, writers: 0 });
  });

  it("changing read-only to productive intent does not itself admit a route or acquire custody", async () => {
    const work = await freshWork(), a = await assembled(work.id, false);
    const current = await routeAuth(new Request("http://localhost/eve/v1/session", { method: "POST", headers: {
      cookie: a.cookie, "x-myeve-thread-id": a.threadId, "x-myeve-engineering-work-id": work.id,
      "x-myeve-engineering-intent": "continue",
    } }), eveAuth);
    expect(current).not.toBeInstanceOf(Response);
    a.ctx.session.auth.current = current;
    const tool: any = await toolDefinition.events["step.started"]!({}, a.ctx);
    await expect(tool.execute({ request: { operation: "open" } }, a.ctx)).rejects.toThrow(/writer session/);
    expect(await counts(work.id)).toEqual({ runs: 0, writers: 0 });
  });

  async function nextStep(a: Awaited<ReturnType<typeof assembled>>, step: number) {
    a.ctx.callId=randomUUID();
    await contextHook.events!["step.started"]!({data:{turnId:a.ctx.session.turn.id}} as never,a.ctx);
    const selected:any=await (agentDefinition as any).model.events["step.started"]({data:{turnId:a.ctx.session.turn.id,stepIndex:step}},a.ctx);
    const beforeModel=(await new EngineeringWorkerProjectionStore(store,agentId).get(a.ctx.session.auth.current.attributes.myeveEngineeringWorkId)).projection;
    const result=await selected.model.doGenerate(a.options);
    const supplied=payloadState(captured.at(-1));
    if(supplied.failure) {
      const c=beforeModel.executionController!;
      expect(supplied.executionController).toEqual({phase:c.phase,nextOperation:c.nextOperation,allowedOperations:c.allowedOperations,targets:c.targets,budget:c.budget,progress:c.progress.recovery});
      expect(supplied.nativeExecution).toEqual({admissionRequired:false,runId:c.runId,writerSessionId:c.writer});
      expect(supplied).toMatchObject({...currentWorkMetadata(beforeModel),revision:c.revision,candidate:{sha:c.candidate}});
      expect(Buffer.byteLength(JSON.stringify({prompt:captured.at(-1).prompt,tools:captured.at(-1).tools}))+4096).toBeLessThanOrEqual(13000);
    } else if(supplied.executionController) {
      expect(supplied.executionController).toEqual(JSON.parse(JSON.stringify({...beforeModel.executionController,metrics:undefined})));
      expect(supplied.currentTruth).toEqual(currentTruthLines(beforeModel));
    }
    const call=result.content.find((item:any)=>item.type==="tool-call");
    if(!call)throw new Error("Expected a controlled productive proposal");
    const proposal=nativeDevelopmentToolSchema.parse(JSON.parse(call.input));
    a.ctx.callId=call.toolCallId;
    const response=await a.tool.execute(proposal,a.ctx);
    // Actual framework-shaped tool feedback, never a harness next-action instruction.
    a.options.prompt.push({role:"assistant",content:[call]},{role:"tool",content:[{
      type:"tool-result",toolCallId:call.toolCallId,toolName:"engineering_direct",output:{type:"json",value:response},
    }]});
    return {proposal:proposal.request,response};
  }

  async function localRepository() {
    const archived=JSON.parse(await readFile(new URL("../../../../docs/verification/2026-09-26-m1er1-window/window-closure.json",import.meta.url),"utf8"));
    const files=archived.workspace[0].source_files;
    expect(Object.keys(files)).toHaveLength(5);
    vi.stubEnv("MYEVE_ENGINEERING_GITHUB_TOKEN","local-fixture-only");
    vi.stubGlobal("fetch",vi.fn(async(input,init)=>{
      const url=new URL(String(input));
      if(url.origin!=="https://api.github.com" || (init?.method??"GET")!=="GET")throw Error("Network forbidden");
      const base="/repos/"+config.profile.repository;
      const paths=Object.keys(files);
      let body;
      if(url.pathname===base)body={private:true,full_name:config.profile.repository,permissions:{push:true},archived:false};
      else if(url.pathname===base+"/commits/"+config.approvedBase.sha)body={sha:config.approvedBase.sha,commit:{tree:{sha:"local-tree"}}};
      else if(url.pathname===base+"/git/trees/local-tree")body={truncated:false,tree:paths.map((path,i)=>({path,type:"blob",mode:"100644",sha:"local-"+i,size:files[path].length}))};
      else {const i=paths.findIndex((_,i)=>url.pathname===base+"/git/blobs/local-"+i);if(i<0)throw Error("Unapproved fixture read");body={content:Buffer.from(files[paths[i]]).toString("base64")};}
      return Response.json(body);
    }));
  }

  function controlledProductionProvider(duplicate=false,alwaysDuplicate=false,liveFixture?:any) {
    let duplicateSent=false;
    local.provider.mockImplementation(async options=>{
      captured.push(options);
      const state=payloadState(options);
      if(options.tools?.length===0) {
        expect(state.executionController.phase).toBe("COMPLETE");
        return {content:[{type:"text",text:`Candidate ${state.candidate.sha} passed protected checks. Work is PARTIAL, not Ready. Publication, CI and review remain unqualified. ${state.currentTruth.join(" ")}`}],usage:{inputTokens:{total:1000},outputTokens:{total:100}},finishReason:{unified:"stop"},warnings:[],providerMetadata:{gateway:{cost:"0.003"}}};
      }
      let request:any;
      if(!state.nativeExecution)request=proposeFromPayload(options).request;
      else {
        expect(options.prompt[0].content).toContain("Software Engineer using JStack");
        expect(options.prompt[0].content).toContain("potato mode");
        expect(JSON.stringify(options.tools)).not.toContain('"const":"admit"');
        expect(state.nativeExecution.admissionRequired).toBe(false);
        expect(state.nativeExecution.writerSessionId).toBeTruthy();
        const controller=state.executionController;
        if(alwaysDuplicate || (duplicate&&!duplicateSent)) {
          duplicateSent=true;request=proposeFromPayload(options).request;
        } else {
          switch(controller.nextOperation) {
            case "open": request={operation:"open"};break;
            case "read": request={operation:"read",path:controller.known.requiredReads.find((p:string)=>!controller.known.inspected.some((i:any)=>i.path===p))};break;
            case "plan": request={operation:"plan",expectedRevision:state.revision,plan:liveFixture?JSON.parse(liveFixture.plan):{files:controller.targets,change:"Implement the approved parser, first using the requested negative parseInt fixture.",verification:"Submit for independent protected checks, then repair exact failures once.",assumptions:"Pinned Node ESM fixture",blockers:[]}};break;
            case "inspect": expect(state.failure.checks.some((e:any)=>e.result==="FAIL")).toBe(true);request={operation:"inspect"};break;
            case "write": request={operation:"write",expectedRevision:state.revision,path:controller.targets[0],content:controller.phase==="REPAIR"
              ? 'import fs from "node:fs"; const raw=fs.readFileSync(0,"utf8").trim(); const n=Number(raw); console.log(JSON.stringify(/^\\d+$/.test(raw)&&Number.isSafeInteger(n)&&n>0?{quantity:n}:{error:"invalid_quantity"}));\n'
              : liveFixture?.draft_files["quantity.mjs"] ?? 'import fs from "node:fs"; const n=parseInt(fs.readFileSync(0,"utf8").trim(),10); console.log(JSON.stringify(n>0?{quantity:n}:{error:"invalid_quantity"}));\n'};break;
            case "submit": request={operation:"submit",expectedRevision:state.revision};break;
            default: throw new Error("No deterministic productive operation");
          }
        }
      }
      return {content:[{type:"tool-call",toolName:"engineering_direct",toolCallId:randomUUID(),input:JSON.stringify({request})}],usage:{inputTokens:{total:1000},outputTokens:{total:100}},finishReason:{unified:"tool-calls"},warnings:[],providerMetadata:{gateway:{cost:"0.003"}}};
    });
  }

  it.each(["controlled", "exact-live-failure"])("authenticated production continuation repairs and retains PARTIAL: %s",async variant=>{
    const live=variant==="exact-live-failure"?JSON.parse(await readFile(new URL("../../test/fixtures/repair-context/inputs.json",import.meta.url),"utf8")).state.workspace:undefined;
    await localRepository();controlledProductionProvider(false,false,live);
    const work=await freshWork(),a=await assembled(work.id),seen:string[]=[];
    a.options.prompt.at(-1).content[0].text=await readFile(new URL("../../../../docs/verification/2026-09-27-m1er1-b3bff2b-live/owner-message.txt",import.meta.url),"utf8");
    let admittedProjection: any;
    const authority=new NativeRouteAuthority(store),direct=new DirectDevelopmentStore(store,{profile:config.profile,approvedBase:config.approvedBase,objective:config.objective,criteria:config.criteria,agentId,issueNumber:1,assertCurrentAuthority:id=>authority.assertEffect(id)});
    const driver=new DirectVerificationDriver(direct,new DockerProtectedVerifier());
    for(let step=0;step<9;step++) {
      const {proposal,response}=await nextStep(a,step).catch(error=>{console.error("Local journey failed at step",step,"after",seen);throw error;});seen.push(proposal.operation);
      if(step===0) {
        const p=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
        const receipt=response.receipt;
        admittedProjection=p;
        expect(receipt).toMatchObject({...currentWorkMetadata(p),...p.nativeExecution});
        expect(receipt.currentTruth).toEqual(currentTruthLines(p));
        expect(receipt.admission).toBe("SUCCESS");expect(receipt.nextPhase).toBe("PRODUCTIVE_EXECUTION");
        expect(receipt.runId).toBe(p.runTruth.activeRun?.id);expect(p.runTruth.latestRun?.id).toBe(receipt.runId);
        expect(p.nativeExecution.nextOperation).toBe("open");expect(receipt.writerSessionId).toBe(a.ctx.session.id);
        expect(receipt.nativeExecution).toBeUndefined();
        expect(receipt.completionContractId).toBe(p.nativeExecution.completionContractId);
        expect(receipt.budget.heldUsd).toBe(p.completionBudget.heldUsd);
      }
      if(step===1) {
        expect(proposal.operation).toBe("open");
        const supplied=payloadState(captured.at(-1));
        expect(supplied).toMatchObject(currentWorkMetadata(admittedProjection));
        expect(supplied.nativeExecution).toEqual(admittedProjection.nativeExecution);
        expect(supplied.currentTruth).toEqual(currentTruthLines(admittedProjection));
        expect(supplied.objective).toBe(config.objective);
        expect(supplied.criteria).toEqual(config.criteria);
      }
      if(proposal.operation==="submit") {
        await driver.run(work.id);const retained=await new NativeResultStore(direct).retain(work.id);
        expect(retained.proof.outcome).toBe(step===5?"FAILED":"PARTIAL");
        if(step===5) a.options.prompt.push({role:"user",content:[{type:"text",text:"Continue the existing authorized Work from its persisted Current Truth within the unchanged qualification envelope."}]});
        if(live && step===5) {
          const [saved]=await local.query("SELECT evidence FROM engineering_direct_workspaces WHERE work_id=$1",[work.id]);
          const providerBefore=local.provider.mock.calls.length;
          const [budgetBefore]=await local.query("SELECT calls_admitted,spent_microusd,reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1",[work.id]);
          // Adversarial local fixture only: too many essential failed checks must
          // not consume a call or reservation. Restore the exact verifier output.
          await local.query("UPDATE engineering_direct_workspaces SET evidence=$2 WHERE work_id=$1",[work.id,JSON.stringify(Array.from({length:100},(_,i)=>({...saved.evidence[0],check:"oversize-"+i})))]);
          try { await expect(nextStep(a,6)).rejects.toThrow(/REPAIR_CONTEXT_TOO_LARGE/); }
          finally {await local.query("UPDATE engineering_direct_workspaces SET evidence=$2 WHERE work_id=$1",[work.id,JSON.stringify(saved.evidence)]);}
          expect(local.provider.mock.calls.length).toBe(providerBefore);
          const [budgetAfter]=await local.query("SELECT calls_admitted,spent_microusd,reserved_microusd FROM engineering_work_model_budget WHERE work_id=$1",[work.id]);
          expect(budgetAfter).toEqual(budgetBefore);
        }
      }
    }
    expect(seen).toEqual(["admit","open","read","plan","write","submit","inspect","write","submit"]);
    expect(await counts(work.id)).toEqual({runs:1,writers:1});
    const p=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
    expect(p.verification.status).toBe("PASS");expect(p.candidateHistory.map(c=>c.checks)).toEqual(["FAIL","PASS"]);
    expect(p.readiness.ready).toBe(false);expect(p.nativeResult?.proof.outcome).toBe("PARTIAL");
    const [b]=await local.query("SELECT *,engineering_completion_remaining(scope_id,work_id) held FROM engineering_work_model_budget WHERE work_id=$1",[work.id]);
    expect(b.calls_admitted).toBe(9);expect(Number(b.spent_microusd)+Number(b.reserved_microusd)+Number(b.held)).toBeLessThanOrEqual(1300000);
    expect(Number(b.held)).toBe(112641); // untouched fresh final explanation slot
    const observer=await assembled(work.id,false);
    const explanation=await observer.model.doGenerate(observer.options);
    expect(explanation.content[0].text).toContain(p.verification.candidateSha);
    expect(explanation.content[0].text).toContain("PARTIAL, not Ready");
    const final=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
    expect(final.executionController?.phase).toBe("COMPLETE");
    expect(final.executionController?.metrics).toMatchObject({modelCalls:10,productiveCalls:9,coordinationCalls:1,noProgressCalls:0,verificationAttempts:2,repairAttempts:1,humanInterventions:0});
    expect(final.executionController?.metrics.phaseTransitions).toEqual(["ORIENT","PLAN","IMPLEMENT","VERIFY","REPAIR","VERIFY","COMPLETE"]);
    expect(final.completionStatus).toBe("COMPLETE");expect(final.readiness.ready).toBe(false);
    expect(await counts(work.id)).toEqual({runs:1,writers:1});
    if(process.env.NATIVE_CONTROLLER_EVIDENCE)await writeFile(process.env.NATIVE_CONTROLLER_EVIDENCE+"-"+variant+".json",JSON.stringify({kind:"LOCAL_CONTROLLED_PROVIDER_REAL_AUTHENTICATED_ASSEMBLY",operations:seen,finalProjection:final,providerPayloads:captured.slice(-10)},null,2));
  },120000);

  it("one duplicate admission returns current state without effects and the next model chooses repository open",async()=>{
    await localRepository();controlledProductionProvider(true);
    const work=await freshWork(),a=await assembled(work.id);
    await nextStep(a,0);const before=await counts(work.id);
    const duplicate=await nextStep(a,1);
    expect(duplicate.response.admission).toBe("ALREADY_ADMITTED");expect(duplicate.response.message).toBe("NO NEW ADMISSION REQUIRED");
    expect(duplicate.response.writerSessionId).toBe(a.ctx.session.id);expect(duplicate.response.nextOperation).toBe("open");
    expect(await counts(work.id)).toEqual(before);
    expect((await nextStep(a,2)).proposal.operation).toBe("open");
    const state=payloadState(captured.at(-1));expect(state.executionController.progress.consecutiveNoProgress).toBe(1);
    expect(state.lastToolFeedback.operation).toBe("admit");
    await expect(a.tool.execute({request:{operation:"admit",expectedWorkVersion:work.version-1,expectedWorkGeneration:work.generation}},a.ctx)).rejects.toThrow(/current Work/);
    await expect(a.tool.execute({request:{operation:"admit",expectedWorkVersion:work.version,expectedWorkGeneration:work.generation-1}},a.ctx)).rejects.toThrow(/current Work/);
    const observer=await assembled(work.id,false);
    await expect(observer.tool.execute({request:proposeFromPayload(captured.at(-1)).request},observer.ctx)).rejects.toThrow(/read-only/);
    const stranger=await assembled(work.id);
    await expect(stranger.tool.execute({request:proposeFromPayload(captured.at(-1)).request},stranger.ctx)).rejects.toThrow(/writer session/);
    expect(await counts(work.id)).toEqual({runs:1,writers:1});
  },30000);

  it("provider ignoring duplicate feedback is deterministically stopped after one bounded recovery opportunity",async()=>{
    controlledProductionProvider(false,true);const work=await freshWork(),a=await assembled(work.id);
    await nextStep(a,0);await nextStep(a,1);await nextStep(a,2);await nextStep(a,3);
    const n=local.provider.mock.calls.length;
    await expect(nextStep(a,4)).rejects.toThrow(/NO_PROGRESS/);
    expect(local.provider.mock.calls.length).toBe(n);
    expect(await counts(work.id)).toEqual({runs:1,writers:1});
    await store.change(work.id,{operation:"pause",expectedVersion:work.version});
    await expect(a.tool.execute({request:proposeFromPayload(captured.at(-1)).request},a.ctx)).rejects.toThrow(/current Work|context is unavailable/);
  });

  it("live open/read/open/read regression redirects to PLAN without repeating effects",async()=>{
    await localRepository();controlledProductionProvider();
    const normal=local.provider.getMockImplementation()!;let step=0;
    local.provider.mockImplementation(async options=>{
      const result=await normal(options);const index=step++;
      if(index===3 || index===4)result.content[0].input=JSON.stringify({request:index===3?{operation:"open"}:{operation:"read",path:"README.md"}});
      return result;
    });
    const work=await freshWork(),a=await assembled(work.id);
    for(let i=0;i<3;i++)await nextStep(a,i);
    for(let i=3;i<5;i++)expect((await nextStep(a,i)).response.status).toBe("NO_PROGRESS");
    const p=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
    expect(p.executionController).toMatchObject({phase:"PLAN",nextOperation:"plan",progress:{consecutiveNoProgress:2,recovery:"NO_PROGRESS"}});
    expect((await nextStep(a,5)).proposal.operation).toBe("plan");
    const after=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
    expect(after.executionController).toMatchObject({phase:"BLOCKED",nextOperation:null,progress:{consecutiveNoProgress:0},metrics:{modelCalls:6,productiveCalls:3,noProgressCalls:2}});
    expect(await nativeExecutionCapsule(store,work.id)).toMatchObject({phase:"IMPLEMENT",nextOperation:"write"}); // derived progress advanced; unchanged stage budget now blocks more model calls
    expect(await counts(work.id)).toEqual({runs:1,writers:1});
    // A justified NEW dependency may be read without resetting the established plan.
    a.ctx.callId=randomUUID();
    expect(await a.tool.execute({request:{operation:"read",path:"package.json"}},a.ctx)).toMatchObject({status:"NO_PROGRESS"});
    a.ctx.callId=randomUUID();
    expect(await a.tool.execute({request:{operation:"read",path:"package.json",reason:"Confirm the Node module format before writing the planned source"}},a.ctx)).toHaveProperty("content");
    expect((await nativeExecutionCapsule(store,work.id))?.phase).toBe("IMPLEMENT");
  });

  it("a provider refusing PLAN after bounded open/read recovery stops without another paid call",async()=>{
    await localRepository();controlledProductionProvider();const normal=local.provider.getMockImplementation()!;let step=0;
    local.provider.mockImplementation(async options=>{const result=await normal(options);if(step++>=3){result.content[0].input=JSON.stringify({request:{operation:"read",path:"README.md"}});result.content[0].toolCallId="reused-malicious-id";}return result;});
    const work=await freshWork(),a=await assembled(work.id);
    for(let i=0;i<6;i++)await nextStep(a,i);
    const n=local.provider.mock.calls.length;
    await expect(nextStep(a,6)).rejects.toThrow(/NO_PROGRESS/);
    expect(local.provider.mock.calls.length).toBe(n);
    const p=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
    expect(p.executionController?.progress.recovery).toBe("STOP");expect(p.readiness.ready).toBe(false);
    expect(await counts(work.id)).toEqual({runs:1,writers:1});
  });

  it("blocked intent, duplicate receipts and pause remain bounded and cannot authorize mutation",async()=>{
    await localRepository();controlledProductionProvider();const work=await freshWork(),a=await assembled(work.id);
    await nextStep(a,0);await nextStep(a,1);await nextStep(a,2);
    const p=(await new EngineeringWorkerProjectionStore(store,agentId).get(work.id)).projection;
    expect(p.executionController?.phase).toBe("PLAN");
    const before=p.executionController?.metrics.operations;
    // Replayed tool delivery has the same id; it must not count again.
    await a.tool.execute({request:{operation:"read",path:"README.md"}},a.ctx);
    expect((await nativeExecutionCapsule(store,work.id))?.metrics.operations).toBe(before);
    a.ctx.callId=randomUUID();
    await a.tool.execute({request:{operation:"plan",expectedRevision:1,plan:{files:["quantity.mjs"],change:"Implement parser",verification:"Independent protected tests",assumptions:"None",blockers:["Missing owner requirement"]}}},a.ctx);
    const n=local.provider.mock.calls.length;
    await expect(nextStep(a,3)).rejects.toThrow(/blocked/);expect(local.provider.mock.calls.length).toBe(n);
    expect((await nativeExecutionCapsule(store,work.id))?.phase).toBe("BLOCKED");
    await store.change(work.id,{operation:"pause",expectedVersion:work.version});
    await expect(a.tool.execute({request:{operation:"write",expectedRevision:2,path:"quantity.mjs",content:"wrong"}},a.ctx)).rejects.toThrow();
    expect((await new DirectDevelopmentStore(store,{profile:config.profile,approvedBase:config.approvedBase,objective:config.objective,criteria:config.criteria,agentId,issueNumber:1}).inspect(work.id)).workspace?.draftFiles["quantity.mjs"]).toBeUndefined();
  });

  it("metadata failure is deterministic and cannot initiate a provider call", async () => {
    const work = await freshWork(); const projection = (await new EngineeringWorkerProjectionStore(store, agentId).get(work.id)).projection;
    const calls = captured.length;
    expect(() => currentWorkMetadata({ ...projection, workVersion: undefined } as any)).toThrow();
    expect(() => currentWorkMetadata({ ...projection, workGeneration: undefined } as any)).toThrow();
    expect(captured.length).toBe(calls);
  });
});
