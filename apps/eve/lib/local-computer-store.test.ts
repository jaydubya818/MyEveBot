import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("../agent/lib/receipts-db.ts",()=>({db:()=>({query:state.query})}));
import {localPairing,localWorkerAuthenticated,enqueueLocalOperation} from "./local-computer-store.ts";
import {POST} from "../app/api/local-computer/worker/route.ts";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("MYEVE_OWNER_ID","owner");vi.stubEnv("SOFIE_LOCAL_DEVICE_ID","mac-test");vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN","a".repeat(64));});
afterEach(()=>vi.unstubAllEnvs());
describe("local companion pairing boundary",()=>{
  it("denies unpaired and malformed pairing configuration",()=>{
    vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN","short");expect(localPairing()).toBeNull();
    vi.stubEnv("SOFIE_LOCAL_DEVICE_TOKEN","a".repeat(64));vi.stubEnv("SOFIE_LOCAL_DEVICE_ID","../../bad");expect(localPairing()).toBeNull();
  });
  it("requires the exact token and refuses browser-origin requests",()=>{
    const request=(headers:Record<string,string>)=>new Request("https://example.com/api/local-computer/worker",{headers});
    expect(localWorkerAuthenticated(request({}))).toBe(false);
    expect(localWorkerAuthenticated(request({authorization:"Bearer wrong"}))).toBe(false);
    expect(localWorkerAuthenticated(request({authorization:`Bearer ${"a".repeat(64)}`}))).toBe(true);
    expect(localWorkerAuthenticated(request({authorization:`Bearer ${"a".repeat(64)}`,origin:"https://evil.example"}))).toBe(false);
  });
  it("rejects unauthenticated polls before reading the database",async()=>{
    expect((await POST(new Request("https://example.com/api/local-computer/worker",{method:"POST",body:'{"operation":"poll"}'}))).status).toBe(401);
    expect(state.query).not.toHaveBeenCalled();
  });
  it("cannot enqueue with a forged authority handle",async()=>{
    const pairing=localPairing()!;
    await expect(enqueueLocalOperation({operation:"shell",command:"pwd"},"session",{target:{account:pairing.ownerId,resource:pairing.deviceId,environment:pairing.hash,provider:"local-mac"},capabilityId:"tool.local_computer_task",expiresAt:Date.now()+10000} as any)).rejects.toThrow();
    expect(state.query).not.toHaveBeenCalled();
  });
});
