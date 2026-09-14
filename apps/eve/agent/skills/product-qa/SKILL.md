---
name: product-qa
description: Run the deployed personal agent's evidence-backed local and isolated-preview critical-path self-test with exactly three specialists and Balanced guardrails.
---

# Product QA pilot

Use this skill when the owner asks for the personal-agent self-test, multi-role product QA, or evidence-backed acceptance checks.

## Contract

- Start with `start_product_qa`, using the exact `webThreadId` from client context when present.
- The task is limited to 15 minutes, exactly three distinct specialist roles, 40 aggregate model steps, one product-level retry per role, and $5 estimated cost.
- Run exactly `functional-state`, `ux-accessibility`, and `trust-resilience`. Do not call any other subagent.
- Run the three specialists in the required order, using a separate one-call `Workflow` program for each role. The local sandbox backend has two execution slots and retains every child session until its containing workflow returns, so putting multiple specialists in one workflow can deadlock the later role. Wait for one Workflow result before starting the next. Include the task ID, both target URLs, assigned check slugs, and the prohibition on secrets in each message.
- Retry only when the specialist call itself fails before completing its assigned checks. A completed specialist that reports a genuine failed check is not an execution failure: do not retry it, continue the remaining roles, and let authoritative completion fail on the recorded finding. Never retry a completed specialist and never exceed two attempts for one role.
- The task is read-only QA. Do not modify production data, credentials, configuration, or source code.
- Call `complete_task` only after all three specialist results returned. The server is authoritative and will reject unsupported completion.
- If a guardrail, environment, or required check blocks completion, call `update_task` with `fail` and state the concise reason. Never describe a partial run as completed.

## Required assignments

- `functional-state`: `local-critical-flow`, `preview-critical-flow`
- `ux-accessibility`: `identity-and-navigation`, `responsive-and-keyboard`
- `trust-resilience`: `auth-and-data-boundaries`, `failure-and-recovery`

Each specialist must store at least one artifact for every assigned check with `record_task_evidence`. Prefer a screenshot for visual assertions and a concise Markdown or JSON report for behavioral assertions. Evidence must not contain chain-of-thought, cookies, authorization headers, tokens, passwords, private form values, or connection strings.

## Workflow shape

```js
// Workflow call 1 (wait for it to return)
return await tools["functional-state"]({ message: functionalMessage });

// Workflow call 2 in the next root step (wait for it to return)
return await tools["ux-accessibility"]({ message: uxMessage });

// Workflow call 3 in the next root step (wait for it to return)
return await tools["trust-resilience"]({ message: trustMessage });
```

After completion, summarize status, checks passed/failed, evidence count, elapsed time, model steps, estimated cost, and any next action. Keep the summary factual; do not expose hidden reasoning.
