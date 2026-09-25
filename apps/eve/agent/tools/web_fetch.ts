import {defineTool} from "eve/tools";
import {webFetch} from "eve/tools/web_fetch";
import {ownerRuntimeFromAuth,resolveOwnerRuntime} from "../../lib/relay/owner/runtime.ts";
import {effectiveCapability,getAgent} from "../../lib/agents.ts";

// Preserve Eve's public-network DNS, redirect and response-size protections.
// The owner-channel adapter only adds canonical authority at execution time.
export default defineTool({
  ...webFetch,
  async *execute(input,ctx){
    const claim=ownerRuntimeFromAuth(ctx.session.auth);
    if(claim){
      const binding=await resolveOwnerRuntime(claim);
      const agent=await getAgent(claim.ownerId,claim.agentId);
      if(!binding.channelCapabilities.includes("web.read") || binding.session_id!==ctx.session.id || !agent || !effectiveCapability(agent,"web.read").allowed)throw new Error("Public research authority unavailable.");
    }
    if(!webFetch.execute)throw new Error("Canonical web fetch unavailable.");
    const result = await webFetch.execute(input,ctx);
    if (Symbol.asyncIterator in result) yield* result;
    else yield result;
  },
});
