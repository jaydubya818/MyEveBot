import { describe, expect, it } from "vitest";
import { signExecution, verifyExecution } from "./execution-auth.ts";

const key="fixture-key-that-is-at-least-32-characters";
const identity={ownerId:"sarah",occurrenceId:"occ_test",version:1,workerId:"worker_test"};
describe("routine execution credentials",()=>{
  it("binds owner, occurrence and fenced worker identity",()=>{
    expect(verifyExecution(signExecution(identity,key),key)).toEqual(identity);
    const [,signature]=signExecution(identity,key).split(".");
    const changed=Buffer.from(JSON.stringify({...identity,ownerId:"someone-else"})).toString("base64url");
    expect(()=>verifyExecution(`${changed}.${signature}`,key)).toThrow();
  });
  it("rejects wrong keys, extra segments and invalid versions",()=>{
    const token=signExecution(identity,key);
    expect(()=>verifyExecution(token,"different-key")).toThrow();
    expect(()=>verifyExecution(`${token}.extra`,key)).toThrow();
    expect(()=>verifyExecution(signExecution({...identity,version:0},key),key)).toThrow();
  });
});
