import {handleFactoryRequest} from '@/lib/engineering/factory-api';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return handleFactoryRequest(request,(await context.params).id);}
export async function POST(request:Request,context:Context){return handleFactoryRequest(request,(await context.params).id);}
