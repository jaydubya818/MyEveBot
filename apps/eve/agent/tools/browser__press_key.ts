import { defineTool } from "eve/tools";
import { press_key } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../lib/browser-action.ts";

export default defineTool({
  ...press_key,
  async execute(input,ctx) {
    return executeBrowserAction("press_key",input as Record<string,unknown>,ctx);
  },
});
