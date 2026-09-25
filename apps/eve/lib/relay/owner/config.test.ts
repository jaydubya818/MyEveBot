import {describe,it,expect} from "vitest";
import {ownerChannelConfiguration,OWNER_CHANNEL_RELEASE_QUALIFIED} from "./config.ts";
const trust={environment:"development",audience:"myeve-local-qualification",keys:{fixture:"public-key-fixture"},mappings:[{enabled:true,ownerId:"qualification-owner",agentId:"qualification-agent",relayAccountId:"qualification-relay",relayOwnerPrincipalId:"qualification-principal",relayAgentId:"qualification-relay-agent",sourceIdentity:"qualification-source",allowedCapabilities:["web.read"]}]};
const environment=()=>({NODE_ENV:"test" as const,HOSTNAME:"127.0.0.1",MYEVE_OWNER_LOCAL_ORIGIN:"http://127.0.0.1:3228",DATABASE_URL:"postgresql://qualification:local@qualification.invalid/owner_qualification",MYEVE_OWNER_LOCAL_QUALIFICATION_UNTIL:String(Date.now()+600000),MYEVE_RELAY_OWNER_TRUST:JSON.stringify(trust)});
describe("isolated owner qualification",()=>{
 it("keeps release execution disabled",()=>{expect(OWNER_CHANNEL_RELEASE_QUALIFIED).toBe(false);expect(ownerChannelConfiguration({NODE_ENV:"test",MYEVE_RELAY_OWNER_ENABLED:"true"}).enabled).toBe(false);});
 it("admits only the explicit isolated fixture",()=>expect(ownerChannelConfiguration(environment()).enabled).toBe(true));
 it.each([{VERCEL:"1"},{VERCEL_URL:"preview.vercel.app"},{HOSTNAME:"0.0.0.0"},{MYEVE_OWNER_LOCAL_ORIGIN:"https://preview.vercel.app"},{DATABASE_URL:"postgresql://owner@production.invalid/db"},{MYEVE_OWNER_LOCAL_QUALIFICATION_UNTIL:"0"},{MYEVE_OWNER_LOCAL_QUALIFICATION_UNTIL:String(Date.now()+7200000)}])("denies non-fixture environment %j",override=>expect(ownerChannelConfiguration({...environment(),...override}).enabled).toBe(false));
 it.each([{ownerId:"real-owner"},{allowedCapabilities:["web.read","tool.send_email"]},{sourceIdentity:"another-source"}])("denies expanded mapping %j",override=>expect(ownerChannelConfiguration({...environment(),MYEVE_RELAY_OWNER_TRUST:JSON.stringify({...trust,mappings:[{...trust.mappings[0],...override}]})}).enabled).toBe(false));
 const binding="tgb_0123456789abcdef0123456789abcdef";
 const liveIds={relayAccountId:"acct_qualificationrelay",relayOwnerPrincipalId:"prn_qualificationowner",relayAgentId:"agt_qualificationsofie"};
 const live=(mapping:Record<string,unknown>,pin:string|null=binding,extra:Record<string,string>={})=>ownerChannelConfiguration({...environment(),...extra,...(pin===null?{}:{MYEVE_OWNER_LOCAL_SOURCE_IDENTITY:pin}),MYEVE_RELAY_OWNER_TRUST:JSON.stringify({...trust,mappings:[{...trust.mappings[0],...liveIds,sourceIdentity:binding,...mapping}]})}).enabled;
 it("admits the live Relay identity set only with the exactly pinned binding source",()=>expect(live({})).toBe(true));
 it.each([
  ["no pin",{},null],["other pin",{},"tgb_ffffffffffffffffffffffffffffffff"],["malformed short",{sourceIdentity:"tgb_short"},"tgb_short"],
  ["uppercase",{sourceIdentity:"tgb_0123456789ABCDEF0123456789ABCDEF"},"tgb_0123456789ABCDEF0123456789ABCDEF"],
  ["wrong prefix",{sourceIdentity:"acct_0123456789abcdef0123456789abcdef"},"acct_0123456789abcdef0123456789abcdef"],
  ["live ids with harness source",{sourceIdentity:"qualification-source"},binding],
  ["harness ids with live source",{relayAccountId:"qualification-relay",relayOwnerPrincipalId:"qualification-principal",relayAgentId:"qualification-relay-agent"},binding],
  ["mixed account",{relayAccountId:"qualification-relay"},binding],["other Relay agent",{relayAgentId:"agt_sofieproduction"},binding],
  ["expanded capabilities",{allowedCapabilities:["web.read","tool.send_email"]},binding],["real MyEve owner",{ownerId:"real-owner"},binding],
 ] as const)("denies %s",(_name,mapping,pin)=>expect(live(mapping,pin)).toBe(false));
 it("still denies the live set in a hosted runtime",()=>expect(live({},binding,{VERCEL:"1"})).toBe(false));
});
