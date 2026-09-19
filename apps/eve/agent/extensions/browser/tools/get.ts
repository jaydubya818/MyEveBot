import { defineTool } from "eve/tools";
import { get } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...get,
  async execute(input,ctx) {
    return executeBrowserAction("get",input as Record<string,unknown>,ctx);
  },
});
