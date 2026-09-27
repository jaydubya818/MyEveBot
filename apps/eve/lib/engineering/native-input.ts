import { z } from "zod";
import { pathSchema } from "./contract.ts";

export const nativeDevelopmentInputSchema = z.discriminatedUnion("operation", [
  z.object({operation:z.literal("inspect")}).strict(),
  z.object({operation:z.literal("read"),path:z.string().min(1).max(240)}).strict(),
  z.object({operation:z.literal("open")}).strict(),
  z.object({operation:z.literal("admit"),expectedWorkVersion:z.number().int().positive(),expectedWorkGeneration:z.number().int().positive()}).strict(),
  z.object({operation:z.literal("plan"),expectedRevision:z.number().int().positive(),plan:z.string().trim().min(1).max(8000)}).strict(),
  z.object({operation:z.literal("write"),expectedRevision:z.number().int().positive(),path:pathSchema,
    content:z.string().max(100_000)}).strict(),
  z.object({operation:z.literal("submit"),expectedRevision:z.number().int().positive()}).strict(),
]);

// Provider APIs require an object root. Nesting the discriminated operation
// preserves its exact required fields without flattening authority-sensitive inputs.
export const nativeDevelopmentToolSchema = z.object({ request: nativeDevelopmentInputSchema }).strict();
