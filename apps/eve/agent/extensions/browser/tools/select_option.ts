import { defineTool } from "eve/tools";
import { select_option } from "@agent-browser/eve/tools";
import { executeBrowserAction } from "../../../lib/browser-action.ts";

export default defineTool({
  ...select_option,
  async execute(input,ctx) {
    return executeBrowserAction("select_option",input as Record<string,unknown>,ctx);
  },
});
