# Persistent MyApps local integration

Phase 2 extends the qualified deterministic foundation inside MyEve and MyFactory. Production integration remains NOT_RUN. Publication and executable production grants remain disabled. No model calls are made.

## Canonical ownership

- `WorkStore` creates and controls Work. The PostgreSQL admission ledger is subordinate to its exact version, generation, active status and agent. It does not introduce a second lifecycle authority.
- MyFactory's existing admission callback, immutable candidate custody, separate verification process, signed Result and FactoryVersion bind the candidate and trusted runtime source. `appEvidence` projects the verified Result into existing TestEvidence/DiffEvidence envelopes, checked by MyEve's EvidenceProvider validators.
- `UniversalInbox` retains the owner decision. Approval binds owner, Work, candidate digest, proof, app version, operations/capabilities, runtime, target and bounded preview. Verification and preview never install an app. The existing Inbox delivery path delegates only retained app approvals while local integration is enabled.
- The persistent runtime uses MyEve's injected GoalPool. There is no new service, database credential, generated executable or autonomous installation authority.

## Persistence and recovery

Migration 0085 is additive. Owner-scoped tables hold app state, candidate proofs and signed Results, previews, retained installation requests, idempotency receipts, admission snapshots and audit history. Transactions set the owner context and use forced row security. A per-owner lock serializes state transitions with exact Work and Inbox checks. Candidate bytes and audit events are immutable; candidates permit irreversible revocation only.

Installation, grants, data migration, history, receipts and Inbox resolution commit together. Failed updates roll back completely. Retries return a retained result only while its authority remains current. Disabling or revoking clears executable grants and preserves data. Re-enabling requires a current nonrevoked candidate and owner authority.

The supported CRM schema upgrade adds a nullable priority field. A behavior rollback is a newly verified successor, retaining the expanded storage schema and existing data. It does not restore an old database snapshot or silently downgrade data. History includes each accepted version.

## Local UI and agent surface

`/apps/installed` hosts the shared CRM UI through authenticated `/api/myapps` routes. The `installed_apps` Sofie tool resolves the same app and uses the same typed reads and mutations. Neither path has a separate data store. Human installation approval is unavailable to the agent tool. Tool calls refuse guest and delegated/subagent contexts.

A trusted local harness must explicitly call `bindLocalApps({ apps, policy })` after constructing `PersistentApps` with a pool, runtime identity, target, enablement gate and signed-Result verifier. `MYAPPS_LOCAL_INTEGRATION=1` is required. Production NODE_ENV and Vercel always fail closed. There is intentionally no production bootstrap, credential provisioning or deployment activation. The deterministic browser harness also injects an `AppWorkCoordinator` with the existing Factory controller; the native surface only exposes installed-app operations until such a trusted composition is explicitly supplied.

The deterministic request grammar covers initial CRM creation, a priority-field successor, and behavior rollback. This qualifies the end-to-end contracts; it is not a general language model app generator.

## Boundaries

Only allowlisted declarative CRM artifacts run. No arbitrary generated JavaScript, network access, Memory, Files, secrets, connected accounts or Skill execution is admitted. Relay/Skill extensions must arrive as separately qualified explicit capabilities; unknown profiles fail closed. MissionControl can use existing Work delegation without becoming a dependency.

Previews use disposable synthetic state, exact candidate/version and a one-hour lifetime, with expiry checks on use and installation. They have no persistent owner state or external effects. Expired metadata is retained as evidence, not as a running resource.

External-alpha continues to require migration 0084. Existing personal schema rollout remains unchanged. Migration 0085 is not automatically applied to a deployed installation by this work. The delivery adapter returns immediately outside explicitly enabled local mode.

## Qualification

The integration suite uses real PostgreSQL, existing canonical migrations, synthetic identities and ephemeral fixture signing keys. It exercises the canonical Work/Factory/Result/Inbox lifecycle, browser UI and Sofie shared state, successor migration, failure injection, behavior rollback, owner/app isolation, row security under a restricted role, stale authority, expiry, revocation, malformed packages, origin/authentication checks, response loss and fresh-process reads. The native route and real Inbox delivery adapter are also exercised. Browser evidence is written under `output/playwright/myapps`.

Run contract tests, the scoped `apps/eve/lib/myapps/tsconfig.json` typecheck, migration check, reference build, and `packages/myapps/vitest.config.ts` with explicit synthetic PostgreSQL and MyFactory checkout paths. Hosted CI uses exact counterpart commits. See the workspace Phase 2 qualification report for exact source SHAs and independent review status.

Next authorization boundary: production composition, operational rollout and production grants require a separate reviewed plan and explicit authorization. No deterministic result here claims live production qualification.
