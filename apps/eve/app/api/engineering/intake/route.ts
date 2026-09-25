import { handleExecutionRequest } from "../../../../lib/engineering/execution-api.ts";
export const POST=(request:Request)=>handleExecutionRequest(request);
