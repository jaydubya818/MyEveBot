import { afterEach, describe, expect, it, vi } from "vitest";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { Env, connection } from "../external-alpha/work-test-fixture.ts";
import { digest } from "./transport.ts";
import { relayConnectionBinding, validateRelayReusePlan, type RelayReusePlan, type RelayReadOnlyInstallationAudit } from "./installation-validation.ts";
const relayRoot = process.env.MYRELAY_SOURCE_ROOT;
const relayCommit = "8a8678d675adc8ac7f799d7660071de2256bb231";
const sourceFile = (path: string) => execFileSync("git",["-C",relayRoot!,"show",`${relayCommit}:${path}`],{encoding:"utf8",maxBuffer:4*1024*1024});
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const envs: Env[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(envs.splice(0).map(e => e.close())); },60000);
function sealed(owner: string, value: string, key: Buffer) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm",key,iv); cipher.setAAD(Buffer.from(owner));
  const data = Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]); return [iv,cipher.getAuthTag(),data].map(b=>b.toString("base64url")).join(".");
}
async function fixture() {
  const source=await Env.create(false,{},false),target=await Env.create(false,{},false);envs.push(source,target);
  const pg=createRequire(import.meta.url)("pg"),relay=new Env(),u=new URL(connection!);
  relay.admin=new pg.Pool({connectionString:connection});await relay.admin.query("CREATE DATABASE "+relay.name);u.pathname="/"+relay.name;
  relay.pool=new pg.Pool({connectionString:u.href});relay.pool.on("error",()=>{});envs.push(relay);
  const journal=JSON.parse(sourceFile("drizzle/meta/_journal.json"));
  for(const entry of journal.entries) await relay.pool.query(sourceFile(`drizzle/${entry.tag}.sql`));
  const legacyAgent=randomUUID(),targetAgent=randomUUID(),key=randomBytes(32),credential="rly_"+randomBytes(24).toString("base64url"),session=randomBytes(32).toString("base64url");
  const account=randomUUID(),agent=randomUUID(),operator=randomUUID(),principal=randomUUID(),credentialId=randomUUID();
  for(const [env,id] of [[source,legacyAgent],[target,targetAgent]] as const) await env.pool.query("INSERT INTO agents(id,owner_id,name,slug,role,instructions)VALUES($1,$2,'Fixture','fixture','Fixture','Fixture')",[id,env.owner]);
  const row={owner_id:source.owner,local_agent_id:legacyAgent,relay_owner_id:account,relay_agent_id:agent,address:`relay://${account}/${agent}`,issuer:"https://relay.example.invalid",signing_key_id:"fixture-key",signing_public_key:"fixture-public-key",agent_credential_encrypted:sealed(source.owner,credential,key),owner_session_encrypted:sealed(source.owner,"__Host-relay_session="+session,key),status:"active",local_work_policy:{research:"approval"}};
  await source.pool.query("INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted,local_work_policy)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[row.owner_id,row.local_agent_id,account,agent,row.address,row.issuer,row.signing_key_id,row.signing_public_key,row.agent_credential_encrypted,row.owner_session_encrypted,row.local_work_policy]);
  await relay.pool.query("INSERT INTO accounts(id,name)VALUES($1,'Fixture')",[account]);
  await relay.pool.query("INSERT INTO agents(id,account_id,name)VALUES($1,$2,'Fixture')",[agent,account]);
  await relay.pool.query("INSERT INTO agent_credentials(id,agent_id,account_id,name,secret_hash,prefix,last_used_at)VALUES($1,$2,$3,'Fixture',$4,'fixture','2020-01-01T00:00:00Z')",[credentialId,agent,account,hash(credential)]);
  const registration={agentId:agent,platform:"myeve",capabilities:[{name:"message.send",version:"1.0"}]};
  await relay.pool.query("INSERT INTO federation_agents(agent_id,account_id,address,registration,availability)VALUES($1,$2,$3,$4,'ONLINE')",[agent,account,row.address,registration]);
  await relay.pool.query("INSERT INTO users(id,account_id,email,name,password_hash,role)VALUES($1,$2,'fixture@example.invalid','Fixture','NOT_A_PASSWORD','OWNER')",[operator,account]);
  await relay.pool.query("INSERT INTO principals(id,user_id,type,display_name)VALUES($1,$2,'HUMAN','Fixture')",[principal,operator]);
  await relay.pool.query("INSERT INTO account_memberships(principal_id,account_id,role)VALUES($1,$2,'OWNER')",[principal,account]);
  await relay.pool.query("INSERT INTO capabilities(id,name,domain,description,risk)VALUES('fixture-cap','message.send','Fixture','Fixture','LOW')");
  await relay.pool.query("INSERT INTO capability_grants(id,account_id,agent_id,capability,effect)VALUES('fixture-grant',$1,$2,'message.send','ALLOW')",[account,agent]);
  await relay.pool.query("INSERT INTO user_sessions(id,token_hash,user_id,account_id,expires_at,last_seen_at)VALUES('fixture-session',$1,$2,$3,now()+interval '1 hour','2020-01-01T00:00:00Z')",[hash(session),operator,account]);
  const refs={source:"private-source-reference",target:"private-target-reference",relay:"private-relay-reference"};
  const plan: RelayReusePlan={kind:"RELAY_READ_ONLY_REUSE_PLAN_V1",expiresAt:new Date(Date.now()+600000).toISOString(),source:{databaseRefSha256:hash(refs.source),ownerId:source.owner,localAgentId:legacyAgent,connectionSha256:digest(relayConnectionBinding(row)),credentialCiphertextSha256:hash(row.agent_credential_encrypted),ownerSessionCiphertextSha256:hash(row.owner_session_encrypted),encryptionKeySha256:hash(key.toString("hex"))},relay:{databaseRefSha256:hash(refs.relay),accountId:account,operatorId:operator,principalId:principal,agentId:agent,credentialId,origin:row.issuer,address:row.address,scopeSha256:digest({registration,availability:"ONLINE",grants:[{capability:"message.send",effect:"ALLOW",enabled:true,status:"ACTIVE"}],federationGrants:[],delegations:[]})},target:{databaseRefSha256:hash(refs.target),slot:"1",projectId:"prj_fixture",ownerId:target.owner,localAgentId:targetAgent}};
  const sql:string[]=[];const pool=(e:Env)=>({connect:async()=>{const c=await e.pool.connect();return{query:async(q:string,p?:unknown[])=>{sql.push(q);return c.query(q,p);},release:()=>c.release()};}});
  const audit:RelayReadOnlyInstallationAudit={mode:"INSTALLATION_READ_ONLY",expectedPlanSha256:digest(plan),source:{pool:pool(source),databaseReference:refs.source,encryptionKey:key},relay:{pool:pool(relay),databaseReference:refs.relay},target:{pool:pool(target),databaseReference:refs.target,projectId:plan.target.projectId,ownerId:target.owner,localAgentId:targetAgent}};
  return {source,target,relay,row,plan,audit,sql,key,credential,session,repin:()=>{audit.expectedPlanSha256=digest(plan);}};
}
describe.skipIf(!connection||!relayRoot)("installation-only Relay reuse audit (canonical live Relay migrations, no writes/recovery)",()=>{
  it("validates exact existing scope and source owner AAD while all databases and last-used timestamps stay unchanged",async()=>{
    const f=await fixture();vi.stubGlobal("fetch",vi.fn(()=>{throw Error("NETWORK_FORBIDDEN");}));
    const out=await validateRelayReusePlan(f.plan,f.audit);expect(out).toMatchObject({credentialStatus:"VALID",ownerSessionStatus:"VALID",mutationPerformed:false,activationPerformed:false});
    expect(JSON.stringify(out)).not.toContain(f.credential);expect(JSON.stringify(out)).not.toContain(f.session);
    expect(f.sql.every(q=>/^(SELECT|BEGIN|SET LOCAL|COMMIT|ROLLBACK)/.test(q))).toBe(true);expect(await f.target.count("myeve_relay_connections")).toBe(0);
    expect((await f.source.pool.query("SELECT agent_credential_encrypted,owner_session_encrypted FROM myeve_relay_connections")).rows[0]).toEqual({agent_credential_encrypted:f.row.agent_credential_encrypted,owner_session_encrypted:f.row.owner_session_encrypted});
    expect((await f.relay.pool.query("SELECT last_used_at FROM agent_credentials")).rows[0].last_used_at.toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect((await f.relay.pool.query("SELECT last_seen_at FROM user_sessions")).rows[0].last_seen_at.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  },30000);
  it("reports expired, revoked and absent owner-session truth without recovering it or changing valid Agent authority",async()=>{
    const f=await fixture();await f.relay.pool.query("UPDATE user_sessions SET expires_at=now()-interval '1 hour'");
    expect(await validateRelayReusePlan(f.plan,f.audit)).toMatchObject({credentialStatus:"VALID",ownerSessionStatus:"EXPIRED",ownerAuthentication:"OWNER_AUTH_REQUIRED"});
    await f.relay.pool.query("UPDATE user_sessions SET revoked_at=now()");expect((await validateRelayReusePlan(f.plan,f.audit)).ownerSessionStatus).toBe("INVALID");
    await f.source.pool.query("UPDATE myeve_relay_connections SET owner_session_encrypted=''");f.plan.source.ownerSessionCiphertextSha256=hash("");f.repin();
    expect(await validateRelayReusePlan(f.plan,f.audit)).toMatchObject({ownerSessionStatus:"ABSENT",ownerAuthentication:"OWNER_AUTH_REQUIRED"});expect(await f.target.count("myeve_relay_connections")).toBe(0);
  },30000);
  it("denies revoked, expired, disabled, retired and removed-member authority",async()=>{
    const f=await fixture();
    for(const [alter,restore,code] of [
      ["UPDATE agent_credentials SET revoked_at=now()","UPDATE agent_credentials SET revoked_at=NULL","AGENT"],
      ["UPDATE agent_credentials SET expires_at=now()-interval '1 hour'","UPDATE agent_credentials SET expires_at=NULL","AGENT"],
      ["UPDATE agents SET status='DISABLED'","UPDATE agents SET status='ACTIVE'","AGENT"],
      ["UPDATE accounts SET retired_at=now()","UPDATE accounts SET retired_at=NULL","AGENT"],
      ["UPDATE account_memberships SET status='REMOVED'","UPDATE account_memberships SET status='ACTIVE'","OPERATOR"],
    ]){await f.relay.pool.query(alter);await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow(`RELAY_REUSE_${code}_AUTH_INVALID`);await f.relay.pool.query(restore);}
    expect(await f.target.count("myeve_relay_connections")).toBe(0);
  },30000);
  it("never promotes an expired federation grant or delegation from Agent credential validity",async()=>{
    const f=await fixture();
    const document={grantorAgentId:f.plan.relay.agentId,granteeAgentId:f.plan.relay.agentId,conditions:{expiresAt:"2026-10-03T00:00:00.000Z"}};
    await f.relay.pool.query("INSERT INTO federation_grants(id,account_id,grantee_account_id,capability,resource,document,status)VALUES('expired-grant',$1,$1,'message.send',$2,$3,'ACTIVE')",[f.plan.relay.accountId,f.plan.relay.address,document]);
    await f.relay.pool.query("INSERT INTO federation_message_delegations(id,account_id,user_id,agent_id,grantee_account_id,grantee_agent_id,token_hash,expires_at)VALUES(\'expired-delegation\',$1,$2,$3,$1,$3,$4,\'2026-10-03T00:00:00Z\')",[f.plan.relay.accountId,f.plan.relay.operatorId,f.plan.relay.agentId,hash("synthetic-expired-delegation")]);
    const scope={registration:{agentId:f.plan.relay.agentId,platform:"myeve",capabilities:[{name:"message.send",version:"1.0"}]},availability:"ONLINE",grants:[{capability:"message.send",effect:"ALLOW",enabled:true,status:"ACTIVE"}],federationGrants:(await f.relay.pool.query("SELECT id,account_id,grantee_account_id,capability,resource,document,status FROM federation_grants ORDER BY id")).rows,delegations:(await f.relay.pool.query("SELECT id,account_id,user_id,agent_id,grantee_account_id,grantee_agent_id,expires_at::text,revoked_at::text FROM federation_message_delegations ORDER BY id")).rows};
    f.plan.relay.scopeSha256=digest(scope);f.repin();
    expect(await validateRelayReusePlan(f.plan,f.audit)).toMatchObject({credentialStatus:"VALID",scopeAuthorizationEstablished:false,mutationPerformed:false});
    expect((await f.relay.pool.query("SELECT document FROM federation_grants")).rows[0].document).toEqual(document);
    await f.relay.pool.query("UPDATE federation_grants SET document=jsonb_set(document,'{conditions,expiresAt}','\"2030-01-01T00:00:00.000Z\"')");
    await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow("LIVE_SCOPE_CHANGED");
  },30000);
  it("rejects plan/reference, ciphertext/AAD, capability widening and occupied target changes",async()=>{
    const f=await fixture(),bad=structuredClone(f.plan);bad.target.ownerId=randomUUID();await expect(validateRelayReusePlan(bad,f.audit)).rejects.toThrow("PLAN_INVALID");
    await expect(validateRelayReusePlan(f.plan,{...f.audit,relay:{...f.audit.relay,databaseReference:"different-resource"}})).rejects.toThrow("INSTALLATION_BINDING");
    const foreignSealed=sealed(randomUUID(),f.credential,f.key);await f.source.pool.query("UPDATE myeve_relay_connections SET agent_credential_encrypted=$1",[foreignSealed]);
    await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow("SOURCE_CHANGED");f.plan.source.credentialCiphertextSha256=hash(foreignSealed);f.repin();
    await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow("SEALED_SECRET_INVALID");
    await f.source.pool.query("UPDATE myeve_relay_connections SET agent_credential_encrypted=$1",[f.row.agent_credential_encrypted]);f.plan.source.credentialCiphertextSha256=hash(f.row.agent_credential_encrypted);f.repin();
    await f.relay.pool.query("UPDATE capability_grants SET effect='DENY'");await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow("LIVE_SCOPE_CHANGED");await f.relay.pool.query("UPDATE capability_grants SET effect='ALLOW'");
    await f.target.pool.query("INSERT INTO myeve_relay_connections(owner_id,local_agent_id,relay_owner_id,relay_agent_id,address,issuer,signing_key_id,signing_public_key,agent_credential_encrypted,owner_session_encrypted)VALUES($1,$2,'other-account','other-agent','relay://other-account/other-agent','https://relay.example.invalid','fixture','fixture','fixture','fixture')",[f.target.owner,f.plan.target.localAgentId]);
    await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow("TARGET_UNAVAILABLE");
  },30000);
});

/** Synthetic immutable snapshots exercise the audit without a canonical Relay
 * checkout. The migration-backed cases above remain separately gated. */
function deterministicFixture() {
 const key=Buffer.alloc(32,7),credential="synthetic-agent-credential",session="synthetic_session";
 const row={owner_id:"source-owner",local_agent_id:"source-agent",relay_owner_id:"account",relay_agent_id:"native-agent",address:"relay://account/native-agent",issuer:"https://relay.example.invalid",signing_key_id:"fixture",signing_public_key:"fixture",status:"active",local_work_policy:{research:"approval"},agent_credential_encrypted:sealed("source-owner",credential,key),owner_session_encrypted:sealed("source-owner","__Host-relay_session="+session,key)};
 const scope={registration:{agentId:"native-agent"},availability:"ONLINE",grants:[],federationGrants:[],delegations:[]};
 const plan:RelayReusePlan={kind:"RELAY_READ_ONLY_REUSE_PLAN_V1",expiresAt:"2099-01-01T00:00:00.000Z",source:{databaseRefSha256:hash("source-ref"),ownerId:row.owner_id,localAgentId:row.local_agent_id,connectionSha256:digest(relayConnectionBinding(row)),credentialCiphertextSha256:hash(row.agent_credential_encrypted),ownerSessionCiphertextSha256:hash(row.owner_session_encrypted),encryptionKeySha256:hash(key.toString("hex"))},relay:{databaseRefSha256:hash("relay-ref"),accountId:"account",operatorId:"operator",principalId:"principal",agentId:"native-agent",credentialId:"credential",origin:row.issuer,address:row.address,scopeSha256:digest(scope)},target:{databaseRefSha256:hash("target-ref"),slot:"2",projectId:"prj_synthetic",ownerId:"target-owner",localAgentId:"target-agent"}};
 const sql:string[]=[],clients:ReturnType<typeof vi.fn>[]=[];
 let readOnly="on",sessionUnexpired=true;
 const pool=(kind:string)=>({connect:vi.fn(async()=>{
  const release=vi.fn();clients.push(release);
  return {release,query:async(q:string)=>{
   sql.push(q);if(!/^(SELECT|BEGIN|SET LOCAL|COMMIT|ROLLBACK)/.test(q))throw Error("MUTATION_FORBIDDEN");
   if(q.includes("current_setting"))return{rows:[{mode:readOnly}]};
   if(q.includes("SELECT c.*"))return{rows:[row]};
   if(kind==="relay"&&q.includes("FROM agent_credentials"))return{rows:[{id:"credential",...scope,address:row.address,revoked_at:null,unexpired:true}]};
   if(q.includes("SELECT p.id"))return{rows:[{id:"principal"}]};
   if(q.includes("FROM user_sessions"))return{rows:[{id:"operator",revoked_at:null,unexpired:sessionUnexpired}]};
   if(kind==="target"&&q.includes("SELECT id FROM agents"))return{rows:[{id:"target-agent"}]};
   return{rows:[]};
  }};
 })});
 const audit:RelayReadOnlyInstallationAudit={mode:"INSTALLATION_READ_ONLY",expectedPlanSha256:digest(plan),source:{pool:pool("source"),databaseReference:"source-ref",encryptionKey:key},relay:{pool:pool("relay"),databaseReference:"relay-ref"},target:{pool:pool("target"),databaseReference:"target-ref",projectId:plan.target.projectId,ownerId:plan.target.ownerId,localAgentId:plan.target.localAgentId}};
 return{plan,audit,row,sql,clients,credential,session,key,repin:()=>{audit.expectedPlanSha256=digest(plan);},setReadOnly:(v:string)=>{readOnly=v;},expireSession:()=>{sessionUnexpired=false;}};
}
describe("deterministic installation-only Relay audit (synthetic snapshots)",()=>{
 it("reads three snapshots without mutation, network, authority creation or secret disclosure",async()=>{
  const f=deterministicFixture();vi.stubGlobal("fetch",vi.fn(()=>{throw Error("NETWORK_FORBIDDEN");}));
  expect(await validateRelayReusePlan(f.plan,f.audit)).toMatchObject({credentialStatus:"VALID",ownerSessionStatus:"VALID",mutationPerformed:false,activationPerformed:false,scopeAuthorizationEstablished:false});
  expect(f.sql.filter(q=>q.startsWith("BEGIN"))).toHaveLength(3);
  expect(f.sql.filter(q=>q==="COMMIT")).toHaveLength(3);
  expect(f.clients.every(release=>release.mock.calls.length===1)).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
  const out=JSON.stringify(await validateRelayReusePlan(f.plan,f.audit));expect(out).not.toContain(f.credential);expect(out).not.toContain(f.session);
 });
 it.each(["digest","expiry","project","owner","database","identity"])("denies %s mismatches before any database access",async(change)=>{
  const f=deterministicFixture();
  if(change==="digest")f.audit.expectedPlanSha256="0".repeat(64);
  if(change==="expiry"){f.plan.expiresAt="2000-01-01T00:00:00.000Z";f.repin();}
  if(change==="project")f.audit.target.projectId="wrong-project";
  if(change==="owner")f.audit.target.ownerId="wrong-owner";
  if(change==="database")f.audit.target.databaseReference="source-ref";
  if(change==="identity"){f.plan.relay.address="relay://other/native-agent";f.repin();}
  await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow("RELAY_REUSE_");expect(f.sql).toEqual([]);
 });
 it("rolls back and releases a connection that is not read-only",async()=>{
  const f=deterministicFixture();f.setReadOnly("off");await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow("NOT_READ_ONLY");
  expect(f.sql.at(-1)).toBe("ROLLBACK");expect(f.clients[0]).toHaveBeenCalledOnce();expect(f.audit.relay.pool.connect).not.toHaveBeenCalled();
 });
 it("denies owner-AAD substitution even if its ciphertext digest is repinned",async()=>{
  const f=deterministicFixture();f.row.agent_credential_encrypted=sealed("foreign-owner",f.credential,f.key);
  f.plan.source.credentialCiphertextSha256=hash(f.row.agent_credential_encrypted);f.repin();
  await expect(validateRelayReusePlan(f.plan,f.audit)).rejects.toThrow("SEALED_SECRET_INVALID");expect(f.audit.relay.pool.connect).not.toHaveBeenCalled();
 });
 it("reports expiry without authenticating or extending a session",async()=>{
  const f=deterministicFixture();f.expireSession();expect(await validateRelayReusePlan(f.plan,f.audit)).toMatchObject({credentialStatus:"VALID",ownerSessionStatus:"EXPIRED",ownerAuthentication:"OWNER_AUTH_REQUIRED",mutationPerformed:false});
 });
});
