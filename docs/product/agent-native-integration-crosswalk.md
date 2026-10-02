# Agent-native source integration crosswalk

Dedicated source: codex/agent-native-work-experience. This is a product source candidate, not the canonical integration branch. No production deployment or candidate correction is authorized by this report.

## Source pins

| Repository | Initial canonical main | Reconciled canonical main |
| --- | --- | --- |
| MyEve | 2b22e387c053ba0631efc27c2e8f8a99fff1055e | d75091eb333a531fa91ed9d39e273948aa9d0eaf |
| Relay | a61f0ef697b02cf22da72ff2904c584d7faa026a | unchanged |
| MyFactory | c0b4c1155a6a98f91375163443938042e6a0be10 | unchanged |

The landed MyEve publication readback change is reconciled from canonical main. Grouped Proof references and failed independent-review evidence are retained; failed review is visible inline. No unfinished Q37/Factory/Environment Fabric candidate branch was imported. No migration was allocated.

## Product → canonical contracts

| Product feature | Canonical source | Source integration rule |
| --- | --- | --- |
| Conversation Work association | context_assemblies + agent_runs + owned engineering_work | Exact owner/agent/session/thread association; never event prose or pasted IDs |
| Work/Result/Proof | CanonicalBetaWork projection | Preserve current revision/generation and Result binding |
| Inline owner decision | OwnerPublication view/decide | Same exact candidate/tree/owner approval; no alternate publication endpoint |
| Agent home/configuration copy | agents and existing create/duplicateAgent | Fresh ID; no inherited capability grants, Memory, Work or credentials |
| Routine condition lifecycle | Existing execution_routines, occurrences, task_milestones, review_deliveries | Versioned review; current claim; no alternate scheduler; release gate remains disabled |
| Today/Inbox responsibilities | Existing owned Runs and deliveries | Read only; quiet checks retained without new notification |
| Collaboration evidence | Existing myeve_relay_requests | Metadata/correlation only; no message bus or private payload copy |
| Persistent Groups | Proposed shared schema + per-agent Relay identity mapping | WAITING_FOR_CANONICAL_Q37; no fabricated membership or sender substitution |
| Environment placement | Separate Environment Fabric owner | Consume final qualified contracts; do not implement cloud/provider dispatch here |
| Capsules | Existing canonical capability | Preserve current contracts; no copied implementation |

## Checkpoints

A d589ce459c72d77f8f7148d6d765eb521eed88a1; B 3deb47bcb72319aae7e51948c385fa722687993b; C b5bb9f4ca6eef9ef1f8e4d0dadfa67f31c3b1313; D 7ceaa30593f9ffcf45a6b98db8e797a9e5b143e9; E f66abb1071bc1d48f861ec85a1e4994a8ee75f11; F 666bffdc50786ecf4f2893118ee661509e929a7a. Every checkpoint was pushed and remote SHA verified.

## Outstanding integration gates

1. Natural specialist management remains blocked in canonical manage_agent executor. Preserve its guard until that executor is qualified; existing UI/API persistence does not prove agent-native creation.
2. Routine natural creation/responsible identity, distinct-trigger non-overlap/coalescing and expiry/max-run limits remain incomplete. Proposed overlap invariant needs shared schema/transaction ownership; do not fake it with a process-local lock. Same-trigger deduplication is already covered.
3. Qualified cloud execution and real provider canary require the Environment Fabric owner’s accepted deployment. Its latest report identifies registry/admission/UI work plus VCR/private worker image access. No general cloud claim is made here.
4. Persistent Group identity/membership and governed per-member Relay handoff require the schema/adapter proposal. Real Group canary, second MyEve deployment and external peers remain NOT_RUN.
5. Full email/research/proactive natural journeys remain end-to-end qualification work; existing prototype surfaces are not live evidence.
6. Historical candidate independent review FAIL remains authoritative. Corrections need a new authorized candidate lifecycle; neither UI success nor CI PASS authorizes acceptance, merge or deployment.

Canonical beta integration should inspect the source diff against d75091e, preserve these ownership boundaries and run the same qualification before accepting any portion. This branch does not merge a future execution candidate automatically.
