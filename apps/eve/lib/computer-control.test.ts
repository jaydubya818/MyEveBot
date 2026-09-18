import { describe,expect,it } from "vitest";
import { CONTROL_EVENT_TYPES,CONTROL_TRANSITIONS,canTransitionControl,safeStateFingerprint } from "./computer-control.ts";
import type { ComputerController } from "./computer-types.ts";
import { summarizeComputerActionInput } from "./computer-sessions.ts";

class FakeBoundary{
  controller:ComputerController="AGENT";version=1;action=false;active=true;leaseExpires=Infinity;
  agentAction(expected=this.version){if(!this.active||this.controller!=="AGENT"||expected!==this.version||this.action)return false;this.action=true;this.version++;return true;}
  finishAction(){this.action=false;}
  transition(expectedController:ComputerController,expectedVersion:number,next:ComputerController){if(!this.active||this.action||this.controller!==expectedController||this.version!==expectedVersion||!canTransitionControl(this.controller,next))return false;this.controller=next;this.version++;return true;}
  ownerInput(expected=this.version,now=0){return this.active&&this.controller==="OWNER"&&expected===this.version&&now<this.leaseExpires;}
  expire(now:number){if(this.controller!=="OWNER"||now<this.leaseExpires)return false;this.controller="PAUSED";this.version++;return true;}
  terminate(expected=this.version){if(!this.active||this.action||expected!==this.version)return false;this.active=false;this.controller="NONE";this.version++;return true;}
}

describe("Computer control authority",()=>{
  it("defines only the canonical transitions",()=>expect(CONTROL_TRANSITIONS).toEqual({AGENT:["OWNER","PAUSED","NONE"],OWNER:["AGENT","PAUSED","NONE"],PAUSED:["AGENT","OWNER","NONE"],NONE:[]}));
  it("uses normalized, provider-independent audit event names",()=>expect(CONTROL_EVENT_TYPES).toEqual({takeOver:"control.owner_acquired",requestOwnerTakeover:"control.agent_paused",pause:"control.agent_paused",resumeAgent:"control.agent_resumed",returnControl:"control.owner_released",stop:"control.session_stopped"}));
  it("rejects a stale Agent action prepared before Take Over",()=>{const gate=new FakeBoundary();const stale=gate.version;expect(gate.transition("AGENT",1,"OWNER")).toBe(true);expect(gate.agentAction(stale)).toBe(false);});
  it("allows exactly one of two owner tabs to acquire control",()=>{const gate=new FakeBoundary();expect([gate.transition("AGENT",1,"OWNER"),gate.transition("AGENT",1,"OWNER")].filter(Boolean)).toHaveLength(1);});
  it("serializes Agent action against Take Over",()=>{const gate=new FakeBoundary();expect(gate.agentAction()).toBe(true);expect(gate.transition("AGENT",1,"OWNER")).toBe(false);});
  it("serializes Pause against an Agent action",()=>{const gate=new FakeBoundary();expect(gate.transition("AGENT",1,"PAUSED")).toBe(true);expect(gate.agentAction(1)).toBe(false);});
  it("serializes Stop against an Agent action",()=>{const gate=new FakeBoundary();expect(gate.agentAction()).toBe(true);expect(gate.terminate()).toBe(false);gate.finishAction();expect(gate.terminate()).toBe(true);});
  it("expires abandoned owner control to PAUSED, never AGENT",()=>{const gate=new FakeBoundary();expect(gate.transition("AGENT",1,"OWNER")).toBe(true);gate.leaseExpires=10;expect(gate.expire(10)).toBe(true);expect(gate.controller).toBe("PAUSED");expect(gate.ownerInput(2,11)).toBe(false);});
  it("rejects owner input racing after Return Control",()=>{const gate=new FakeBoundary();gate.transition("AGENT",1,"OWNER");const ownerVersion=gate.version;expect(gate.transition("OWNER",ownerVersion,"AGENT")).toBe(true);expect(gate.ownerInput(ownerVersion)).toBe(false);});
  it("rejects Return Control after session termination",()=>{const gate=new FakeBoundary();gate.transition("AGENT",1,"OWNER");const ownerVersion=gate.version;expect(gate.terminate(ownerVersion)).toBe(true);expect(gate.transition("OWNER",ownerVersion,"AGENT")).toBe(false);});
  it("does not persist synthetic sensitive owner input in action summaries",()=>{const marker="SYNTHETIC-SECRET-93847";expect(summarizeComputerActionInput("browser__fill",{selector:"input[type=password]",text:marker})).not.toContain(marker);});
  it("fingerprints only explicit safe observable state",()=>{expect(safeStateFingerprint({currentUrl:"https://example.com/dashboard",browserStatus:"ready",sessionStatus:"ready"})).not.toBe(safeStateFingerprint({currentUrl:"https://example.com/login",browserStatus:"ready",sessionStatus:"ready"}));});
  it("does not invalidate safe state for control-induced lifecycle changes alone",()=>{expect(safeStateFingerprint({currentUrl:"https://example.com/login",browserStatus:"ready",sessionStatus:"ready"})).toBe(safeStateFingerprint({currentUrl:"https://example.com/login",browserStatus:"paused",sessionStatus:"paused"}));});
});
