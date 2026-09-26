import { z } from "zod";
import { compositionSchema, executionRouteSchema } from "./contracts.ts";

/** These manifests describe behavior and context. They are never policy grants. */
export const rolePackSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  role: z.string().min(1),
  recommendedRoutes: z.array(executionRouteSchema),
  verificationGuidance: z.array(z.string().min(1)),
}).strict();

export const capabilityPackSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  skillRefs: z.array(z.string().min(1)),
  contextGuidance: z.array(z.string().min(1)),
}).strict();

export const modeSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  initiative: z.enum(["normal", "high"]),
  planning: z.enum(["guided", "autonomous"]),
  routineRecovery: z.enum(["guided", "autonomous"]),
  humanInterruptions: z.enum(["normal", "minimize"]),
  scopeExpansion: z.literal("escalate"),
  authorityChanges: z.literal("escalate"),
  irreversibleActions: z.literal("escalate"),
}).strict();

export const SOFTWARE_ENGINEER_ROLE_V1 = rolePackSchema.parse({
  id: "software-engineer",
  version: 1,
  name: "Software Engineer",
  role: "software-engineer",
  recommendedRoutes: ["DIRECT", "HUMAN"],
  verificationGuidance: [
    "Define observable acceptance criteria before editing.",
    "Retain the candidate before replacing its execution environment.",
    "Use independent, revision-bound evidence before proposing completion.",
  ],
});

export const JSTACK_CAPABILITY_PACK_V1 = capabilityPackSchema.parse({
  id: "jstack",
  version: 1,
  name: "JStack",
  skillRefs: ["code-structure", "evidence-driven-testing", "fix-ci", "make-pr-easy-to-review"],
  contextGuidance: [
    "Prefer repository-local conventions and source-linked decisions.",
    "Separate implementation evidence from independent verification.",
  ],
});

export const POTATO_MODE_V1 = modeSchema.parse({
  id: "potato-mode",
  version: 1,
  name: "/potato-mode",
  initiative: "high",
  planning: "autonomous",
  routineRecovery: "autonomous",
  humanInterruptions: "minimize",
  scopeExpansion: "escalate",
  authorityChanges: "escalate",
  irreversibleActions: "escalate",
});

export const ENGINEERING_COMPOSITION_V1 = compositionSchema.parse({
  role: { id: SOFTWARE_ENGINEER_ROLE_V1.id, version: SOFTWARE_ENGINEER_ROLE_V1.version },
  capabilityPacks: [{ id: JSTACK_CAPABILITY_PACK_V1.id, version: JSTACK_CAPABILITY_PACK_V1.version }],
  mode: { id: POTATO_MODE_V1.id, version: POTATO_MODE_V1.version },
});
