# Isolated admission qualification

The accepted MyEve foundation is e5ba7743c97ad8d6f37ecdbb62eb1cfc12a8201f. The canonical registry remains byte-identical to MissionControl 04770b83844b036080e59c9e6ea8ebb565383534.

## Admission contract

`@myeve/capability-enforcement` adds a policy check, not a Work grant. The caller must hold one PostgreSQL transaction containing canonical preferences, protected policy evidence, and its own admission write. It must retain its existing authorization, qualification, accounting and revocation checks. A pool/autocommit call, unsafe database role, missing binding/schema/evidence, stale revision, foreign owner/organization/installation/agent, denied preference/dependency, pending control, or exceeded preference budget fails closed.

MyEve routed and legacy admissions invoke this check. The isolated Work transport requires DATABASE_URL and MYEVE_CAPABILITY_DATABASE_URL to identify the same configured database. This is a qualification prerequisite, not a production database migration. The default HTTP database transport cannot provide the transaction contract and is denied for new admission.

The policy row lock serializes disable with admission. An admission that acquires the lock first can commit before disable; subsequent admissions see disabled state. Expiry is rechecked after backend writes; failure rolls back the entire transaction. The successful final check is the admission decision point. Its metadata is retained in routed admission evidence and is not reusable authority.

`enforcement.sql` is a manual additive qualification migration after `migration.sql`. Apply only to a disposable/approved isolated database with a trusted schema owner. A restricted admission role needs schema USAGE, SELECT on policy tables and EXECUTE on `lock_admission_policy(text,text,text)`. MyEve's command role retains its existing limited mutation permissions. No automatic migration, production grant, or real-owner binding is included.

## Relay compatibility gate

`relay_agent_evidence` is a read-only projection for qualification, not another registry or policy authoring surface. Tests seed synthetic authoritative facts. Runtime roles cannot write that projection, installations, platform-owner bindings or organization evidence. A live adapter must bind canonical Relay account/principal/agent/Passport and bundle revisions to the exact MyEve installation and prove revocation ordering. That adapter is NOT_QUALIFIED. Expiry and local row locking do not establish instantaneous revocation across independent databases.

No real-owner identity has been inferred from `jay`, an email, or a repository author. All real-owner defaults remain unbound until authenticated administrative, membership and isolated-installation records are resolved. Synthetic valid bindings continue to default all 36 preferences on while setup, qualification and backend authority stay independent.

## Existing Work and controls

Disable denies new admission and preserves existing Work and evidence. Pause/revoke requests durably deny new admission, but remain PENDING_BACKEND. There is no acknowledgement of a remote stop, clearance of UNKNOWN exposure, or cancellation of active resources in this checkpoint. Resource fencing, stop receipts and reconciliation across backends remain gates; no outbox acknowledgement is fabricated.

## MissionControl gate

MissionControl stores admission in Convex; the PostgreSQL transaction contract cannot be called atomically from its mutation. Its accepted source is preserved. No owner preference enforcement in its shared dispatch mutation is claimed. Closing every existing MissionControl admission unconditionally would disrupt unrelated engineering flows, while accepting a cached positive policy would permit a disable race. A versioned cross-database admission reservation/fencing contract must be qualified before integration. Neither merging a dependency branch nor copying owner policy into a new authoritative registry is an acceptable shortcut.

## Evidence

Run `node --import tsx scripts/qualify-capability-control.mjs --browser` from apps/eve using a local PostgreSQL binary. The runner creates and removes its own cluster, applies the real Work migrations, uses restricted application roles and synthetic identities, and performs no paid/provider operation. JSON and browser evidence live in this directory's evidence folder. Separate review and hosted CI must identify the exact checkpoint SHA before promotion.
