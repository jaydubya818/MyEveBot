import { defineTool } from "eve/tools";
import { writeFile } from "eve/tools/defaults";

import { requireComputerCapability } from "../lib/computer-context.ts";

export default defineTool({
  ...writeFile,
  async execute(input, ctx) {
    const { session } = await requireComputerCapability(ctx, "files.write");
    const content = (input as Record<string, unknown>).content;
    const size = typeof content === "string" ? Buffer.byteLength(content, "utf8") : 0;
    if (size > session.resourceLimits.maxFileBytes) throw new Error(`File exceeds the ${session.resourceLimits.maxFileBytes}-byte session limit.`);
    return writeFile.execute(input, ctx);
  },
});
