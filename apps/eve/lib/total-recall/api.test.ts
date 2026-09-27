import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({ principal:vi.fn(),list:vi.fn(),feedback:vi.fn(),command:vi.fn() }));
vi.mock("../engineering/api.ts",()=>({engineeringPrincipal:mocks.principal}));
vi.mock("../engineering/store.ts",()=>({WorkStore:class {}}));
vi.mock("./store.ts",()=>({LearningStore:class {list=mocks.list;feedback=mocks.feedback;command=mocks.command;work={list:async()=>[]};}}));
import { learningRequest } from "./api.ts";
import { randomUUID } from "node:crypto";
import { WorkError } from "../engineering/types.ts";
describe("learning API boundary",()=>{
  beforeEach(()=>{vi.clearAllMocks();delete process.env.MYEVE_TOTAL_RECALL_MODE;delete process.env.VERCEL_ENV;mocks.principal.mockReturnValue({scopeId:"owner",actorId:"owner",scopeKind:"personal"});});
  it("requires authentication even when disabled",async()=>{mocks.principal.mockImplementation(()=>{throw new WorkError("auth","Sign in first",401);});expect((await learningRequest(new Request("https://eve.test/api/learning"))).status).toBe(401);});
  it("stays unavailable without explicit isolated qualification mode",async()=>{expect((await learningRequest(new Request("https://eve.test/api/learning"))).status).toBe(503);expect(mocks.list).not.toHaveBeenCalled();});
  it("cannot enable itself in hosted production",async()=>{process.env.MYEVE_TOTAL_RECALL_MODE="qualification";process.env.VERCEL_ENV="production";expect((await learningRequest(new Request("https://eve.test/api/learning"))).status).toBe(503);});
  it("does not accept client-supplied evaluations or authority fields",async()=>{process.env.MYEVE_TOTAL_RECALL_MODE="qualification";const r=await learningRequest(new Request("https://eve.test/api/learning",{method:"POST",body:JSON.stringify({operation:"decision",evaluation:{result:"PASS"},authority:"all"})}));expect(r.status).toBe(400);expect(mocks.command).not.toHaveBeenCalled();});
  it("requires retained provenance for Result feedback",async()=>{
    process.env.MYEVE_TOTAL_RECALL_MODE="qualification";
    const feedback={eventId:randomUUID(),workId:randomUUID(),workVersion:1,workType:"research",type:"prefer_this",target:"result",targetRef:randomUUID(),note:"Cite original sources",behavior:"cite_sources",scope:"WORK"};
    const response=await learningRequest(new Request("https://eve.test/api/learning",{method:"POST",body:JSON.stringify({operation:"feedback",feedback})}));
    expect(response.status).toBe(400);expect(mocks.feedback).not.toHaveBeenCalled();
  });
  it("does not expose database exception content",async()=>{process.env.MYEVE_TOTAL_RECALL_MODE="qualification";mocks.list.mockRejectedValue(new Error("postgres password=secret"));const r=await learningRequest(new Request("https://eve.test/api/learning"));expect(await r.text()).not.toContain("secret");expect(r.headers.get("cache-control")).toBe("no-store");});
});
