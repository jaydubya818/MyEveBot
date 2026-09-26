# Native Sofie host implementation and qualification — 2026-09-26

**Native component/live synthetic trace: PASS. Full M1/ER1/ER2 release qualification: PARTIAL / NOT QUALIFIED.**

This continues the [Deep Agents spike](../2026-09-26-deepagents-spike/README.md) on `codex/digital-worker-mvp`, starting at `23d992e`. The native host is distinct from the experimental Deep Agents SDK provider. Neither provider is enabled in deployed configuration. The attached architecture illustration is a target description, not evidence of completion or new permission.

## Implemented path

- Concrete trusted route authority reads current owner Work, active primary Agent, exact profile/base, qualification, budget and writer state. Admission binds the Agent revision, configuration hash, Work version/generation and original deadline. Owner selection cannot qualify a provider; API/tool input cannot supply policy or qualification.
- Owner-authenticated admission API and Work button. The selected primary-Agent chat can use the same admission service through its guarded tool. Native source mutations require the admitted writer session and current authority, then a narrowing Action Gateway and single-use action/provider handles. No publishing or Ready operation is exposed.
- A native model wrapper restricts tools/context, reads current pricing, reserves conservative cost durably before one provider call and retains its result before exposure. Exact completed requests replay without another call. Concurrent writers, changed requests, unknown usage and interrupted in-flight calls are fenced. Reservations are not automatically refunded or taken over.
- A provider-compatible object envelope preserves strict operation-specific required fields. Live Gateway responses sometimes wrapped otherwise valid arguments as `rawInvalidInput`; only an exact object passing the local schema is recovered. Missing revisions, coercions and extra authority fields remain invalid.
- Migration 0050 adds native session/spend custody, retained model calls and immutable independent results. Database readiness now requires 0050. The separate verifier retains a versioned Proof of Work and reconciles already-written evidence after restart without rerunning the candidate. Successful local checks produce **PARTIAL**, not Ready.
- Work and Chat share the retained native result, evidence hashes, model spend and uncertainty state. The Work screen distinguishes local evidence from unverified publication/CI/review/acceptance.

The change crosses routing, model execution, tool execution, database custody, independent verification and the shared projection because each must enforce the same Work boundary. It adds one native vertical path; it does not activate additional providers or implement later Factory/Relay behavior.

## Observed evidence

| Check | Result and boundary |
|---|---|
| Real model → guarded native actions → independent Docker failure → repair → pass | PASS, synthetic parser, `anthropic/claude-sonnet-5`, eight model calls, two independently checked candidates. The first minimally changed defective candidate is intentional fault injection. |
| Exact failed candidate | `745b57a3ec4545d5cc56cd29518b6974bea81ab0`; immutable outcome FAILED. |
| Exact repaired candidate | `5abfde2168d02a4893a76c455e933815f23d5728`; all six protected checks PASS; immutable outcome PARTIAL. |
| Model spend | Successful attempt $0.071336. Across attempts, known spend plus full uncertain reservations totals $0.686839 against the approved $2 allowance. Infrastructure cost remains uncovered. |
| Resource cleanup | Exact candidate containers and volumes confirmed absent after each successful-attempt verification. No broader zero-leak claim. |
| Native host PostgreSQL boundaries | PASS: qualification denial, admission, changed policy/Agent, pause, competing reservations, single-session custody, replay, uncertainty denial, immutable result and shared projection. Test-only provisional qualification; no deployed grant. |
| Native host process loss | PASS: actual SIGKILL after durable reservation fences further calls; actual SIGKILL after result custody allows exact replay without another reservation. No live transport cancellation or billing-termination claim. |
| Other PostgreSQL integrations | Route admission, direct source custody, protected verifier claim/lease/recovery all PASS against 50 migrations. |
| Authenticated UI | PASS on local Next app with disposable owner/DB and external fetch disabled: password login, denied unqualified admission, retained proof, uncertainty state, desktop and 390px mobile layout. Browser/server/disposable DB cleaned up. No live chat model used in this UI test. |
| App regression | 1,294 passed, 40 skipped across 168 files. |
| Root regression | 151 passed. |
| Type/capability/skill/governance | PASS: 147 capability definitions, 125 authored tools, 93 skill-routing checks, 631 classified executor sources, zero unknown entries. |
| Migration manifest | PASS: 50 ordered migrations; 0050 applied only to disposable local test databases. |

[Full synthetic model/check evidence](live-model-evidence.json), [attempt accounting](qualification-attempts.json) and [source hashes](source-manifest.json) accompany this record. Earlier attempts exposed harness receipt redaction, schema compatibility and Gateway wrapping issues; they were not successful autonomous journeys. The final successful attempt required no between-step human edits or decisions. This is not an adoption/no-babysitting metric for the product.

Provider schema guidance: [Anthropic tool definitions](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools). The additional Gateway wrapper handling is based on the observed live response and strict local validation, not an assumed provider guarantee.

## Remaining work and prerequisites

1. **M1/ER1 authenticated native journey:** run the actual Eve chat/model/tool path with the approved repository and selected Work, then restart the chat session, application and verifier. The live test above calls the native host and Gateway directly; it does not prove the authored web tool or complete Work/Chat parity. Finish the role/JStack/mode behavior comparison and context/retrieval qualification. No production native qualification record has been issued.
2. **Approved source review:** read-only GitHub CLI access is now working. The approved base is still `db5d95cf3d1dadf04a118f38bd5b388a5a226c31`. The exact [five-file manifest proposal](golden-base-manifest-proposal.json) was retrieved; it has not been installed as an approved runtime profile. This removes the earlier inability to retrieve hashes, not the review/qualification gate.
3. **ER2:** the real Deep Agents SDK remains experimental. Bind its host to current authority, durable budget/checkpoint/writer custody; qualify its live model, actual MCP/subagent behavior, cancellation, metering and initiative comparison. Native host evidence does not automatically qualify that adapter. Disabled capabilities stay disabled.
4. **M2/M3:** qualify executor recovery and the real draft PR → failed post-publication CI → repair → independent review → repair → Ready path. The publisher App key is still absent from the named Keychain item. Existing read-only CLI authentication is not substituted for the planned publisher identity. Account-owner App setup/key import remains necessary before this publication test.
5. **M4–M7 / ER3–ER6:** production harness integration, Factory, reciprocal Relay, learning promotion/retrieval, capsule export/import and route handoff/composite proof retain the gates in the approved plan. They are not completed by this tranche.

No production deployment, merge, external Alpha or full-system readiness claim follows from these tests.

## Monitoring and recovery

For isolated dogfood runs, observe native `reserved_microusd`, `spent_microusd`, `inflight`, `usage_unknown`, verifier job status and exact candidate/proof hashes. Unknown model calls or resources require reconciliation; do not clear reservations or retry effects based on elapsed time. A configuration/Agent/Work change must deny subsequent execution while preserving historical evidence. The implementing engineer owns these checks during each qualification run.

Rollback is to leave native qualification absent or disable dogfood mode. Do not delete ledger/proof rows to unblock execution. Migration 0050 is additive; retained proof rows intentionally reject update/delete. Production migration/deployment was not performed.
