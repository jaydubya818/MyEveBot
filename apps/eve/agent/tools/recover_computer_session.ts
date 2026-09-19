import {defineTool} from "eve/tools";
import {z} from "zod";
import {denyUnqualifiedExecutor} from "../lib/unqualified-executor.ts";
export default defineTool({
  description:"Computer recreation is blocked pending exact target qualification. Inspect the existing session instead.",
  inputSchema:z.object({priorSessionId:z.string().startsWith("computer_")}),
  async execute(_input,ctx){return denyUnqualifiedExecutor(ctx,"computer.session.create");},
});
