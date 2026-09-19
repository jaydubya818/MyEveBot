import { defineTool } from "eve/tools";
import { scroll } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...scroll,
  async execute(input,ctx) {
    return executeBrowserAction("scroll",input as Record<string,unknown>,ctx);
  },
});
