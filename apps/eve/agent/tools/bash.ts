import { defineTool } from "eve/tools";
import { bash } from "eve/tools/defaults";

import { isAllowedTerminalCommand } from "../../lib/computer-types.ts";
import { requireComputerCapability } from "../lib/computer-context.ts";

export default defineTool({
  ...bash,
  description: "Run one bounded, read-only diagnostic command in the active Agent computer sandbox. Supported commands: pwd, ls, wc, head, tail, sort, and uniq. Shell operators, expansion, scripts, and network clients are denied.",
  async execute(input, ctx) {
    const { session } = await requireComputerCapability(ctx, "terminal.execute");
    const value = input as Record<string, unknown>;
    if (typeof value.command !== "string" || value.command.trim().length === 0) throw new Error("A terminal command is required.");
    const command = value.command.trim();
    if (!isAllowedTerminalCommand(command)) {
      throw new Error("Phase 6 terminal commands are limited to read-only diagnostics without shell operators, expansion, scripts, or network clients.");
    }
    const timeout = AbortSignal.timeout(session.resourceLimits.terminalTimeoutSeconds * 1000);
    return (await ctx.getSandbox()).run({
      command,
      ...(typeof value.workingDirectory === "string" ? { workingDirectory: value.workingDirectory } : {}),
      abortSignal: AbortSignal.any([ctx.abortSignal, timeout]),
    });
  },
});
