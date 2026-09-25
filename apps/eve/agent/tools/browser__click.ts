import { defineTool } from "eve/tools";
import { click } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../lib/browser-action.ts";

export default defineTool({
  ...click,
  async execute(input,ctx) {
    return executeBrowserAction("click",input as Record<string,unknown>,ctx);
  },
});
