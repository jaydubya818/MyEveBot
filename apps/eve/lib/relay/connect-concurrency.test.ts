import {afterEach,beforeEach,it,expect,vi} from "vitest";
import {generateKeyPairSync} from "node:crypto";
import {connectOwner} from "./owner.ts";
const m=vi.hoisted(()=>({created:0,primary:""}));
vi.mock("../agents.ts",()=>({getAgent:async()=>({id:"local-sofie",status:"active",name:"Sofie",isPrimary:true})}));
vi.mock("../knowledge.ts",()=>({getKnowledge:vi.fn()}));
vi.mock("../external-alpha/relay-link.ts",()=>({assertExternalAlphaRotationConfirmed:(existing:unknown)=>{if(existing)throw Error("No existing credential rotation approved");}}));
vi.mock("./transport.ts",async original=>({...await original<object>(),encryptSecret:(_:unknown,value:unknown)=>value}));
vi.mock("./client.ts",()=>({relayOrigin:()=>"https://relay.fixture.invalid",RelayOperationError:class extends Error{},connectRelayOwner:async()=>({relayOwnerId:"relay-owner",ownerSession:"synthetic-owner-session"}),RelayClient:class{
 async request(path:string){if(path==="/api/agents"){const id="native-"+(++m.created);await new Promise(r=>setTimeout(r,2));return {agentId:id,credential:"synthetic-credential-"+id};}throw Error("Unexpected remote request");}
 async owner(input:any){if(input.operation==="register"){if(input.input.primary)m.primary=input.input.agentId;return {ownerId:"relay-owner",agentId:input.input.agentId,address:"relay://relay-owner/"+input.input.agentId};}return {};}
}}));
beforeEach(()=>{m.created=0;m.primary="";vi.stubEnv("MYEVE_RELAY_KEY_ID","fixture");vi.stubEnv("MYEVE_RELAY_PUBLIC_KEY",generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}) as string);});
it.each([2,16])("QE-007 %i concurrent first links retain one native Agent and credential",async count=>{
 let row:any;let tail=Promise.resolve();
 const store:any={ownerId:"fixture-owner",activity:async()=>{},withOwnerConnectLock:async(fn:any)=>{const previous=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);await previous;try{return await fn();}finally{release();}},database:{query:async(sql:string,p:any[])=>{
  if(sql.startsWith("SELECT relay_agent_id")){const snapshot=row?{...row}:null;await Promise.resolve();return snapshot?[snapshot]:[];}
  if(sql.startsWith("INSERT INTO myeve_relay_connections")){if(!row)row={local_agent_id:p[1],relay_owner_id:p[2],relay_agent_id:p[3]};return row.relay_agent_id===p[3]?[{relay_agent_id:p[3]}]:[];}
  throw Error("Unexpected SQL");
 }}};
 const outcomes=await Promise.allSettled(Array.from({length:count},()=>connectOwner(store,{email:"synthetic@example.invalid",password:"synthetic-password",localAgentId:"local-sofie"})));
 expect(m.created).toBe(1);expect(outcomes.filter(o=>o.status==="fulfilled")).toHaveLength(1);expect(m.primary).toBe(row.relay_agent_id);
});

afterEach(()=>vi.unstubAllEnvs());
it.skipIf(!process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE)("QE-007 server instances share the owner PostgreSQL lock",async()=>{
 const {Env}=await import("../external-alpha/work-test-fixture.ts");
 const {FederationStore}=await import("./store.ts");
 const e=await Env.create(false);
 const url=new URL(process.env.MYEVE_EXTERNAL_ALPHA_TEST_DATABASE!);url.pathname="/"+e.name;
 vi.stubEnv("DATABASE_URL",url.href);
 let active=0,maximum=0,completed=0;
 try {
  await Promise.all(Array.from({length:16},()=>new FederationStore(e.owner,e.db).withOwnerConnectLock(async()=>{
   maximum=Math.max(maximum,++active);await new Promise(resolve=>setTimeout(resolve,10));active--;completed++;
  })));
  expect(maximum).toBe(1);expect(completed).toBe(16);
 }finally{await e.close();}
},60000);
