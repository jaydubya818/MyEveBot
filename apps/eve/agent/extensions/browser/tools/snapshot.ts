import { defineTool } from "eve/tools";
import { snapshot } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...snapshot,
  async execute(input,ctx) {
    return executeBrowserAction("snapshot",input as Record<string,unknown>,ctx);
  },
});
