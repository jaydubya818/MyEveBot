# Production installation continuation

Status: **IMPLEMENTED / LOCAL QUALIFICATION PASS; LIVE INSTALLATION PENDING**. First paid canary: **NOT_READY**.

The separately provisioned Factory project is `myfactory-cloud-production` (`prj_4hfceCN8l6wN1gUyYOzZLQ7aJapK`). Only `sofie-personal-agent` (`prj_L6faw25wnFGUZtrLKBIccg8gIDLR`) Production may become its cross-project trusted source. Preview and Development are excluded. The exact rule is prepared but not saved pending the browser tool's required action-time confirmation. This is the same short-lived workload-identity architecture, with independent application and Work authorization retained.

Fresh resources, connected only to that project's Production environment:

- Neon `store_vUOtU0sIkDLU6TY4`, external project `dry-morning-22844424`, free plan, iad1. Read-only provider UI preflight observed database `neondb`, no Factory schema, and zero application tables.
- Private Blob `store_qBuivS8MmRxnBNnU`, iad1. Readiness explicitly supplies a fresh production OIDC token and this exact store; ambient static-token fallback is not accepted.

Factory installation validates exact project/team/caller/resource identity, configured real owner and separate expiring proof/application credentials. Production preparation and dispatch return denial before opening the database or allocating a resource. Infrastructure readiness is separately reported from execution readiness. MyEve adds an authenticated, owner-only installation observation endpoint; its production observation cannot enable the deterministic conversation or create an execution connection.

Migration007 reconciles only the Factory installation boundary; migrations001–006 remain byte-identical. EvidenceProvider still adds no Factory migration. The initializer locks application tables, rejects qualification rows, preserves the fresh production marker across repeat calls and rejects a different owner/resource binding. Disposable verified-TLS PostgreSQL qualification passed. Production migration has not run.

Automatic approval review rejected making migrations run automatically on every production build. That patch was not applied. Migrations remain an explicit operator operation; no build or request handler initializes the database. Existing production MyEve preflight independently passed with only0080 pending.

Validation before final review: Factory458 PASS/21 explicit skips; production identity/readiness/control10 focused PASS; actual PostgreSQL installation1 PASS; MyEve2089 PASS/94 explicit skips; focused transport/installation44 PASS; credential containment7 PASS; types/governance PASS. Groups overlap and are not additive. Independent review found three issues: actions rewrite compatibility, partner-password scanning, and ambient provider credential fallback. All are fixed. Independent read-only re-review passed22 cases with no remaining findings in this foundation scope. No actual credential disclosure was observed.

The qualified existing Cloud execution machinery remains preserved. A production execution contract must still replace qualification-specific source, pricing, model transport, checkpoints and protected policy with explicit reviewed production bindings before the paid canary can be declared ready. The current foundation deliberately reports `AWAITING_PRODUCTION_EXECUTION_CONTRACT`; available infrastructure never implies execution authority or qualification.

No staging database rows, synthetic owner, qualification password, qualification GitHub secret or preview trust is copied into production. No paid model operation or generated publication effect has been executed. The platform has not yet been deployed, and neither main is merged by this receipt.
