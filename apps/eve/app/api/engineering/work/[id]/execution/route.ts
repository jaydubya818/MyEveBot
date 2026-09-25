import { handleExecutionRequest } from "../../../../../../lib/engineering/execution-api.ts";
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {return handleExecutionRequest(request,(await context.params).id);}
