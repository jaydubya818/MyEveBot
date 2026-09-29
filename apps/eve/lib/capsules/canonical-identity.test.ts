import {describe,it,expect} from "vitest";
import {scanStructure} from "./security";
describe("Canonical Capsule identity compatibility",()=>{
 it("accepts namespaced Agent UUID references without allowing opaque text",()=>{
 const id="agent-54754bee-e40a-4689-91d2-056c9a01e79b";
 expect(()=>scanStructure({source:{eveRef:id},scope:{id}})).not.toThrow();
 expect(()=>scanStructure({text:id})).toThrow(/opaque/i);
 expect(()=>scanStructure({source:{eveRef:"sk-proj-abcdefghijklmnop0123456789abcdefghijk"}})).toThrow();
 });
});
