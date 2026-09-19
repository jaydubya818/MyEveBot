import { defineTool } from "eve/tools";
import { writeFile } from "eve/tools/defaults";

import { fileWriteAdapter } from "../../lib/action-adapters.ts";
import { ActionGateway } from "../../lib/action-gateway.ts";
import { toolActionRequest } from "../lib/action-context.ts";
import { requireComputerCapability } from "../lib/computer-context.ts";

export default defineTool({
  ...writeFile,
  async execute(input, ctx) {
    const { session } = await requireComputerCapability(ctx, "files.write");
    const content = (input as Record<string, unknown>).content;
    const size = typeof content === "string" ? Buffer.byteLength(content, "utf8") : 0;
    if (size > session.resourceLimits.maxFileBytes) throw new Error(`File exceeds the ${session.resourceLimits.maxFileBytes}-byte session limit.`);
    const sandbox=await ctx.getSandbox();
    if(sandbox.id!==session.sandboxId)throw new Error("The sandbox no longer matches the authorized Computer session.");
    const action=await toolActionRequest(ctx,{capabilityId:"files.write",actionClass:"write",parameters:input as Record<string,unknown>,
      computer:{sessionId:session.id,controlVersion:session.control.version}});
    return new ActionGateway().execute(action,fileWriteAdapter({
      id:sandbox.id,
      async canonicalPath(path) {
        const quoted="'"+path.replaceAll("'","'\\''")+"'";
        const result=await sandbox.run({command:`realpath -m -- ${quoted}`});
        if(result.exitCode!==0)throw new Error("Unable to resolve file target");
        return result.stdout.trim();
      },
      write:async parameters=>writeFile.execute(parameters,{...ctx,getSandbox:async()=>sandbox}),
      read:async path=>sandbox.readTextFile({path}),
    }),ctx.abortSignal);
  },
});
