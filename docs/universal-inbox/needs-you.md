# Needs You semantics

Needs You is the predicate exported by the domain, never a UI guess based on failure, urgency or unread status.

It is true only when the item is NEEDS_ACTION, has an explicit action classified NECESSARY_JUDGMENT, is not internal coordination, and has not expired. Supported reasons are approval, choice, missing information, credential/account action, ambiguous requirement and exception recovery.

Routine status, polling, verification progress, internal coordination, successful completion, retryable failures and waiting for an external reply do not qualify. `workEvent` discards internal/retryable events before creating an owner-facing item. A failure must have a justified owner action from the canonical Work adapter before it can become an EXCEPTION in Needs You.

The action stores the question, allowed responses, expiry where applicable and an exact binding. Approvals additionally contain requested scope, effects, why, canonical approval ID and canonical hash. Inbox requests cannot broaden source permissions.

Avoidable coordination is a separate classification. It stays out of Needs You and is counted as coordination debt in source evidence. It is not hidden by counting only displayed Needs You items. Metrics distinguish accepted necessary interventions from distinct avoidable requests per item/action. Duplicate deliveries do not inflate request counts. Suppressing an avoidable item does not make debt zero.

The multi-source Golden Journey asserts one necessary response and zero avoidable coordination requests. Several internal Work transitions produce no attention items. These are fixture qualifications; live normal Golden Journeys remain unmeasured until canonical Work wiring is available.

Expired actions are removed from Needs You at query time, including without a sweeper. The source reconciliation must then supersede/settle them; the Inbox does not invent a recovery operation. A pending answer stays WAITING during retry or an unknown downstream result. Production integration must route permanent downstream failure through the canonical Work recovery policy and project any genuinely necessary owner action as a new episode.
