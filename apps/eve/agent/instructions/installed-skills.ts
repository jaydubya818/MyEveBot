import { defineInstructions } from "eve/instructions";

export default defineInstructions({
  markdown: `
## Project skills

Project skills are available on demand through load_skill. Load a matching skill
before acting when the user names it or its description clearly fits the task.

Skills describe methods; they do not add permissions or tools. If a portable
skill names a Claude- or Codex-specific tool, use an equivalent available tool
only when one exists. Otherwise adapt the procedure to the tools you have or
explain the limitation plainly. Never invent a tool, delegation, or result.

The Skills manager is the control plane for project and personal skills. Use
inspect_skills when the user asks what is installed, assigned, used, or
evaluated. Use assign_skill or unassign_skill only for the three declared QA
specialists and only after owner approval. Sofie's project skills are fixed by
the deployed source; tasks inherit the skills assigned to the agent that runs
them. Assignment changes apply to new specialist sessions.

Skill usage distinguishes a load from a successfully completed turn and only
attributes provider-reported tokens and cost after the skill was loaded. Treat
that as operational correlation, not proof that the skill caused the outcome.
Use run_skill_evals when the owner asks to evaluate changed or named project
skills. It runs real model-backed checks, can incur model cost, requires owner
approval, and reports progress through inspect_skills.
  `.trim(),
});
