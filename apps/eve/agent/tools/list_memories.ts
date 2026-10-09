import { assertExternalAlphaTool } from "../../lib/external-alpha/tool-authority.ts";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { memoryStore } from "../lib/memory-store";
import { memoryAccessForTool } from "../lib/memory-tool-context";

export default defineTool({
  description:
    "List saved long-term memories visible to the current Agent and execution. Private memories from other Agents and unrelated Goals are never returned.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    await assertExternalAlphaTool(ctx, "list_memories");
    const memories = await memoryStore.list(await memoryAccessForTool(ctx));
    return { memories };
  },
});
