# Telegram owner-channel companion qualification

## Verdict

**INCOMPLETE. Execution remains disabled. Live Telegram scenarios: 0.**

This is a local MyEve companion draft for Relay's Telegram private-beta branch. It is not a qualified release. `OWNER_CHANNEL_RELEASE_QUALIFIED` remains false. Setting `MYEVE_RELAY_OWNER_ENABLED=true` cannot enable it. The built endpoint was probed locally and returned HTTP 503 with `OWNER_EXECUTOR_NOT_QUALIFIED`.

## Source and isolation

- Companion branch: `codex/telegram-owner-integration`.
- Base: `396631afa4739e5ca8ac0c5c81781f82f3160403`.
- Relay published checkpoint: `6fc769db1a95a31417f6b6d93a1684cf4240a184`, branch `feat/relay-v2-telegram-private-beta`.
- Original MyEve checkout advanced independently to `38dc7281659b025f02b89edb138d38763b516955` during this work. It was not modified by this task. Its memory/chat fixes must be incorporated and retested before combining this companion branch. Both branches touch `action-context.ts` and executor inventory.
- Migration **0030_owner_channel_handoff** follows existing **0029_routine_admission**. The schema version constant and migration checker were updated. No existing migration was rewritten.

## Implemented boundaries

The new projection references canonical `task_runs`, `agents`, approvals, Actions, receipts and Outcomes. It does not introduce a second execution or approval authority model.

1. A strict Ed25519 envelope pins environment, audience, signing key, scope, nonce, lifetime and complete Work Request hash. Mapping to a local owner and selected Agent must be explicit and unique. Federation claims and web cookies are not accepted at this endpoint.
2. Run admission, source projection and START command identity are atomic. Replayed nonces, changed Work Requests and command-ID reuse with different work fail closed. STATUS does not admit a Run.
3. An at-most-once dispatch marker binds one Eve session and one turn to the canonical Run. A second session/turn is denied. A scheduled handler revisits admitted work; ambiguous dispatch is observed, never resent.
4. Short-lived internal credentials distinguish execution, observation and cancellation. Route checks constrain them to the recorded session and operation. Context Assembly runs through the existing persistent-Agent instruction hook, with no primary-Agent fallback for this ingress.
5. The existing private pending-send table holds the exact saved Action. Approval continuation calls canonical `decideApproval` and `ActionGateway`, without another model turn. Expired channel approvals cannot silently regenerate.
6. Canonical completion now atomically records Run transition, milestone and Outcome. Repeated approval handling returns the same Action/result without a second effect or Outcome.
7. Existing `ActionRecovery` performs provider inspection or labelled owner attestation. Recovery decisions never automatically resend. Provider verification is not conflated with owner attestation.
8. MyEve source revocation cancels its nonterminal Runs. Gateway and provider boundaries recheck local revocation, release gate, active Agent, approval, budgets and exact target. Cooperative Eve cancellation is separately recorded; in-flight provider ambiguity retains canonical recovery evidence.
9. Model usage is recorded; unknown usage denies later execution. A database reservation caps channel Action starts at twelve. Expired replay nonces are cleaned in bounded batches after a day; canonical evidence is retained.

The change touches shared auth, task-ledger, Context Assembly binding, Action construction, Action Gateway, pending-send facade and Run completion because identity and continuation must be enforced at those existing boundaries. Email remains the only production continuation adapter connected at the new endpoint. A harmless file adapter is used only in qualification fixtures.

## Evidence and limits

- Full MyEve Vitest regression run: **586 passed / 82 files**, including **14** real-PostgreSQL owner-channel scenarios and **4** transport-scope unit tests.
- Real database scenarios use all ordered migrations in isolated schemas on loopback PostgreSQL port 55447. They cover signed admission, command identity reuse, duplicate/restarted dispatch, exact approval, one effect/Outcome, wrong owner/Agent, changed payload, expiration, rejection, recovery without resend, source revocation, unknown cost, Action limit and release-gate revocation immediately before transmission.
- The dispatch scenario uses a **synthetic Eve session/model and harmless provider** with real canonical database services. Its research/draft/effect counts are 1/1/1 after replay. It does not prove real model behavior, Context Assembly disclosure, provider execution or live Telegram.
- TypeScript: PASS. Migration ordering: 30 validated. Local Next production build: PASS after allowing its existing public Google Font fetches. No deployment was performed.
- Executor inventory: **524 classified sources / UNKNOWN=0**. Fingerprints cover these reviewed changes; inventory classification is not release qualification.

Reproduce with a disposable PostgreSQL cluster bound to `127.0.0.1:55447`, using the current OS database user. The integration test ignores DATABASE_URL and environment files, creates a unique schema, and drops that schema afterward:

```sh
MYEVE_OWNER_CHANNEL_TESTS=1 ../../node_modules/.bin/vitest run
node node_modules/typescript/bin/tsc --noEmit
node scripts/migrate-database.ts --check
node --import tsx scripts/check-executor-governance.ts
node ../../node_modules/next/dist/bin/next build --webpack
```

## Remaining release blockers

These are code/qualification gaps, not a request for credentials:

- Relay's lost-START reconciliation must distinguish authenticated non-admission from an unknown outcome. Its current STATUS path can exhaust retries when MyEve never received START.
- Relay pairing/grant revocation still needs durable propagation into the MyEve cancellation/source-revocation path. MyEve-local revocation tests do not qualify cross-runtime revocation.
- Qualify actual Eve dispatch, session observation after host restart, scheduled wake-up, cancellation and cleanup. Component tests do not prove installed-framework behavior.
- Enforce/qualify per-call model token/spend reservation and all tool-call bounds. Post-step accounting and the guarded-Action count alone do not prove the advertised complete model budget.
- Approval waiting must preserve bounded active execution time without treating human waiting as fresh execution budget. The existing absolute Run deadline currently remains in force.
- Qualify complete Context Assembly owner/Agent isolation, exact safe approval presentation, callback acknowledgement/expired controls, provider result return and delivery across both repositories.
- Perform cross-repository migration/upgrade and deployment-readiness qualification on the final combined heads; reconcile Relay's separately documented 0021 branch collision.
- Only after code readiness: owner-authorized dedicated bot setup, secure host configuration, interactive provider authentication if required, and consequential live-test approval. Never paste credentials into chat.

## Security review

The security-sentinel review checked strict input parsing, signed request boundaries, parameterized SQL, source/owner/Agent binding, replay protection, transport-operation scope and sensitive-data handling. No secrets or real owner data were introduced; tests generate ephemeral keys and use synthetic values. The endpoint returns generic errors and does not log request payloads or credentials. CSRF cookies are not authority for this signed endpoint. No HTML rendering was added.

**High-priority release blockers:** cross-runtime revocation, pre-dispatch budget proof and actual runtime recovery qualification remain unresolved as listed above. The immutable false release gate keeps the draft unavailable. No claim of complete OWASP coverage or a fresh MyEve dependency audit is made.
