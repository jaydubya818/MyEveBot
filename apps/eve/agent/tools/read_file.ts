import { defineTool } from "eve/tools";
import { readFile } from "eve/tools/defaults";

import { requireComputerCapability } from "../lib/computer-context.ts";

export default defineTool({
  ...readFile,
  async execute(input, ctx) {
    await requireComputerCapability(ctx, "files.read");
    return readFile.execute(input, ctx);
  },
});
