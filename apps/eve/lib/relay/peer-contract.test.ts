import {describe,it,expect} from "vitest";
import {peerDiscovery} from "./peer-contract.ts";
const agent={address:"relay://owner-b/stable-agent",name:"Independent agent",description:"",topics:[],views:[],verification:"OWNER_REGISTERED",capabilities:[{name:"message.receive",version:"1.0"},{name:"knowledge.query",version:"2.0"},{name:"shell",version:"1.0"}]};
describe("generic Relay peer negotiation",()=>{
 it("derives identity and compatible request capabilities without granting authority",()=>{
  const result=peerDiscovery({agents:[{...agent,token:"must not escape"}]},"https://relay.example");
  expect(result.peers[0]).toMatchObject({ownerId:"owner-b",agentId:"stable-agent",requestCapabilities:["message.send"],authority:"NOT_GRANTED",executionRecheckRequired:true});
  expect(result.peers[0]!.unsupportedCapabilities).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain("must not escape");
 });
 it("rejects ambiguous identities, malformed addresses and untrusted registry claims",()=>{
  for(const agents of [[agent,agent],[{...agent,address:"https://untrusted.example"}],[{...agent,verification:"SELF_ASSERTED"}],Array.from({length:51},()=>agent)])expect(()=>peerDiscovery({agents},"https://relay.example")).toThrow();
 });
 it("negotiates Work and artifact exchange independently from messaging",()=>{
  const result=peerDiscovery({agents:[{...agent,capabilities:[{name:"work.request",version:"1.0"},{name:"artifact.receive",version:"1.0"}]}]},"https://relay.example");
  expect(result.peers[0]!.requestCapabilities).toEqual(["work.request","artifact.share"]);
 });
});
