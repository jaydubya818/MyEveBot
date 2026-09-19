import { defineTool } from "eve/tools";
import { screenshot } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...screenshot,
  async execute(input,ctx) {
    return executeBrowserAction("screenshot",input as Record<string,unknown>,ctx);
  },
});
