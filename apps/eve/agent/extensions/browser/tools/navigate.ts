import { defineTool } from "eve/tools";
import { navigate } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...navigate,
  async execute(input,ctx) {
    return executeBrowserAction("navigate",input as Record<string,unknown>,ctx);
  },
});
