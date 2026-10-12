import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { canonicalPermitJson, type OwnerEnrollment } from './execution-permit.ts';
const id=z.string().min(1).max(200),time=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const resultRequestSchema=z.object({schema:z.literal('mc-result-request/v1'),connectionId:id,installationId:id,ownerId:id,projectId:id,
  permitId:id,commandId:id,challenge:z.string().regex(/^[a-f0-9]{64}$/),issuer:id,audience:id,issuedAt:time,expiresAt:time}).strict();
export type ResultRequest=z.infer<typeof resultRequestSchema>;
export function readbackSignature(document:unknown,domain:'mc-result-request/v1'|'mc-result-readback/v1',secret:string) {
  return 'sha256='+createHmac('sha256',secret).update(domain+'\n'+canonicalPermitJson(document)).digest('hex');
}
export function authenticateResultRequest(value:unknown,enrollment:OwnerEnrollment,secret:string,now=Date.now()):ResultRequest {
  const packet=z.object({document:resultRequestSchema,signature:z.string().regex(/^sha256=[a-f0-9]{64}$/)}).strict().safeParse(value);
  const deny=():never=>{throw Error('MISSIONCONTROL_RESULT_ACCESS_DENIED');};
  if(!packet.success||secret.length<32||!Number.isSafeInteger(now))return deny();
  const request=packet.data.document;
  if(request.issuedAt>now||request.expiresAt<=now||request.expiresAt<=request.issuedAt||request.expiresAt-request.issuedAt>30000
    ||enrollment.revokedAt!==null||enrollment.activeFrom>now||enrollment.expiresAt<=now)return deny();
  for(const field of ['connectionId','installationId','ownerId','projectId','issuer','audience'] as const)
    if(request[field]!==enrollment[field])return deny();
  const expected=readbackSignature(request,'mc-result-request/v1',secret);
  if(!timingSafeEqual(Buffer.from(expected),Buffer.from(packet.data.signature)))return deny();
  return request;
}
