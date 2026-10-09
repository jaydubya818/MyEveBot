# First-message context qualification

The failing clean-owner request was “Add a Low / Medium / High Priority field to Alpha Tasks.” The isolated runner used the real Eve session, authenticated owner, context assembly, model wrapper, tools and PostgreSQL contracts. Only provider transport/output and signed Factory responses were synthetic. No paid model ran.

## Measured cause

The initial serialized `{prompt, tools}` was **71,425 UTF-8 bytes**. The system text was 55,922 bytes; the complete serialized prompt was 56,767 bytes; the 13 available, allowed tool definitions were 14,638 bytes. JSON object framing accounts for the remaining bytes. The optional framework Skills advertisement alone was 28,988 bytes. It advertised 79 installed Skills even though external alpha does not permit `load_skill`.

Other irrelevant contributions included computer procedures (3,158 bytes), delegation and Role Pack inventory (3,702), installed-Skills procedures (1,379), Jev evaluation (1,195), Knowledge procedures (959), local-Mac setup and procedures (2,339), plus optional payment and connection instructions. These measurements describe this synthetic request, not universal prompt sizes.

The dispatch bound is **32,000 serialized bytes**, not tokens. Output remains capped at **1,024 tokens**. Reservation still conservatively treats serialized bytes plus 1,024 framing bytes as input tokens, uses current approved pricing, and reserves before dispatch. The framework's existing 200,000-token estimate covers its unfiltered catalog; it is not alpha spending or dispatch authority. Lowering that estimate to 32,000 triggered forbidden auxiliary compaction before the alpha projection, so the existing estimate is retained. Paid compaction remains denied.

## Changes and retained policy

Optional authored procedures are omitted at instruction assembly for external-alpha installations. The authenticated Agent's identity, custom instructions, owner/thread/Work binding, current Work truth, criteria and authority context remain. An explicit alpha system policy preserves no-fallback/no-publication rules, exact authorization, budget/deadline checks, untrusted-data boundaries and the distinction between private verification and accepted completion.

Eve 0.66.3 lacks a runtime omission mechanism for static Skills. A narrow provider-boundary adapter matches only the complete known advertisement reconstructed from the existing installed catalog. It requires exact content and framework block boundaries, rejects duplicate matches, and leaves unfamiliar content untouched. A single trailing description newline is permitted only for the existing evidence-driven-testing package. Eve is pinned to 0.66.3. User messages, historical messages, mandatory system text and retained tool schemas are not truncated or summarized by this adapter.

An authenticated selected-Work conversation exposes only its Work, Factory and owner-question schemas. Agent/Goal management remains available in ordinary conversations. This reduces optional context and grants no new tool or execution authority.

Oversized requests, custom policy, tool responses or history still fail closed before pricing, reservation or provider dispatch. The UI offers a new conversation and explains how to reopen saved Work; it does not invite a blind retry of the same oversized request.

Independent review identified that Eve skips failed dynamic-instruction resolvers. Model admission now also requires the complete alpha policy, literal current Agent instructions and a digest binding the successfully assembled Agent policy to the authenticated owner, session, turn and selected Work. It checks system-role content before pricing and again against the current Agent before dispatch. Missing assembly, stale turn context, policy present only in user text, and policy changed during reservation all fail closed. The binding is an integrity check for assembly, not execution authority.

A fresh browser run then reproduced that safe denial when first-message execution beat the browser's thread-metadata save. Run binding now inserts the missing owner-bound conversation row with `ON CONFLICT DO NOTHING` before its existing conditional binding and verification. Existing owners, Agents, Roles and metadata cannot be overwritten. A real PostgreSQL regression covers first binding, replay and conflicting owner/Agent/Role rejection.

## Evidence

The final actual first request reached the deterministic provider at **24,930 bytes**; its canonical Work creation reply reached it at **28,702 bytes**, including the current-policy binding. The harness checks that the complete mandatory alpha policy reaches the provider. Regression coverage includes large Unicode input, mandatory policy retention, missing/stale/changed policy, oversized schemas/history, altered/appended/reordered/duplicated catalogs, version pinning, selected-Work schema narrowing, non-alpha instruction retention and reconnect error recovery.

The composed journey and final exact-commit qualification are reported separately. First-message success does not establish execution, acceptance, production installation compatibility or release readiness.
