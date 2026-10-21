# Expired or replaced permit before Alpha dispatch

This procedure handles an External Alpha authority that remains ISSUED after its exact MissionControl permit expires or is replaced. It uses existing owner controls and accounting. It does not refresh, replace, delete or backfill the authority's retained ISSUE permit.

Read the canonical Work, authority, allowance and ISSUE/DISPATCH custody for the exact owner. If the authority is DISPATCHING, CONSUMED or UNKNOWN, use the existing Factory stop/reconciliation path for its original request. Do not infer that it was unsent from a missing response or elapsed time. Keep UNKNOWN exposure reserved until authoritative reconciliation establishes its disposition.

For a still-ISSUED authority, the canonical MyEve Factory stop action transitions that exact authority to CANCELLED without contacting Factory. Alternatively, the existing expiry sweep transitions a genuinely expired unsent authority to EXPIRED. Preserve the authority, signed document, permit, receipt, allowance and all audit records. Stopping the Work is not evidence that money has been released: read the canonical accounting afterward and preserve any retained charge. Never manually edit central reservations or reset consumed attempt counts.

There is exactly one Alpha authority per `(owner_id, work_id)` in migration 0086. A Work generation bump cannot mint a replacement authority for that Work. If another attempt is needed, prepare a **new canonical Work** and bind it to the same Mission through a new explicit MissionControl approval and WorkOrder revision. It must independently satisfy the current policy window, existing cohort and owner ceilings, source/FactoryVersion pins, capability policy, and all original admission rules. It receives its own immutable authority and permit custody. The cancelled Work remains historical evidence.

Do not automatically create or dispatch that replacement. An exhausted ceiling, unresolved exposure, expired installation policy, missing permission or unqualified Factory blocks the replacement. Real paid execution uses the existing authorization envelope; this runbook grants no additional budget or attempt. Preserve the refusal and include any required authority change in the consolidated operator request.

After the authorized stop/reconciliation, verify that the original exact authority remains terminal, its immutable ISSUE binding is unchanged, no DISPATCH binding was invented, and accounting readback still agrees with retained history. A retry of the old Work must not silently switch to a newer permit.
