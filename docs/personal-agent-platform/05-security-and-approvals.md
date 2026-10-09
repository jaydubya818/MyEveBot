# Security and approvals

## Owner boundary

- Production UI and API access require the signed owner session.
- Unsafe cross-origin mutations fail before parsing or database access.
- Agent tools derive `owner_id` from Eve auth with `SOFIE_OWNER_ID` fallback for trusted application sessions.
- Every Goal OS query includes owner scope; identifiers alone never authorize access.

## Data handling

- Goal descriptions and success criteria may contain personal information and are not logged wholesale.
- Events store bounded summaries and machine-readable rationale facts, not prompts, credentials, cookies, raw provider payloads, or chain-of-thought.
- Capability APIs return the names of missing configuration, never secret values.
- Existing private Blob delivery remains behind owner-scoped application routes.

## Risk and authority

Goal CRUD is generally low-risk and reversible. Creating a Goal does not authorize execution. Sending messages, deleting durable data, spending money, deploying production code, changing accounts, and controlling external systems remain separate actions.

| Stakes / reversibility | Required pattern |
| --- | --- |
| Low / easy to reverse | Apply and record visibly |
| Low / hard to reverse | Quick confirmation |
| High / reversible | Show proposal and explicit apply action |
| High / hard to reverse | Explicit owner approval with durable evidence |

Risk and approval metadata in the capability registry are deterministic defaults. The LLM may explain or request an approval but cannot lower the required level.

## Goal status safeguards

- Completing or abandoning a goal is explicit and audited.
- Archiving is terminal in V1; no hard deletion is exposed.
- A completed task with linked evidence is not silently deleted.
- Dependency mutations reject cycles and cross-goal references.
- Goal completion does not claim external success merely because a model run ended.

## Approval-center boundary

Goal OS V1 does not build the full Approval Center. It prepares stable goal/task/event references that later approval rows can target. Existing QA approval decisions continue unchanged.

## Abuse protection

- Owner endpoints are no-store and authenticated.
- Mutations validate bounded input sizes and known enums.
- Login retains its existing rate limit.
- Goal list/search endpoints use bounded page sizes and indexed owner/status/date fields.
- Future multi-user support requires per-owner rate limiting and legacy-table owner migration before launch.

## Required tests

- anonymous production access and cross-site mutation rejection;
- cross-owner Goal lookup/update rejection;
- invalid transition and dependency-cycle rejection;
- duplicate idempotency-key behavior;
- bounded event payloads and rationale;
- no capability secret values in responses.
