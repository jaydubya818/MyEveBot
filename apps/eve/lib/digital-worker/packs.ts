import { z } from "zod";
import { compositionSchema, executionRouteSchema } from "./contracts.ts";

/** These manifests describe behavior and context. They are never policy grants. */
export const rolePackSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  role: z.string().min(1),
  source: z.string().min(1),
  compatibleCapabilityPacks: z.array(z.string().min(1)),
  recommendedRoutes: z.array(executionRouteSchema),
  contextGuidance: z.array(z.string().min(1)),
  verificationGuidance: z.array(z.string().min(1)),
  escalationGuidance: z.array(z.string().min(1)),
  evaluationCriteria: z.array(z.string().min(1)),
}).strict();

export const capabilityPackSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  source: z.string().min(1),
  skillRefs: z.array(z.string().min(1)),
  contextGuidance: z.array(z.string().min(1)),
  verificationGuidance: z.array(z.string().min(1)),
  evaluationCriteria: z.array(z.string().min(1)),
}).strict();

export const modeSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  source: z.string().min(1),
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
  source: "myeve:apps/eve/lib/digital-worker/packs.ts#software-engineer-v1",
  compatibleCapabilityPacks: ["jstack"],
  recommendedRoutes: ["DIRECT", "HUMAN"],
  contextGuidance: [
    "Use the selected Work's current objective, criteria, repository and constraints; mark missing or stale context explicitly.",
  ],
  verificationGuidance: [
    "Define observable acceptance criteria before editing.",
    "Retain the candidate before replacing its execution environment.",
    "Use independent, revision-bound evidence before proposing completion.",
  ],
  escalationGuidance: [
    "Escalate changes to scope, authority, budget, deadline or irreversible effects.",
    "Do not treat a route recommendation or skill as permission to act.",
  ],
  evaluationCriteria: [
    "The candidate satisfies the Work criteria with independent exact-revision checks.",
    "The Result reports limits, cost coverage and human interventions honestly.",
  ],
});

export const JSTACK_CAPABILITY_PACK_V1 = capabilityPackSchema.parse({
  id: "jstack",
  version: 1,
  name: "JStack",
  source: "jaydubya818/skillz@a4bb4914be14f0d529a5b3dd2d09eeb9e93bec16",
  skillRefs: ["code-structure", "evidence-driven-testing", "fix-ci", "make-pr-easy-to-review"],
  contextGuidance: [
    "Prefer repository-local conventions and source-linked decisions.",
    "Separate implementation evidence from independent verification.",
  ],
  verificationGuidance: [
    "Run the repository's relevant checks and preserve their exact revision and output references.",
  ],
  evaluationCriteria: [
    "A reviewer can reproduce the checks and identify the candidate revision.",
  ],
});

export const NORMAL_MODE_V1 = modeSchema.parse({
  id: "normal-mode",
  version: 1,
  name: "Normal",
  source: "myeve:apps/eve/lib/digital-worker/packs.ts#normal-mode-v1",
  initiative: "normal",
  planning: "guided",
  routineRecovery: "guided",
  humanInterruptions: "normal",
  scopeExpansion: "escalate",
  authorityChanges: "escalate",
  irreversibleActions: "escalate",
});

export const POTATO_MODE_V1 = modeSchema.parse({
  id: "potato-mode",
  version: 1,
  name: "/potato-mode",
  source: "myeve:apps/eve/lib/digital-worker/packs.ts#potato-mode-v1",
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
  mode: { id: NORMAL_MODE_V1.id, version: NORMAL_MODE_V1.version },
});
