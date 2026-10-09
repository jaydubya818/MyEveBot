---
name: campaign-research-brief
description: "Use when the owner wants to research a market, develop evidence-backed campaign angles, or create a campaign brief for review."
metadata:
  owner: myeve
  risk: low
  user-invocable: "true"
---

# Campaign Research → Brief

Use the Marketing Engineering Role Pack through the existing Goal, Role, Knowledge, file, evidence, approval, and outcome primitives. Do not create a separate campaign database, knowledge store, or Agent type.

## Required references

Read only the references needed for the current stage:

- `references/workspace-instructions-template.md` for source authority and storage rules.
- `references/shared-knowledge-template.md` when gathering or creating company, customer, offer, positioning, voice, and proof context.
- `references/research-record-template.md` before recording research.
- `references/campaign-brief-template.md` before drafting angles or the brief.
- `references/verification-checklist.md` before declaring the package ready.
- `references/campaign-workspace-template.md` when a campaign Workspace or project seam is needed.

## Workflow

1. Understand
   - Confirm the marketing Goal, company, customer, offer, positioning, voice, proof, constraints, budget, and previous results.
   - Identify which source is authoritative for each item. Structured MyEve Knowledge remains authoritative where it exists; Markdown is a readable, portable representation rather than a second truth store.
   - If required context or a material decision is missing, state exactly what is missing and stop the dependent work. Do not invent it.

2. Research
   - Research the market, competitors, customer conversations, search demand, relevant creative and channels, and previous performance as applicable.
   - Prefer primary sources. Record every material finding with its source, observed date, confidence, campaign relevance, and status.
   - Label each statement as evidence, assumption, hypothesis, or recommendation.

3. Plan
   - Use the Product Marketer role to develop exactly three campaign angles unless the owner requests another count.
   - Each angle must include its name, target audience, core message, supporting evidence, why it may work, difference from previous work, relevant objection, assumptions, and risks.
   - Produce the Campaign Brief using the reference template. Make parallel work, dependencies, blockers, readiness, budget, approval points, and measurement explicit.

4. Verify
   - Run every deterministic check first, then each judgment-based review.
   - Claims must match current approved proof. Flag unverified, expired, or contradicted claims rather than softening the status.
   - Keep marketing judgment separate from the existing Functional & State, UX & Accessibility, and Trust & Resilience product-QA specialists. If a real page or form is later implemented, route technical QA through that existing workflow.

5. Approve
   - End with the status `Ready for Owner Review` and list the exact owner decisions still required.
   - Stop before publishing, sending, launching ads, changing budgets, purchasing, scheduling external communication, or modifying a live production page. A Role recommendation never grants authority; Relay is authoritative.

## Learning boundary

After results exist, propose Facts, Observations, Insights, Hypotheses, Decisions, playbook updates, examples, or customer-knowledge updates with supporting evidence. Never silently rewrite standing instructions or promote campaign-scoped findings into shared Knowledge.
