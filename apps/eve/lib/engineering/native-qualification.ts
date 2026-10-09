import { z } from "zod";

export const NATIVE_PROVIDER = { id: "myeve-native-sofie", version: 1 } as const;
/** Operator-reviewed qualification is independent of an owner's Work delegation.
 * This record may only come from trusted server configuration, never an API/tool argument. */
export const nativeQualificationSchema = z.object({
  provider: z.object({ id: z.literal(NATIVE_PROVIDER.id), version: z.literal(1) }).strict(),
  modelId: z.string().regex(/^anthropic\/claude-[\w.-]+$/),
  scopeId: z.string().min(1), profileHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceRef: z.string().min(1).max(400),
  qualifiedAt: z.string().datetime({ offset: true }), expiresAt: z.string().datetime({ offset: true }),
}).strict();
