import { describe,expect,it } from "vitest";
import { ownerApprovalPresentation } from "./snapshot.ts";
describe("owner approval presentation",()=>{
 it("shows canonical recipients and subject without draft body or provider payload",()=>{
  const shown=ownerApprovalPresentation("tool.send_email",{subject:"Project update",text:"private draft body",token:"not-for-display"},{provider:"agentmail",account:"private-account",resource:JSON.stringify([["to",["owner@example.test"]],["cc",[]],["bcc",[]]])});
  expect(shown.target).toBe("TO: owner@example.test");expect(shown.summary).toContain("Subject: Project update");
  expect(JSON.stringify(shown)).not.toMatch(/private draft|not-for-display|private-account/);
 });
 it("denies missing or malformed canonical recipients",()=>{
  expect(()=>ownerApprovalPresentation("tool.send_email",{subject:"Draft"},{resource:"not-json"})).toThrow();
  expect(()=>ownerApprovalPresentation("tool.send_email",{subject:"Draft"},{resource:"[]"})).toThrow();
 });
});
