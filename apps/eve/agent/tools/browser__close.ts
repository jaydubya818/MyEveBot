import { defineTool } from "eve/tools";
import { close } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../lib/browser-action.ts";

export default defineTool({
  ...close,
  async execute(input,ctx) {
    return executeBrowserAction("close",input as Record<string,unknown>,ctx);
  },
});
