import {z} from 'zod';
import {WorkError} from './types.ts';
import type {FactoryCommand} from './factory-commands.ts';
const approvalSchema=z.object({workId:z.string().uuid(),version:z.coerce.number().int().positive(),generation:z.coerce.number().int().positive()}).strict();
export type FactoryWorkerApproval=z.infer<typeof approvalSchema>;
/** Activation is not authority to execute arbitrary queued Work. One owner-approved revision only. */
export function factoryWorkerApproval(mode:string,env:NodeJS.ProcessEnv=process.env):FactoryWorkerApproval|null {
 if(mode!=='LIVE')return null;
 const parsed=approvalSchema.safeParse({workId:env.MYEVE_FACTORY_APPROVED_WORK_ID,version:env.MYEVE_FACTORY_APPROVED_WORK_VERSION,generation:env.MYEVE_FACTORY_APPROVED_WORK_GENERATION});
 if(env.MYEVE_FACTORY_REAL_EXECUTION_APPROVED!=='true'||!parsed.success)throw new WorkError('factory_owner_approval','The first real model operation requires explicit approval of one exact Work revision.',403);
 return parsed.data;
}
export function assertFactoryWorkerApproval(approval:FactoryWorkerApproval|null,id:string,input:FactoryCommand) {
 // Owner stop/takeover remains available after a revision changes; it grants no model dispatch.
 if(input.operation==='stop'||input.operation==='takeover')return;
 if(approval&&(id!==approval.workId||input.expectedWorkVersion!==approval.version||input.expectedWorkGeneration!==approval.generation))throw new WorkError('factory_owner_approval','This Work revision is outside the approved real-provider journey.',403);
}
