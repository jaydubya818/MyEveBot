import { defineTool } from "eve/tools";
import { find } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...find,
  async execute(input,ctx) {
    return executeBrowserAction("find",input as Record<string,unknown>,ctx);
  },
});
