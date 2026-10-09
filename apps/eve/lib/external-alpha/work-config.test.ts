import { describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync } from "node:crypto";
import { externalAlphaWorkConfig, externalAlphaWorkConfigSchema } from "./work-config.ts";
import { HttpExternalAlphaFactoryClient } from "./work-controller.ts";
import { fixtureResultKeys, fixtureConfigurationDigest, fixtureSourceDigest, fixtureVerifierPolicySha256 } from "./result-test-fixture.ts";
const receipt=generateKeyPairSync("ed25519"),origin="https://fixture-alpha-factory.vercel.app";
const config=(destination=origin)=>externalAlphaWorkConfigSchema.parse({allowedFiles:["src/app.ts"],checkCommands:["npm test"],factory:{origin:destination,trustedTeamId:"team_Fixture",receiptKeys:[{keyId:createHash("sha256").update(receipt.publicKey.export({type:"spki",format:"der"})).digest("hex"),publicKey:receipt.publicKey.export({type:"spki",format:"pem"})}],resultVerification:{factoryId:"myfactory-external-alpha",sourceDigest:fixtureSourceDigest,configurationDigest:fixtureConfigurationDigest,verifierPolicySha256:fixtureVerifierPolicySha256,resultKeys:[fixtureResultKeys().key]}}});
const env=(cfg=config(),pin=cfg.factory.origin)=>({NODE_ENV:"test",MYEVE_EXTERNAL_ALPHA_WORK_CONFIG:JSON.stringify(cfg),MYEVE_EXTERNAL_ALPHA_FACTORY_ORIGIN:pin,VERCEL:"1",VERCEL_ENV:"production",VERCEL_PROJECT_ID:"prj_fixture"} as NodeJS.ProcessEnv);
const rejected=["https://myfactory-cloud-production.vercel.app","https://myfactory-cloud-production-build-fixture.vercel.app","https://myfactory-cloud-staging.vercel.app","https://myfactory-cloud-staging-build-fixture.vercel.app","https://foreign.example.invalid","https://fixture-alpha-factory.vercel.app.evil.invalid","http://fixture-alpha-factory.vercel.app","https://fixture-alpha-factory.vercel.app/","https://fixture-alpha-factory.vercel.app/path","https://fixture-alpha-factory.vercel.app?x=1","https://fixture-alpha-factory.vercel.app#x","https://fixture-alpha-factory.vercel.app:443","https://user:pass@fixture-alpha-factory.vercel.app"];
describe("dedicated external-alpha Factory destination",()=>{
  it("accepts only the independently pinned exact dedicated host and its explicitly pinned owned alias",()=>{
    for(const destination of [origin,"https://fixture-alpha-factory-build-fixture.vercel.app"]){const cfg=config(destination);expect(externalAlphaWorkConfig(env(cfg))?.factory.origin).toBe(destination);}
    const cfg=config();expect(externalAlphaWorkConfig(env(cfg,"https://other-alpha-factory.vercel.app"))).toBeNull();
    expect(externalAlphaWorkConfig(env(cfg,""))).toBeNull();
  });
  it.each(rejected)("denies historical canary/staging or unsafe destination even when pinned: %s",destination=>{
    const cfg=config(destination);expect(externalAlphaWorkConfig(env(cfg))).toBeNull();
  });
  it("direct schema/client construction cannot disclose token or obtain OIDC before destination binding",async()=>{
    for(const destination of [...rejected,"https://other-alpha-factory.vercel.app"]){
      const cfg=config(destination),events:string[]=[],environment=env(cfg,destination==="https://other-alpha-factory.vercel.app"?origin:destination);
      const client=new HttpExternalAlphaFactoryClient(cfg,{projectId:"prj_fixture"},{env:environment,token:()=>{events.push("token");return "fixture-token";},oidc:async()=>{events.push("oidc");return "unused";},fetcher:async()=>{events.push("fetch");return Response.json({});}});
      await expect(client.read("fixture","a".repeat(32))).rejects.toThrow("ORIGIN_BINDING");expect(events).toEqual([]);
    }
  });
  it("keeps exact production application/project/team OIDC checks before sending to the dedicated destination",async()=>{
    for(const mismatch of [undefined,{project_id:"prj_other"},{owner_id:"team_Other"},{environment:"preview"}]){
      const cfg=config(),events:string[]=[],claims={project_id:"prj_fixture",owner_id:"team_Fixture",environment:"production",exp:Math.floor(Date.now()/1000)+60,...mismatch};
      const client=new HttpExternalAlphaFactoryClient(cfg,{projectId:"prj_fixture"},{env:env(cfg),token:()=>{events.push("token");return "fixture-token";},oidc:async()=>{events.push("oidc");return "fixture."+Buffer.from(JSON.stringify(claims)).toString("base64url")+".fixture";},fetcher:async url=>{events.push("fetch");expect(new URL(String(url)).origin).toBe(origin);return Response.json({state:"PENDING"});}});
      if(mismatch){await expect(client.read("fixture","a".repeat(32))).rejects.toThrow("IDENTITY_REQUIRED");expect(events).toEqual(["token","oidc"]);}else{expect(await client.read("fixture","a".repeat(32))).toEqual({state:"PENDING"});expect(events).toEqual(["token","oidc","fetch"]);}
    }
  });
});
