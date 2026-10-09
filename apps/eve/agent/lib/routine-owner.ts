import { executionIdentityFromAuth } from "../../lib/execution-auth.ts";
import type { ToolContext } from "eve/tools";
/** Routine authoring requires direct authenticated owner intent. Execution credentials
 * and inherited agent identities cannot create or expand unattended authority. */
export function routineOwner(ctx: Pick<ToolContext,"session">): string {
  const current=ctx.session.auth.current;
  if(!current || current.principalType!=="user" || current.attributes.owner!=="true" || current.attributes.role==="guest" || ctx.session.parent || executionIdentityFromAuth(ctx.session.auth)) {
    throw new Error("Routine management requires the authenticated owner.");
  }
  return current.principalId;
}
