import { z } from 'zod';

export const capabilityCommandSchema = z.object({
  requestId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  capabilityId: z.string().min(1).max(100),
  operation: z.enum(['enable', 'disable', 'pause', 'revoke', 'set_budget']),
  limitMicros: z.number().int().min(0).max(1_000_000_000_000).optional(),
}).strict().superRefine((input, ctx) => {
  if ((input.operation === 'set_budget') !== (input.limitMicros !== undefined))
    ctx.addIssue({ code: 'custom', message: 'A budget amount is required only for set_budget.' });
});
export type CapabilityCommand = z.infer<typeof capabilityCommandSchema>;
export type ControlState = 'PAUSE_REQUESTED' | 'REVOKE_REQUESTED';
export interface CapabilityReceipt {
  requestId: string;
  revision: number;
  capabilityId: string;
  operation: CapabilityCommand['operation'];
  status: 'SAVED' | 'PENDING_BACKEND';
  existingWork: 'PRESERVED' | 'CONTROL_REQUESTED';
}
export class CapabilityError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); }
}
export interface CapabilityInstallation {
  id: string;
  environment: 'development' | 'qualification';
}
export interface CapabilityActor { ownerId: string; source: 'settings' | 'sofie' }
