# MyApps deterministic foundation

This isolated reference package is not imported by production MyEve routes,
Sofie tools, migrations or external-alpha code. No deployment is authorized.

## Source truth

| Repository | Fresh canonical main |
| --- | --- |
| MyEve | `2ef364024bc1cdd3e10ec28f3d340119c6f87d41` |
| MyFactory | `030b1a51017f3159436b93817ed2d5bf6ae18288` |
| skillz | `4942dde4b2a442df3ee45879bb22734c658426df` |
| Relay | `a90625776193031ca2303ba2e2162249d1245479` |

MySkills PR #6 was inspected at `59341b1352a76113f6a1fe4c3724cee8bf1eba6e`.
Its `myskills.manifest.BINDING_SCHEMA` defines `skill_id`, `version`, `digest`.
The draft is not a stabilized mainline integration. This App host permits no
Skill execution, capabilities, external effects, network, dependencies or secrets.
It does not reproduce MySkills trust, qualification, resolution or permissions.
The seven curated engineering skills remain candidates for later qualification;
repository inclusion alone does not grant PLATFORM_QUALIFIED status.

## Ownership and reuse

MyEve owns App identity, installation, owner isolation, canonical data, UI and typed
agent actions. `apps/eve/lib/engineering/store.ts` already owns canonical Work and
`factory-return-contract.ts` binds exact Work/source/Result evidence. App packages
hold a Work reference; they do not create another Work inbox, lifecycle or ledger.
Existing artifact revision/custody and Universal Inbox decisions are integration
ports, not permission that this prototype can invent.

MyFactory owns deterministic generation, immutable candidate custody and separate
verification. Existing `packages/app-builder` provides a versioned scaffold and
explicit loopback preview. `apps/cloud-control/src/cloud-verification.mjs` provides
independent-verifier continuation, duplicate reconciliation and cleanup semantics.
These are the preferred reuse points. No new software factory or paid provider is
needed for the declarative fixture.

Relay remains unchanged: Agent identity and grants are not App data authority.
MySkills remains unchanged: an empty Skill binding list grants no Skill execution.

## Runtime decision

The reference runtime interprets two exact reviewed Lead CRM declarations (base
and Lead Sources view). It never evaluates package scripts, SQL, expressions,
HTML or URLs. Strict template equality rejects unknown fields, network changes,
embedded code and capability escalation. This deliberately narrow model proves
shared human/agent state without trusting arbitrary generated code.

A package digest covers the complete AppSpec, owner, AppID/version, Work binding,
source/candidate identity, exact FactoryVersion, base and migration declaration.
Mutable qualification, revocation and installation records remain outside it.
JSON canonicalization sorts object keys, preserves array order, rejects lossy
numbers/undefined/cycles and bounds payload size. This is a versioned App encoding,
not a replacement for the separately owned MySkills digest algorithm.

SQLite (Node 24 built-in) is a local transactional reference, not a new deployed
database service. BEGIN IMMEDIATE serializes writes across connections; unique
keys deduplicate intents, approvals and action deliveries; optimistic revisions
reject lost record updates. FULL synchronous WAL commits survive process restart.
Production must adapt this contract to MyEve's PostgreSQL transaction boundary and
qualify actual auth, encryption, backup, recovery and cross-process isolation.
No production migration is supplied or applied here.

Only trusted host code receives ReferenceStore. Generated packages are inert JSON.
Authenticated adapters supply Principal and its already-intersected operation
policy; browser/model input must never construct a Principal. The owner facade
cannot register candidates, attest verification, revoke versions or execute SQL.
The typed Crm host uses the same transaction path for UI and agent calls.

The runtime never grants external effects. External requests must return to the
canonical MyEve external-effect/Work approval path. Read access is App-specific,
not owner-wide; no Files, Memory, Relay or Owner Computer capability is exposed.

## Lifecycle and recovery

Candidate, verifier outcome, preview, pending approval, installed version and
enabled status are separate facts. Proof reports its historical generation-time
installation state; current installation is read from the registry. Duplicate
approval delivery returns the original exact installed identity without reinstalling
or re-enabling it. Disable/revoke advance the registry revision and fence pending
approvals. Version replacement requires the exact installed base and owner decision.

Only the identity migration is admitted. Unknown or destructive migration programs
are denied. The version switch and existing schema check commit with data in one
transaction; failure leaves the old installation unchanged. Back up the isolated
SQLite store while closed; restore the whole store with its approvals and receipts,
never data alone. A future schema migration needs an explicit recovery plan; no
safe down migration is assumed. Destructive deletion is absent. Future production
retention must define owner export, archival, legal retention and purge separately.

## Qualification

Run `node --test packages/myapps/test/*.test.mjs` on Node 24.15 or newer in major 24.
The tests use synthetic owners, non-routable contacts and temporary databases only.
They do not establish production custody or live Sofie behavior. The composed
Vitest journey additionally exercises canonical WorkStore against disposable
PostgreSQL with all canonical migrations; App storage remains the SQLite reference.
The reference limits an App's JSON state to 100 KiB and 1,000 leads; it is not a
production CRM capacity claim. Dates are ISO calendar dates; metrics use explicit
as-of and period-start dates; money uses integer cents; win rate uses basis points.

Initial self-review: strict declarations, parameterized SQL, owner keys at each
read/write, cloned Principal, no secret/environment/network access in generated
content, no verification APIs in the owner facade. Independent review is pending.
Public disclosure review covers only new files and synthetic fixtures; historical
repository material is neither republished as evidence nor modified.

Repository decision: KEEP IN EXISTING REPOS. The composed journey works with
MyEve's registry/runtime and MyFactory's builder/verifier. No independent API,
persistence/control plane, deployment or release lifecycle was required. A new
MyApps repository/service is not justified. Production integration remains a
separate owner decision; see [INTEGRATION-PROPOSAL.md](INTEGRATION-PROPOSAL.md).
