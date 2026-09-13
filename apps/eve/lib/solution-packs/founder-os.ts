import type { SolutionPack } from "../solution-packs.ts";

export const FOUNDER_OS_SOLUTION_PACK: SolutionPack = {
  id: "founder-os",
  name: "Founder OS",
  description: "A focused operating layer for turning company priorities into visible, evidence-backed progress.",
  intendedFor: "Founders who need a reliable cadence for deciding, executing, communicating, and reviewing work.",
  outcome: "The founder keeps a small set of explicit priorities moving and can see what changed, what is blocked, and what decision comes next.",
  roles: [
    {
      packId: "software-development",
      roleId: "software-product-manager",
      contribution: "Turns product priorities into bounded delivery briefs and acceptance criteria.",
    },
    {
      packId: "general",
      roleId: "researcher",
      contribution: "Builds cited evidence for consequential decisions.",
    },
    {
      packId: "general",
      roleId: "analyst",
      contribution: "Makes assumptions, tradeoffs, and operating signals legible.",
    },
    {
      packId: "general",
      roleId: "writer",
      contribution: "Turns approved source material into clear updates and decision documents.",
    },
    {
      packId: "general",
      roleId: "scheduler",
      contribution: "Prepares approved commitments and follow-ups without silently scheduling them.",
    },
  ],
  capabilityRecommendations: [
    {
      capabilityId: "goals.operating-system",
      purpose: "Maintain goals, plans, tasks, dependencies, outcomes, and explainable next actions.",
    },
    {
      capabilityId: "notification.review-delivery",
      purpose: "Optionally deliver owner-configured review checkpoints through existing approval controls.",
    },
    {
      capabilityId: "scheduler.automations",
      purpose: "Optionally schedule commitments only after the owner approves them.",
    },
  ],
  checkpoints: [
    {
      id: "daily-focus",
      name: "Daily focus",
      description: "Review the highest-priority unblocked work and let the founder choose the day’s commitments.",
      recommendedCapabilityIds: ["goals.operating-system"],
    },
    {
      id: "weekly-review",
      name: "Weekly review",
      description: "Review evidence, outcomes, stalled work, and upcoming risks before priorities are changed.",
      recommendedCapabilityIds: ["goals.operating-system", "notification.review-delivery"],
    },
    {
      id: "approved-follow-through",
      name: "Approved follow-through",
      description: "Prepare reminders for explicit commitments; scheduling remains subject to owner approval.",
      recommendedCapabilityIds: ["scheduler.automations"],
    },
  ],
  guardrails: [
    "Viewing this pack creates no Agent, schedule, task, or run.",
    "Role and capability recommendations grant no execution authority.",
    "The founder retains strategy, product, spending, publishing, and external-action authority.",
    "Persistent Agents must be created separately through the existing editable, capability-checked flow.",
  ],
  tags: ["founder", "operating-system", "priorities", "reviews"],
};
