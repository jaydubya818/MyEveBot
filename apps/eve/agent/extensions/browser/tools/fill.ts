import { defineTool } from "eve/tools";
import { fill } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...fill,
  async execute(input,ctx) {
    return executeBrowserAction("fill",input as Record<string,unknown>,ctx);
  },
});
