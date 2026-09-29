# Private-alpha deployment preparation — inactive

This is a prepared procedure, not a deployment. Use the final reviewed commit; never merge main or enable paid execution merely because a build passes.

## Smallest deployment shape

The current product authenticates one configured owner per Eve. The prepared option is two private installations, each with its own empty/preserved canonical PostgreSQL database, owner ID, active primary Agent, session secret and access password. Capsule movement is between independent Eves of the same authenticated owner; it is not a cross-person sharing feature. The owner's topology answer is still pending.

Use an existing approved host after it is selected. The app builds from `apps/eve` with Node 24 and `npm run build`; it starts with `npm start`. A protected preview can serve the private alpha. Factory execution and protected verification require a qualified supervised worker with Docker and the reviewed repository source, not a browser request pretending to be a durable worker. Do not inherit unrelated personal-production credentials.

## Required configuration after runtime-patch approval

The inactive `private-alpha-runtime.patch` proposes:

| Setting | Meaning |
| --- | --- |
| `MYEVE_BETA_MODE=private-alpha` | Explicit product-plane activation; never silently falls back from qualification |
| `DATABASE_URL` | This installation's canonical application database; Memory, Goals, Work and Capsules share it |
| `MYEVE_OWNER_ID` | Explicit private owner identity |
| `MYEVE_ACCESS_PASSWORD`, `MYEVE_SESSION_SECRET` | Independent authentication secrets per installation; provision directly in the host secret store |
| `MYEVE_ALPHA_REPOSITORY` | Reviewed server-owned repository; canonical route/base checks still apply |
| `MYEVE_ALPHA_MAX_WORK_USD` | Explicit finite ceiling, positive and no greater than 1.35; no paid-execution grant |
| `MYEVE_ALPHA_MAX_WORK_SECONDS` | Explicit positive integer, at most 600 |
| `MYEVE_CAPSULE_EVE_ID` | Existing active Agent ID belonging to this owner; shown as the Eve code |

Do not set model credentials or `MYEVE_FACTORY_CONFIG` from this document. The producer/Q37 handoff supplies the actual qualified connection, secret-loader instructions and exact pins. Existing non-production engineering gates remain unchanged; the proposed database patch does not make production engineering ready.

## Deployment steps after dependencies and approval

1. Receive and inspect both exact component handoffs; preserve their source outside temporary-only storage and record SHA/configuration digests. Reconcile with the forward-only 0067 lineage. Never rewrite a previously applied migration.
2. Apply and test the explicitly approved private-alpha runtime patch. Run the application/root/security suites, typecheck/governance, build, migration upgrade, canonical Capsule and connected Factory journey on the final assembled source. Verify each owner's signed session cannot open the other's installation.
3. Provision or select the two owner-isolated databases and secrets. Back up any populated target, inspect its migration ledger, run migration preflight, then apply only the canonical chain. Ensure the migration/runtime role arrangement supports the existing restricted Goal/Inbox roles; do not substitute a different migration branch.
4. Keep paid execution disabled. Deploy only after the owner's separate deployment authorization. Smoke-test sign-in, Goal/Work, Needs You, Memory, Capsule review, Today and Brief on desktop and 390px with the actual deployment origins. Do not weaken same-origin checks to accommodate a proxy; configure its canonical origin correctly.
5. Q37 alone performs its separately authorized bounded live journey when its source and credential setup are ready. Retain truthful Result/Proof limitations. No repeated paid negative tests or second attempt from this workstream.

## Recovery

Stop new admission first, reconcile the retained Work/Factory identity, and verify writer quiescence before restarting a worker. Retain UNKNOWN spend and custody; never reset counters or create a replacement dispatch identity to evade uncertainty. For Capsule rollback use the receipt-bound operation; later-corrected Memory requires fresh review. Preserve the database and migration ledger. Do not roll back schema by deleting 0067 or rewriting applied migration checksums. Roll back application code only to a schema-compatible reviewed commit.

## Concrete blockers

The accepted efe9 producer source is missing, the private-alpha runtime expansion awaits explicit approval after automatic-review rejection, and the deployment host/topology is not yet selected. Enterprise billing classification, enterprise identity and exhaustive scale qualification do not block this two-person alpha.
