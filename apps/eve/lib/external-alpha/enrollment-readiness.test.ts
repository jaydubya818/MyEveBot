import { beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks=vi.hoisted(()=>({auth:vi.fn(),principal:vi.fn(),policy:vi.fn(),report:vi.fn()}));
vi.mock("../web-auth",()=>({requireWebAuth:mocks.auth,authenticateWebPrincipal:mocks.principal}));
vi.mock("../readiness",()=>({getReadinessReport:mocks.report}));
vi.mock("./policy",()=>({externalAlphaPolicy:mocks.policy}));
import { GET } from "../../app/api/readiness/route.ts";
const policy={ownerId:"owner-1",projectId:"prj_one",cohortId:"cohort-one",slot:"1"};
const request=()=>new Request("https://tester.example/api/readiness?alphaEnrollment=1");
beforeEach(()=>{
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(null);
  mocks.principal.mockResolvedValue({id:"owner-1"});
  mocks.policy.mockReturnValue(policy);
  mocks.report.mockResolvedValue({ok:true});
  vi.stubEnv("MYEVE_EXTERNAL_ALPHA_ACCOUNTING_TOKEN","a".repeat(64));
});
it("requires web authentication before touching policy or token facts",async()=>{
  mocks.auth.mockResolvedValue(new Response("authentication_required",{status:401}));
  expect((await GET(request())).status).toBe(401);
  expect(mocks.policy).not.toHaveBeenCalled();
});
it.each([null,{id:"owner-2"}])("denies absent, partner or foreign principals",async(principal)=>{
  mocks.principal.mockResolvedValue(principal);
  const response=await GET(request());
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({error:"owner_required"});
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("returns only non-executable binding facts and never raw secret/policy/connection data",async()=>{
  const response=await GET(request()),body=await response.json();
  expect(Object.keys(body).sort()).toEqual(["ownerId","projectId","cohortId","slot","policySha256","credentialSha256"].sort());
  expect(body.credentialSha256).toBe(createHash("sha256").update("a".repeat(64)).digest("hex"));
  expect(JSON.stringify(body)).not.toContain("a".repeat(64));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(mocks.report).not.toHaveBeenCalled();
});
it("refuses preview/project/policy binding errors without echoing details",async()=>{
  mocks.policy.mockImplementation(()=>{throw Error("private connection or environment detail");});
  const response=await GET(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:"alpha_enrollment_unavailable"});
});
it.each(["","invalid","B".repeat(64)])("rejects malformed accounting credentials",async(token)=>{
  vi.stubEnv("MYEVE_EXTERNAL_ALPHA_ACCOUNTING_TOKEN",token);
  expect((await GET(request())).status).toBe(503);
});
it("keeps fingerprints out of ordinary/cached readiness reports",async()=>{
  const response=await GET(new Request("https://tester.example/api/readiness"));
  expect(await response.json()).toEqual({ok:true});
  expect(mocks.policy).not.toHaveBeenCalled();
  expect(mocks.principal).not.toHaveBeenCalled();
});
