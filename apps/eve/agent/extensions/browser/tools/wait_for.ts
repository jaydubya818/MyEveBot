import { defineTool } from "eve/tools";
import { wait_for } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...wait_for,
  async execute(input,ctx) {
    return executeBrowserAction("wait_for",input as Record<string,unknown>,ctx);
  },
});
