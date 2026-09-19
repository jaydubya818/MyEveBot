import {describe,expect,it} from "vitest";
import {evaluateRoutineReachability,ROUTINE_RELEASE} from "./routine-release.ts";
import {taskOwnerFromAuth} from "./task-runs.ts";
describe("routine release",()=>{
  it("never enables from environment or complete coverage alone",()=>{expect(ROUTINE_RELEASE.enabled).toBe(false);expect(ROUTINE_RELEASE.recommendation).toBe("MUST_REMAIN_DISABLED");});
  it("accepts only explicitly classified reachable leaves",()=>{
    expect(evaluateRoutineReachability({tools:["read","send"],classifications:{read:"READ_ONLY",send:"BLOCKED"},delegation:false,opaqueConnections:false}).qualified).toBe(true);
    expect(evaluateRoutineReachability({tools:["unknown"],classifications:{},delegation:false,opaqueConnections:false}).qualified).toBe(false);
  });
  it("rejects hidden delegation and opaque connection edges",()=>{expect(evaluateRoutineReachability({tools:[],classifications:{},delegation:true,opaqueConnections:true}).blocked).toEqual(["unqualified_delegation","opaque_connections"]);});
  it("never invents an owner for an unauthenticated internal write",()=>{expect(()=>taskOwnerFromAuth({current:null})).toThrow();expect(taskOwnerFromAuth({current:{principalId:"owner-a"}})).toBe("owner-a");});
});
