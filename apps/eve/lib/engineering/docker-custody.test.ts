import { describe,expect,it } from "vitest";
import { fixture } from "../../test/engineering-fixtures.ts";
import { cleanupResourceState,containerCustodyState,volumeCustodyState } from "./docker-executor.ts";

describe("Docker custody inspection",()=>{
  const run=fixture().run;
  const container=(value:unknown)=>({code:0,out:JSON.stringify(value),err:""});
  const volume=(value:unknown)=>({code:0,out:JSON.stringify(value),err:""});

  it("requires the exact owned resource labels before trusting a stopped container and volume",()=>{
    expect(containerCustodyState(run,container({Name:`/${run.resource}`,Config:{Labels:{"myeve.golden":"true"}},State:{Running:false}}))).toBe("stopped");
    expect(volumeCustodyState(run,volume({Name:run.resource,Labels:{"myeve.golden":"true"}}))).toBe("present");
    expect(()=>containerCustodyState(run,container({Name:`/${run.resource}`,Config:{Labels:{}},State:{Running:false}}))).toThrow(/ownership/);
    expect(()=>volumeCustodyState(run,volume({Name:run.resource,Labels:{}}))).toThrow(/ownership/);
  });

  it("distinguishes explicitly absent resources from a Docker outage",()=>{
    expect(containerCustodyState(run,{code:1,out:"",err:`Error: No such object: ${run.resource}`})).toBe("absent");
    expect(volumeCustodyState(run,{code:1,out:"",err:`Error: No such volume: ${run.resource}`})).toBe("absent");
    expect(()=>containerCustodyState(run,{code:1,out:"",err:"Cannot connect to the Docker daemon"})).toThrow(/unavailable/);
    expect(()=>volumeCustodyState(run,{code:1,out:"",err:"Cannot connect to the Docker daemon"})).toThrow(/unavailable/);
    expect(()=>containerCustodyState(run,{code:1,out:"",err:`Error: No such object: ${run.resource}-other`})).toThrow(/unavailable/);
  });

  it("rejects a mismatched Run-to-resource identity",()=>{
    expect(()=>containerCustodyState({...run,resource:"other-resource"},container({}))).toThrow(/Unowned resource/);
  });

  it("only confirms cleanup from an exact missing-resource response",()=>{
    for(const [kind,name,error] of [
      ["container",run.resource,`Error: No such container: ${run.resource}`],
      ["container",`${run.resource}-model`,`Error: No such object: ${run.resource}-model`],
      ["network",run.resource,`Error response from daemon: network ${run.resource} not found`],
      ["volume",run.resource,`Error: No such volume: ${run.resource}`],
    ] as const) {
      expect(cleanupResourceState(run,kind,name,{code:1,out:"",err:error})).toBe("absent");
      expect(()=>cleanupResourceState(run,kind,name,{code:1,out:"",err:"Cannot connect to the Docker daemon"})).toThrow(/unavailable/);
      expect(()=>cleanupResourceState(run,kind,name,{code:1,out:"",err:error.replace(name,"different-resource")})).toThrow(/unavailable/);
      expect(()=>cleanupResourceState(run,kind,name,{code:1,out:"",err:error.replace(name,`${name}-other`)})).toThrow(/unavailable/);
    }
  });

  it("requires an owned exact resource before removal",()=>{
    const owned={"myeve.golden":"true"};
    expect(cleanupResourceState(run,"container",run.resource,container({Name:`/${run.resource}`,Config:{Labels:owned}}))).toBe("present");
    expect(cleanupResourceState(run,"container",`${run.resource}-model`,container({Name:`/${run.resource}-model`,Config:{Labels:owned}}))).toBe("present");
    expect(cleanupResourceState(run,"network",run.resource,container({Name:run.resource,Labels:owned}))).toBe("present");
    expect(cleanupResourceState(run,"volume",run.resource,volume({Name:run.resource,Labels:owned}))).toBe("present");
    expect(()=>cleanupResourceState(run,"volume",run.resource,volume({Name:run.resource,Labels:{}}))).toThrow(/ownership/);
    expect(()=>cleanupResourceState(run,"container",run.resource,container({Name:"/other",Config:{Labels:owned}}))).toThrow(/ownership/);
    expect(()=>cleanupResourceState(run,"network","other",container({Name:"other",Labels:owned}))).toThrow(/Unowned resource/);
  });
});
