import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const resolve=vi.hoisted(()=>vi.fn());
vi.mock("./action-recovery",()=>({ActionRecovery:class{resolveByOwner=resolve;}}));
import {POST} from "../app/api/actions/[id]/resolve/route";
import {createWebSessionToken} from "./web-auth";
beforeEach(()=>{resolve.mockReset();vi.stubEnv("NODE_ENV","production");vi.stubEnv("MYEVE_ACCESS_PASSWORD","local-test-password-only");vi.stubEnv("MYEVE_SESSION_SECRET","test-only-secret-long-enough-for-owner-auth");vi.stubEnv("MYEVE_OWNER_ID","owner-a");vi.stubEnv("DATABASE_URL","postgres://fixture.invalid/local");});
afterEach(()=>vi.unstubAllEnvs());
const params={params:Promise.resolve({id:"action_fixture"})};
const body={decision:"not_occurred",expectedUpdatedAt:"2026-09-19 10:00:00.123456+00",ownerId:"victim"};
function request(auth=true,origin="https://app.test",payload:unknown=body){return new Request("https://app.test/api/actions/action_fixture/resolve",{method:"POST",headers:{...(auth?{cookie:`myeve_session=${createWebSessionToken()}`}:{ }),origin,"content-type":"application/json"},body:JSON.stringify(payload)});}
describe("owner recovery decisions",()=>{
  it("requires signed owner authentication and same origin",async()=>{expect((await POST(request(false),params)).status).toBe(401);expect((await POST(request(true,"https://attacker.test"),params)).status).toBe(403);expect(resolve).not.toHaveBeenCalled();});
  it("rejects invalid decision and missing stale-state token",async()=>{expect((await POST(request(true,undefined,{decision:"resend"}),params)).status).toBe(400);expect(resolve).not.toHaveBeenCalled();});
  it("uses authenticated owner and preserves microsecond concurrency token",async()=>{resolve.mockResolvedValue("retryable");expect((await POST(request(),params)).status).toBe(200);expect(resolve).toHaveBeenCalledWith("owner-a","action_fixture","not_occurred",body.expectedUpdatedAt);});
  it("rejects stale/already decided action",async()=>{resolve.mockResolvedValue(null);expect((await POST(request(),params)).status).toBe(409);});
});
