# Proposed production integration boundary — not approved or applied

Keep App Registry, canonical data, typed actions and UI in MyEve; keep building,
custody, separate verification and Result production in MyFactory. Do not create
a MyApps repository, service, Work queue, Skill resolver or budget ledger.

The smallest next envelope is one private, feature-flagged Lead CRM template for
an explicitly approved internal owner. It would require a separate implementation
and qualification decision, then a separate deployment/activation decision.
No external-alpha tester, grant, source, configuration or FactoryVersion changes
are included in this proposal.

## Changes requiring review

- MyEve: a PostgreSQL adapter with owner/App keys, transactional installation,
  record revisions and idempotency receipts; actual authentication and intersected
  conversation/Work policy; native Apps routing, Files/Proof custody and canonical
  Needs You approval delivery. The loopback fixture login is never an auth adapter.
- MyFactory: production admission must bind active canonical Work, exact AppID,
  AppVersion/AppDigest, source and FactoryVersion. Package data cannot supply the
  expected authority. Approve a deployment-specific verifier isolation model and
  artifact custody before allowing generated code beyond the two declarations.
- Skills: none executed by the reference. Reassess the unmerged MySkills draft
  and qualify an exact App Builder Skill before enabling one. Inclusion in skillz
  does not imply qualification. Relay and Owner Computer remain unavailable.
- Migrations: add reviewed MyEve PostgreSQL tables and constraints only in a new
  integration change. No production migration exists in this branch. Test backup,
  restore, failure during commit, concurrency and rollback before deployment.
- Result/Proof: retain the existing signed Result v1 protocol. Persist exact
  candidate artifacts and verifier claims separately from installation and owner
  acceptance. Never relabel local reference checks as cloud verification.
- FactoryVersion: the reference changes the App builder/verifier and binds trusted
  MyEve runtime bytes, Node version, platform and architecture. A deployed envelope
  needs a newly qualified FactoryVersion. Existing external-alpha versions stay
  unchanged. Exact implementation SHAs belong in the owner approval envelope.
- Accounting: deterministic internal App actions do not invoke a model. Future
  paid Factory or Skill operations must reserve/settle through canonical shared
  accounting. No App budget ledger or unaccounted paid operation is permitted.

## Authority and operations

The reviewed declarations allow only this App's CRM queries and internal changes.
Installation does not enable external effects, network, files, other Apps, Skills,
Relay, computer access, autonomous goals, publication or background triggers.
The App cannot author Principal, SQL, scripts, routes, verifier reports or grants.

Retain per-App disable, global runtime disable, global mutation disable, durable
Factory generation fencing, version revocation and preview termination. Every
request must recheck current authority, including duplicate-delivery responses.
Keep owner data when disabling or revoking. Rollback to an earlier declaration
should be a verified successor with the current exact base and explicit owner
approval; do not silently downgrade an installed version or erase newer data.

Deployment remains blocked on independent architecture/security review, production
auth and custody qualification, PostgreSQL adapter/migrations, real Needs You/Work
integration, recovery evidence and explicit owner approval. No paid, production,
public marketplace, external-alpha or external-effect behavior is activated here.

## Reference qualification commands

Use two clean clones at the exact reviewed commits, Node 24 and canonical `npm ci`.
Provision Playwright Chromium and a disposable loopback PostgreSQL 16+ instance.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test --workspace @myeve/myapps-reference
npm run build --workspace @myeve/myapps-reference
npm run db:migrations:check --workspace=eve-agent
node packages/myapps/browser/journey.mjs
node packages/myapps/browser/performance.mjs
MYAPPS_POSTGRES_URL=postgres://test@127.0.0.1:5432/postgres \
MYFACTORY_SOURCE_ROOT=/path/to/qualified/MyFactory \
  node_modules/.bin/vitest run --config packages/myapps/vitest.config.ts
```

Compare browser PNGs with a reviewed same-OS/Chromium/font baseline by setting
`MYAPPS_VISUAL_BASELINE_ROOT`. A mismatch fails the journey. Hosted CI compares
independent sessions on its own runner; cross-OS pixels are not interchangeable.
Synthetic screenshots and machine-readable reports are in the ignored
`output/playwright/myapps/` directory and hosted CI artifacts.
