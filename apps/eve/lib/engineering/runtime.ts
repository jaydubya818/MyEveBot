import { hostedFactoryQueue } from "./deployment-mode.ts";
import { alphaConversationQualificationSchema } from "./alpha-conversation-policy.ts";
import { nativeCompletionPolicySchema } from "./native-completion.ts";
import { nativeQualificationSchema } from "./native-qualification.ts";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { criteriaSchema, WorkError, type WorkPrincipal } from "./types.ts";
import { digest, makeContract, profileSchema } from "./contract.ts";
import { WorkStore } from "./store.ts";
import { ExecutionStore } from "./execution-store.ts";
import { GitHubAdapter } from "./github.ts";
import { githubAppTokenProvider } from "./github-app.ts";
import { DockerClaudeExecutor, DockerProtectedVerifier } from "./docker-executor.ts";
import { EngineeringWorker } from "./worker.ts";
import { getAgent } from "../agents.ts";
import { approvedBaseSchema, preflightApprovedBase } from "./base-preflight.ts";

export const runtimeSchema=z.object({
  mode:z.literal("isolated-dogfood"), ownerId:z.string().min(1),agentId:z.string().min(1),
  objective:z.string().min(1).max(4000),criteria:criteriaSchema,profile:profileSchema,
  approvedBase:approvedBaseSchema,
  brokerPort:z.number().int().min(1024).max(65535),model:z.string().regex(/^claude-[\w.-]+$/),
  nativeQualification:nativeQualificationSchema.optional(),
  conversationQualification:alphaConversationQualificationSchema.optional(),
  nativeCompletion:nativeCompletionPolicySchema.default(() => nativeCompletionPolicySchema.parse({})),
  nativeMode:z.enum(["normal","potato"]).default("normal"),
  githubApp:z.object({appId:z.number().int().positive(),installationId:z.number().int().positive(),
    keychainService:z.string().min(1),keychainAccount:z.string().min(1)}).strict().optional(),
}).strict();
export async function engineeringConfig() {
  if(process.env.MYEVE_ENGINEERING_MODE!=="dogfood"||process.env.VERCEL_ENV==="production")throw new WorkError("engineering_disabled","Golden Work is restricted to an isolated dogfood runtime.",404);
  const file=process.env.MYEVE_ENGINEERING_CONFIG;
  if(!file?.startsWith("/"))throw new WorkError("engineering_setup","An approved qualification repository profile is required before execution.");
  const parsed=runtimeSchema.safeParse(JSON.parse(await readFile(file,"utf8")));
  if(!parsed.success)throw new WorkError("engineering_setup","The qualification profile or reviewed base manifest is incomplete.",503);
  return parsed.data;
}
export async function engineeringRuntime(principal:WorkPrincipal,store=new WorkStore(principal)) {
  const config=await engineeringConfig();
  if(principal.scopeKind!=="personal"||principal.scopeId!==config.ownerId||principal.actorId!==config.ownerId)throw new WorkError("engineering_scope","This qualification profile belongs to another owner.",403);
  const authorityCurrent=async()=>{const agent=await getAgent(principal.scopeId,config.agentId,store.database);return !!agent&&agent.isPrimary&&agent.status==="active";};
  const githubCredential=config.githubApp ? githubAppTokenProvider({
    ...config.githubApp,repository:config.profile.repository,
  }) : process.env.MYEVE_ENGINEERING_GITHUB_TOKEN || (async () => {
    throw new WorkError("github_setup","The qualification publisher credential is unavailable. GitHub actions remain disabled.",503);
  });
  // Resource custody is local and must remain inspectable while publication auth is unavailable.
  // The provider fails closed before any GitHub request when a credential is absent.
  const github=new GitHubAdapter(config.profile.repository,githubCredential);
  const execution=new ExecutionStore(store);
  const worker=new EngineeringWorker(execution,github,new DockerClaudeExecutor({brokerPort:config.brokerPort,brokerSecret:process.env.MYEVE_ENGINEERING_BROKER_SECRET??"",model:config.model}),new DockerProtectedVerifier(),()=>digest(config.profile),authorityCurrent);
  return {config,store,execution,github,worker,authorityCurrent};
}
export const intakeSchema=z.object({issue:z.number().int().positive(),maxCostUsd:z.number().positive().max(20),maxDurationSeconds:z.number().int().min(300).max(3600),idempotencyKey:z.string().uuid()}).strict();
export async function intakeIssue(principal:WorkPrincipal,value:unknown) {
  const input=intakeSchema.parse(value),runtime=await engineeringRuntime(principal),{config}=runtime;
  if(!await runtime.authorityCurrent())throw new WorkError("agent_authority","An active owner-bound primary Agent is required.",403);
  const issue=await runtime.github.issue(input.issue),snapshot=await runtime.github.snapshot(config.profile.baseBranch);
  preflightApprovedBase(config.profile,config.approvedBase,snapshot,input.issue);
  const created=await runtime.store.create({title:`Issue #${issue.number}: ${config.objective.slice(0,110)}`,objective:config.objective,repository:config.profile.repository,
    criteria:config.criteria,maxCostUsd:input.maxCostUsd,maxDurationSeconds:input.maxDurationSeconds,idempotencyKey:input.idempotencyKey});
  if(await runtime.execution.get(created.work.id))return {work:await runtime.store.get(created.work.id),created:false};
  const contract=makeContract(created.work,principal,config.profile,issue,snapshot.sha,config.agentId);
  await runtime.execution.admit(created.work,contract);
  return {work:await runtime.store.get(created.work.id),created:created.created};
}

/** Hosted conversation receives only the reviewed, nonsecret repository profile.
 * This does not enable the isolated native executor or read local credentials. */
export async function engineeringConversationConfig() {
  if (!hostedFactoryQueue()) return engineeringConfig();
  const parsed=runtimeSchema.safeParse(JSON.parse(process.env.MYEVE_ALPHA_CONVERSATION_CONFIG??"null"));
  if(!parsed.success || !parsed.data.conversationQualification || parsed.data.nativeQualification ||
     parsed.data.ownerId!==process.env.MYEVE_OWNER_ID || parsed.data.profile.repository!==process.env.MYEVE_ALPHA_REPOSITORY)
    throw new WorkError("conversation_setup","The reviewed private-alpha conversation profile is unavailable.",503);
  return parsed.data;
}
