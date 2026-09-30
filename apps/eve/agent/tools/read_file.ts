import { defineTool } from "eve/tools";
import { readFile } from "eve/tools/read_file";

import { getComputerSandbox, requireComputerCapability } from "../lib/computer-context.ts";

export default defineTool({
  ...readFile,
  description: `${readFile.description} This reads the agent's isolated sandbox, not the owner's Mac. A local Mac path or chat consent does not make that file available here; local files require an enabled local-computer connection or an upload.`,
  async *execute(input, ctx) {
    await requireComputerCapability(ctx, "files.read");
    const result = await readFile.execute(input, { ...ctx, getSandbox: () => getComputerSandbox(ctx) });
    if (Symbol.asyncIterator in result) yield* result;
    else yield result;
  },
});
