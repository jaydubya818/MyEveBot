import { describe, expect, it } from "vitest";
import { protectedCheckResult } from "./docker-executor.ts";

describe("protected verifier exit custody", () => {
  const name="myeve-golden-verify-11111111-1111-4111-8111-111111111111-positive";
  const observed={code:1,out:"",err:""};
  const ownedExit=(exitCode:number)=>({code:0,out:JSON.stringify({
    Name:`/${name}`,Config:{Labels:{"myeve.golden":"true"}},
    State:{Running:false,ExitCode:exitCode},
  }),err:""});

  it("accepts an expected nonzero candidate exit only after an owned container confirms it", () => {
    expect(protectedCheckResult(name,observed,ownedExit(1),1,"")).toBe("PASS");
    expect(protectedCheckResult(name,observed,ownedExit(1),0,"")).toBe("FAIL");
  });

  it("never treats a Docker CLI failure without a container as candidate success", () => {
    expect(()=>protectedCheckResult(name,observed,
      {code:1,out:"",err:`Error: No such container: ${name}`},1,""))
      .toThrow(/unconfirmed/);
    expect(()=>protectedCheckResult(name,observed,
      {code:1,out:"",err:"Cannot connect to the Docker daemon"},1,""))
      .toThrow(/unavailable/);
  });

  it("rejects unowned, running, and mismatched-exit containers", () => {
    expect(()=>protectedCheckResult(name,observed,{code:0,out:JSON.stringify({
      Name:`/${name}`,Config:{Labels:{}},State:{Running:false,ExitCode:1},
    }),err:""},1,"")).toThrow(/ownership/);
    expect(()=>protectedCheckResult(name,observed,{code:0,out:JSON.stringify({
      Name:`/${name}`,Config:{Labels:{"myeve.golden":"true"}},State:{Running:true,ExitCode:1},
    }),err:""},1,"")).toThrow(/unconfirmed/);
    expect(()=>protectedCheckResult(name,observed,ownedExit(0),1,"")).toThrow(/unconfirmed/);
  });
});
