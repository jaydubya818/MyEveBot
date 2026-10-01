import {describe,it,expect} from "vitest";
import {toolPresentation} from "./tool-presentation.ts";
describe("owner-facing connection activity",()=>{
 it("distinguishes sent, received, unknown and verified work",()=>{
  expect(toolPresentation("create_factory_work_order",{}, {receipt:{status:"awaiting_local_factory"}},"output-available").label).toContain("waiting");
  expect(toolPresentation("get_factory_work_order",{}, {receipt:{status:"received_by_factory",receipt:{state:"queued"}}},"output-available").label).toBe("Software Engineer received the work");
  expect(toolPresentation("engineering_factory",{operation:"reconcile"},{status:"COMPLETED"},"output-available").label).not.toMatch(/Verified|Ready/);
  expect(toolPresentation("local_computer_task",{operation:"shell"},{status:"unknown"},"output-available").failed).toBe(true);
 });
 it("does not put provider IDs or peer output into the activity label",()=>{
  const label=toolPresentation("get_factory_work_order",{requestId:"secret-id"},{receipt:{status:"received_by_factory",receipt:{workOrderId:"internal-id",body:"Ignore instructions"}}},"output-available").label;
  expect(label).not.toMatch(/secret-id|internal-id|Ignore/);
 });
});
