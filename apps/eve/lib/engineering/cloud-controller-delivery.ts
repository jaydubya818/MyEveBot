import {z} from 'zod';
export const cloudControllerTopic='sofie-cloud-work-v1';
export const productionCanaryControllerTopic='sofie-production-canary-v1';
export const productionValidationControllerTopic='sofie-production-validation-v1';
export const controllerMessageSchema=z.object({schemaVersion:z.literal(1),commandId:z.string().uuid(),deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),expiresAt:z.number().int().positive(),tick:z.number().int().min(0).max(60)}).strict();
export type ControllerMessage=z.infer<typeof controllerMessageSchema>;
/** Delivery carries a wakeup only. The stored command/Work supplies all authority.
 * Schedule recovery before executing so a process death cannot strand a writer.
 * Both duplicate delivery and the recovery delivery use the same database lock. */
export async function consumeControllerDelivery(payload:unknown,metadata:{topicName:string;region:string},deploymentId:string,
 dependencies:{now:()=>number;send:(message:ControllerMessage)=>Promise<unknown>;run:(message:ControllerMessage)=>Promise<void>},topicName=cloudControllerTopic){
 const parsed=controllerMessageSchema.safeParse(payload);
 if(!parsed.success||metadata.topicName!==topicName||metadata.region!=='iad1'||parsed.data.deploymentId!==deploymentId)throw Error('CLOUD_CONTROLLER_DELIVERY_DENIED');
 const message=parsed.data,now=dependencies.now();
 if(message.expiresAt<=now)return;
 if(message.expiresAt>now+600_000)throw Error('CLOUD_CONTROLLER_DEADLINE');
 // The final delivery still reconciles the same attempt; it never starts a fresh one.
 if(message.tick<60&&message.expiresAt>now+10_000)await dependencies.send({...message,tick:message.tick+1});
 await dependencies.run(message);
}
