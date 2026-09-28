import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({principal:vi.fn(),admit:vi.fn(),assess:vi.fn()}));
vi.mock("../web-auth.ts",()=>({webPrincipal:mocks.principal}));
vi.mock("./store.ts",()=>({WorkStore:class{}}));
vi.mock("./native-routing.ts",()=>({admitNativeWork:mocks.admit,NativeRouteAuthority:class{assess=mocks.assess}}));
import {handleNativeAdmission} from "./native-api.ts";
const id="be5c9b6d-731b-4567-85f5-d3aa0d340a27";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("MYEVE_ENGINEERING_MODE","dogfood");mocks.principal.mockReturnValue({id:"owner"});mocks.admit.mockResolvedValue({status:"QUEUED"});});afterEach(()=>vi.unstubAllEnvs());
const request=(body:unknown,origin="https://local.example")=>new Request("https://local.example/api/engineering/work/"+id+"/native",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
describe("native admission owner boundary",()=>{
  it("requires authenticated same-origin owner input",async()=>{
    expect((await handleNativeAdmission(request({expectedWorkVersion:2,expectedWorkGeneration:3},"https://foreign.example"),id)).status).toBe(403);mocks.principal.mockReturnValue(null);expect((await handleNativeAdmission(request({expectedWorkVersion:2,expectedWorkGeneration:3}),id)).status).toBe(401);expect(mocks.admit).not.toHaveBeenCalled();
  });
  it("rejects caller-supplied qualification",async()=>{
    expect((await handleNativeAdmission(request({expectedWorkVersion:2,expectedWorkGeneration:3,qualification:{status:"QUALIFIED"}}),id)).status).toBe(400);expect(mocks.admit).not.toHaveBeenCalled();
  });
  it("passes only scoped Work and expected revision",async()=>{
    expect((await handleNativeAdmission(request({expectedWorkVersion:2,expectedWorkGeneration:3}),id)).status).toBe(200);expect(mocks.admit).toHaveBeenCalledWith(expect.anything(),id,2,3);
  });
});
