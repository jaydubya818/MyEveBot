import {it,expect,vi} from "vitest";
import {factoryConfig,factoryConfigForWork,selectProjectFactoryProfile,projectFactoryProfilesSchema} from "./factory-routing";
it("rereads Work and server authority instead of retaining a prepared grant",async()=>{
 let revision=1,allowed=true;
 const get=vi.fn(async()=>({id:"work",version:revision}));
 const read=vi.fn(async(work:any)=>({revision:work.version,allowed}));
 const current=()=>factoryConfigForWork({get} as never,"work",read as never);
 expect(await current()).toEqual({revision:1,allowed:true});
 revision=2;allowed=false;
 expect(await current()).toEqual({revision:2,allowed:false});
 expect(get).toHaveBeenCalledTimes(2);expect(read).toHaveBeenCalledTimes(2);
});
it("rejects unbounded, duplicate or live project profile catalogs",()=>{
 expect(projectFactoryProfilesSchema.safeParse({ownerId:"owner",projectId:"project",ceilingMicrousd:1,profiles:[]}).success).toBe(false);
});

import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
const issued=JSON.parse(readFileSync(new URL("../../../../docs/verification/2026-09-26-m1er1-window/window-issued-config.json",import.meta.url),"utf8"));
const id=randomUUID();
const engineering={...issued,ownerId:"owner",agentId:"sofie"};
const connection={origin:"http://127.0.0.1:12345",token:"c".repeat(64),factoryId:"fixture",sourceDigest:"a".repeat(64),configurationDigest:"b".repeat(64),factoryVersion:"f".repeat(64),repositoryPath:"/fixture",keys:[{factoryId:"fixture",keyId:"k",publicKey:"fixture",activeFrom:"2020-01-01",notAfter:"2099-01-01"}],qualification:{scopeId:"owner",profileHash:"d".repeat(64),evidenceRef:"synthetic only",qualifiedAt:"2026-01-01T00:00:00Z",expiresAt:"2099-01-01T00:00:00Z",mode:"LOCAL_FIXTURE",spendEnforced:true}};
const catalog=()=>({ownerId:"owner",projectId:"project",ceilingMicrousd:2_000_000,profiles:[{workId:id,allocationMicrousd:1_000_000,engineering,factory:{connection,commands:["node --test"],routing:{intent:"PRODUCE",boundedOperationQualified:false}}}]});
it("fixes distinct Work allocations under one server envelope and refuses live substitution",()=>{
 expect(projectFactoryProfilesSchema.safeParse(catalog()).success).toBe(true);
 const duplicate=catalog();duplicate.profiles.push(duplicate.profiles[0]);expect(projectFactoryProfilesSchema.safeParse(duplicate).success).toBe(false);
 const excess=catalog();excess.profiles.push({...excess.profiles[0],workId:randomUUID(),allocationMicrousd:2_000_000});expect(projectFactoryProfilesSchema.safeParse(excess).success).toBe(false);
 const live=structuredClone(catalog());live.profiles[0].factory.connection.qualification.mode="LIVE";expect(projectFactoryProfilesSchema.safeParse(live).success).toBe(false);
});
it("rejects foreign owners, changed criteria and Work ceilings above their allocation",()=>{
 const c=projectFactoryProfilesSchema.parse(catalog());const work={id,scopeId:"owner",repository:engineering.profile.repository,objective:engineering.objective,criteria:engineering.criteria,maxCostUsd:1};
 expect(selectProjectFactoryProfile(c,work as never).engineering.ownerId).toBe("owner");
 for(const patch of [{scopeId:"other"},{maxCostUsd:1.000001},{criteria:[]},{id:randomUUID()},{objective:"Substituted task"}])expect(()=>selectProjectFactoryProfile(c,{...work,...patch} as never)).toThrow(/allocation/);
});
it("does not load project fixture profiles in production",async()=>{
 vi.stubEnv("MYEVE_FACTORY_WORK_PROFILES","/tmp/nonexistent-project-profile.json");vi.stubEnv("VERCEL_ENV","production");
 try{await expect(factoryConfig({id} as never)).rejects.toThrow(/deferred/);}finally{vi.unstubAllEnvs();}
});
