import { defineTool } from "eve/tools";
import { read } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...read,
  async execute(input,ctx) {
    return executeBrowserAction("read",input as Record<string,unknown>,ctx);
  },
});
