import { NativeRouteAuthority } from "../lib/engineering/native-routing.ts";
import { NativeResultStore } from "../lib/engineering/native-results.ts";
import { createRequire } from "node:module";
import { DirectDevelopmentStore } from "../lib/engineering/direct-development.ts";
import { DirectVerificationDriver, DockerVerificationResourceInspector } from "../lib/engineering/direct-verification-driver.ts";
import { DockerProtectedVerifier } from "../lib/engineering/docker-executor.ts";
import { engineeringConfig } from "../lib/engineering/runtime.ts";
import { WorkStore } from "../lib/engineering/store.ts";
import { getAgent } from "../lib/agents.ts";

// Separate from the model broker. This worker has no model/publisher credential
// and only consumes candidates already retained for an admitted DEEP_AGENT Run.
const url=new URL(process.env.MYEVE_ENGINEERING_DATABASE_URL??"invalid:");
if (process.env.MYEVE_ENGINEERING_MODE!=="dogfood" || process.env.VERCEL_ENV==="production" ||
    url.hostname!=="127.0.0.1" || url.port!=="55468" ||
    !/^\/golden_[a-z0-9_]+$/.test(url.pathname))
  throw new Error("Native verifier requires an explicit isolated loopback PostgreSQL database.");
const {Pool}=createRequire(import.meta.url)("pg") as {Pool:new(options:{connectionString:string})=>{
  query:(sql:string,params?:unknown[])=>Promise<{rows:Record<string,any>[]}>,end:()=>Promise<void>}};
const pool=new Pool({connectionString:url.href});
const config=await engineeringConfig();
const principal={scopeId:config.ownerId,scopeKind:"personal" as const,actorId:config.ownerId};
const store=new WorkStore(principal,{query:async(sql,params)=>(await pool.query(sql,params)).rows});
const authority=new NativeRouteAuthority(store);
const direct=new DirectDevelopmentStore(store,{profile:config.profile,approvedBase:config.approvedBase,
  objective:config.objective,criteria:config.criteria,agentId:config.agentId,issueNumber:1,assertCurrentAuthority:id=>authority.assertEffect(id)});
const driver=new DirectVerificationDriver(direct,new DockerProtectedVerifier());
const args=process.argv.slice(2);
if (args.length) {
  const [flag,workId,candidateSha]=args;
  if (args.length!==3 || flag!=="--retry" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workId) ||
      !/^[0-9a-f]{40}$/.test(candidateSha))
    throw new Error("Use --retry <exact Work UUID> <exact 40-character candidate SHA>.");
  const agent=await getAgent(config.ownerId,config.agentId,store.database);
  if (!agent?.isPrimary || agent.status!=="active") throw new Error("Primary Agent authority is unavailable.");
  const job=await driver.retryAfterResourceCheck(workId,candidateSha,new DockerVerificationResourceInspector());
  console.log("Native verification retry queued after exact Docker resource absence check",job.workId,job.candidateSha);
  await pool.end();
  process.exit(0);
}
let stopping=false;
const stop=()=>{stopping=true;};
process.on("SIGTERM",stop);
process.on("SIGINT",stop);
console.log("Native protected-verification worker started; isolated dogfood only.");
try {
  while (!stopping) {
    const agent=await getAgent(config.ownerId,config.agentId,store.database);
    if (agent?.isPrimary && agent.status==="active") {
      for (const work of await store.list()) {
        if (stopping) break;
        try {
          const state=await direct.inspect(work.id);
          if (state.workspace && ["VERIFICATION_PASSED","VERIFICATION_FAILED"].includes(state.workspace.phase)) {
            // Crash after evidence custody but before result insertion: reconcile without executing the candidate again.
            await driver.run(work.id);
            await new NativeResultStore(direct).retain(work.id);
          }
          if (state.workspace?.phase==="VERIFICATION_REQUESTED" && state.current) {
            const candidate=state.workspace.candidates.at(-1);
            if (!candidate) continue;
            const existing=await driver.inspectJob(work.id,candidate.sha);
            if (existing?.status==="RECOVERY_REQUIRED") continue;
            await authority.assertEffect(work.id);
            await driver.run(work.id);
            await new NativeResultStore(direct).retain(work.id);
          }
        } catch (error) {
          console.error("Native verifier needs reconciliation",work.id,error instanceof Error?error.message:"Unknown error");
        }
      }
    }
    if (!stopping) await new Promise(resolve=>setTimeout(resolve,2000));
  }
} finally { await pool.end(); }
