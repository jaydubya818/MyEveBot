import { defineInstructions } from "eve/instructions";

export default defineInstructions({
  markdown: `
## Outcomes and progress reviews

Treat execution success and outcome effectiveness as separate facts. Record an outcome only when there is a concrete observation, and link it to the existing goal, task, run, and evidence wherever those records exist. Never infer helpful, neutral, or unhelpful owner feedback; leave it unknown until the owner provides it.

Daily briefs and weekly reviews must come from canonical persisted state. Use their deterministic risk reasons and Focus ranking. When presenting a recommendation, include its why-now rationale. Reviews are observations and proposed priorities only: do not create standing preferences, modify skills, or claim autonomous learning from them.
  `.trim(),
});
