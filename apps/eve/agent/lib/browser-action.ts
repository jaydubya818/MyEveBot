import { createHash } from "node:crypto";
import * as browserTools from "@agent-browser/eve/tools";
import type { ToolContext } from "eve/tools";
import { ActionBlocked,ActionGateway,consumeActionAuthority } from "../../lib/action-gateway.ts";
import { toolActionRequest } from "./action-context.ts";
import { getComputerSandbox, requireComputerCapability } from "./computer-context.ts";
import { browserEffect } from "../../lib/browser-effect.ts";
import { denyUnqualifiedExecutor } from "./unqualified-executor.ts";

export const BROWSER_ACTION_CAPABILITIES:Readonly<Record<string,string>>={
  click:"browser.click",fill:"browser.type",press_key:"browser.click",select_option:"browser.click",
  scroll:"browser.click",navigate:"browser.navigate",close:"browser.click",
  read:"browser.read",get:"browser.read",find:"browser.read",snapshot:"browser.read",screenshot:"browser.read",wait_for:"browser.read",
};
const READS=new Set(["read","get","find","snapshot","screenshot","wait_for"]);

/** Shared by the static extension and dynamic Agent override; neither calls raw executors. */
export async function executeBrowserAction<T extends keyof typeof browserTools>(name:T,input:Record<string,unknown>,ctx:ToolContext):Promise<Awaited<ReturnType<(typeof browserTools)[T]["execute"]>>> {
  // A browser.click grant cannot substitute for email.send/publish/deploy/delete.
  if(browserEffect(name,input)==="unknown")return denyUnqualifiedExecutor(ctx,BROWSER_ACTION_CAPABILITIES[name]??"browser.click",{operation:name,...input,effect:"unknown"});
  const capabilityId=name==="find" && input.action!=="text"?(input.action==="fill"?"browser.type":"browser.click"):BROWSER_ACTION_CAPABILITIES[name];
  const isRead=READS.has(name) && !(name==="find" && input.action!=="text");
  if(!capabilityId)throw new ActionBlocked("denied","unsupported_browser_operation");
  if(name==="wait_for" && input.jsCondition)throw new ActionBlocked("denied","unsupported_browser_javascript");
  if(name==="screenshot" && input.path)throw new ActionBlocked("denied","screenshot_file_target_not_qualified");
  const {session}=await requireComputerCapability(ctx,capabilityId);
  const sandbox=await getComputerSandbox(ctx);
  if(session.sandboxId!==sandbox.id)throw new ActionBlocked("denied","browser_session_mismatch");
  const boundCtx={...ctx,getSandbox:async()=>sandbox};
  const tool=browserTools[name as keyof typeof browserTools];
  // URL fetches and navigation use their explicit target. Interactive mutations
  // bind the current page. Opaque JavaScript and profile/control tools are denied.
  async function currentUrl():Promise<string> {
    const result=await browserTools.get.execute({property:"url"},boundCtx) as {url?:unknown}|null;
    if(typeof result?.url!=="string")throw new Error("Unresolved browser page");
    return result.url;
  }
  const action=await toolActionRequest(ctx,{capabilityId,actionClass:isRead?"read":name==="navigate"?"read":"write",
    parameters:{operation:name,...input},computer:{sessionId:session.id,controlVersion:session.control.version}});
  let output:unknown;
  let invoked=false;
  await new ActionGateway().execute(action,{
    async resolveTarget() {
      const url=typeof input.url==="string"?input.url:await currentUrl();
      const parsed=new URL(url);
      const domains=session.networkPolicy.allowedDomains;
      if(!["http:","https:"].includes(parsed.protocol) || parsed.username || parsed.password || !Array.isArray(domains) || !domains.some(domain=>typeof domain==="string" && (domain===parsed.hostname || (domain.startsWith("*.") && parsed.hostname.endsWith(domain.slice(1))))))throw new Error("Browser target denied");
      return {provider:"browser",account:session.id,resource:parsed.href,environment:sandbox.id};
    },
    async execute(parameters,authorized) {
      await consumeActionAuthority(authorized,parameters,capabilityId);
      await requireComputerCapability(ctx,capabilityId);
      if(!isRead && name!=="navigate" && await currentUrl()!==authorized.target.resource)throw new Error("Browser page changed");
      const {operation:_,...bound}=parameters;
      const execute = tool.execute as (input: Record<string, unknown>, context: typeof boundCtx) => unknown;
      output=await execute(bound,boundCtx);invoked=true;return output;
    },
    receipt:()=>({computerSessionId:session.id,operation:name}),
    async verify(result,target) {
      const observation=name==="close"?null:await browserTools.snapshot.execute({compact:true,includeUrls:false,interactiveOnly:true},boundCtx);
      const evidenceHash=createHash("sha256").update(JSON.stringify(observation??null)).digest("hex");
      // A click returning success does not prove a purchase/email/form succeeded.
      // Preserve evidence and leave semantic mutations for explicit recovery.
      const verified=isRead || (name==="navigate" && await currentUrl()===target.resource);
      return {verified,receipt:{computerSessionId:session.id,operation:name,evidenceHash,
        verification:verified?"observed":"semantic_verification_required"}};
    },
  },ctx.abortSignal);
  if(!invoked)throw new Error("This action already completed. Inspect its receipt; do not repeat the operation.");
  return output as Awaited<ReturnType<(typeof browserTools)[T]["execute"]>>;
}
