import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
const inspect=vi.hoisted(()=>vi.fn());
vi.mock("./action-recovery",()=>({ActionRecovery:class{recover=inspect;},recoveryStrategy:vi.fn()}));
import {POST} from "../app/api/actions/[id]/recover/route";
import {createWebSessionToken} from "./web-auth";
beforeEach(()=>{inspect.mockReset();vi.stubEnv("NODE_ENV","production");vi.stubEnv("MYEVE_ACCESS_PASSWORD","local-test-password-only");vi.stubEnv("MYEVE_SESSION_SECRET","test-only-secret-long-enough-for-owner-auth");vi.stubEnv("MYEVE_OWNER_ID","owner-a");vi.stubEnv("DATABASE_URL","postgres://fixture.invalid/local");});
afterEach(()=>vi.unstubAllEnvs());
const params={params:Promise.resolve({id:"action_fixture"})};
describe("owner recovery endpoint",()=>{
  it("denies anonymous requests before inspection",async()=>{expect((await POST(new Request("https://app.test/api/actions/action_fixture/recover",{method:"POST"}),params)).status).toBe(401);expect(inspect).not.toHaveBeenCalled();});
  it("rejects cross-origin recovery even with an owner cookie",async()=>{expect((await POST(new Request("https://app.test/api/actions/action_fixture/recover",{method:"POST",headers:{cookie:`myeve_session=${createWebSessionToken()}`,origin:"https://attacker.test"}}),params)).status).toBe(403);expect(inspect).not.toHaveBeenCalled();});
  it("derives owner from signed session, not request body",async()=>{inspect.mockResolvedValue("needs_you");const response=await POST(new Request("https://app.test/api/actions/action_fixture/recover",{method:"POST",headers:{cookie:`myeve_session=${createWebSessionToken()}`,"content-type":"application/json"},body:JSON.stringify({ownerId:"victim"})}),params);expect(response.status).toBe(200);expect(inspect.mock.calls[0]?.slice(0,2)).toEqual(["owner-a","action_fixture"]);expect(await response.json()).toEqual({status:"needs_you",anotherExecutionOccurred:false});});
});
