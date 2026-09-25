import { defineTool } from "eve/tools";
import { readFile } from "eve/tools/read_file";

import { getComputerSandbox, requireComputerCapability } from "../lib/computer-context.ts";

export default defineTool({
  ...readFile,
  async *execute(input, ctx) {
    await requireComputerCapability(ctx, "files.read");
    const result = await readFile.execute(input, { ...ctx, getSandbox: () => getComputerSandbox(ctx) });
    if (Symbol.asyncIterator in result) yield* result;
    else yield result;
  },
});
