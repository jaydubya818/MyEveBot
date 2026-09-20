# Authorized hosted target report — 2026-09-20

**NO-GO — EXTERNAL QUALIFICATION PENDING. HOSTED TARGET INCOMPLETE.**

The owner authorized isolated infrastructure and managed runtime secrets, conditional on existing custody requirements. Three empty databases were created on the existing free Neon resources, migrations applied, and a real hosted migration defect fixed. Construction then stopped at an existing Relay KMS/HSM requirement. No app, worker, signing key, owner/Agent account, publication, grant, model call or external gate was activated. Unused application credentials were revoked and temporary files removed; the schemas remain prepared.

## Required 26-point report

| # | Item | Actual result |
| --- | --- | --- |
| 1 | Readiness branch / HEAD | `codex/myeve-federation-production-readiness`; began clean at `bb12b5c957f18d4a1780a66c397fa2b4c017e759`. Resulting HEAD is the commit containing this report. |
| 2 | MyEve A source | Proposed requalified successor `a63b2feb533c45e0afc912e8ccf79c270326e2d2`, based on approved `767b585…`; not deployed. |
| 3 | Relay source | Approved candidate `bbfcaa18710556fc689f60990599f4734e99a720`, unchanged this turn; not deployed. Its managed-secret backend conflicts with the existing hosted custody contract. |
| 4 | MyEve B source | Same proposed successor `a63b2feb533c45e0afc912e8ccf79c270326e2d2`; second independent installation remains selected, not a requester-only CLI. |
| 5 | MyEve A deployment / region | NOT_CREATED / NOT_ASSIGNED. Existing personal production is untouched. |
| 6 | Relay deployment / region | NOT_CREATED / NOT_ASSIGNED. Existing Relay production is untouched. |
| 7 | MyEve B deployment / region | NOT_CREATED / NOT_ASSIGNED. |
| 8 | Three Neon resources | `fq_myeve_6384519e0e01`, `fq_relay_6384519e0e01`, `fq_peer_6384519e0e01`; created as empty template0 logical databases on existing endpoints. Separate restricted application and non-login owner roles. No new compute/project/plan purchase. |
| 9 | Migrations | MyEve A27, Relay 22, MyEve B27; normal runners and idempotent reruns passed. No migration SQL/checksum changed. Runtime DML only; no DDL/ownership/journal writes. |
| 10 | Custody | Requested **MANAGED RUNTIME SECRETS**. Status **STOP — EXISTING KMS/HSM CONTRACT APPLIES**. No key generated or installed; no KMS/HSM purchased. Database credential upload also blocked by automatic approval review. |
| 11 | Persistent Relay crypto | Prior local startup evidence retained; hosted verification NOT_RUN. Persistent managed-secret startup is not compliance with the existing KMS/HSM contract. |
| 12 | Ingress | Qualified origin-bound source retained; hosted valid/invalid ingress, identity and authorization matrix NOT_RUN. No bypass token or protection exception created. |
| 13 | Worker host/runtime | No suitable deployed worker identified. Railway Hobby workspace exists with $3.98 observed credit; its only project is unrelated production `mission-control-bot`. No new service created. |
| 14 | Worker health/restart | NOT_RUN. Credits alone do not prove supervision, resource bounds, independent operation or restart safety. |
| 15 | Budget | Hard 120 submissions/2000HTTP/concurrency2/model1/$5/64KiB/60min controls remain NOT_IMPLEMENTED_OR_PROVEN. No paper-only enforcement claim. Zero federation/model submissions in this run. |
| 16 | Emergency stop | Three staged DB application logins revoked, passwords cleared, old credential connections denied; migration logins revoked. This is a database stop check only. Whole-target federation/worker kill path NOT_RUN because target does not exist. |
| 17 | Telemetry/evidence | Sanitized provisioning, migration, connection/privilege/revocation and local regression evidence retained in the [evidence manifest](evidence/authorized-target/manifest.json). Hosted application/audit/worker export destinations remain unset. |
| 18 | Infrastructure smoke | Three DB connections, certificate-verified TLS, migration/idempotency, A↔B cross-DB denial, runtime privilege checks and credential denial passed. Web/receiver/TLS ingress, hosted crypto, worker, budget and restart smoke NOT_RUN. |
| 19 | Defects/fixes/commits | MyEve `a63b2fe`: replace HTTP migration execution with session transactions; extend regression with real protocol transport, atomic rollback and checksum-drift refusal. No Relay source change. Readiness evidence/report committed separately. |
| 20 | Current regression | MyEve 496 Vitest tests/74 files;130 Node tests;25 disabled probes;8 migration/authority checks;2 workspace typechecks and2 builds passed. Relay219 passed/4 skipped +2 performance +3 browser are historical results from prior mission, not rerun or relabeled current. |
| 21 | Security package | TARGET_NOT_READY. Contract conflict and missing hosted controls recorded; no assessor dispatched. |
| 22 | Platform package | TARGET_NOT_READY. Same full P01–P17 runbook remains required; actual independently operated MyEve B and deployment matrix are absent. |
| 23 | Remaining inputs | Resolve the existing custody contract with the responsible security authority and identify a compliant existing key service; do not silently waive it. Explicit destination approval is also required by automatic review for future Vercel credential uploads. Assessor/operator, window, stop contact and evidence custodian remain unassigned. Hard budgets, workers and hosted smoke still require implementation after the stop is resolved. |
| 24 | Independent security | **NOT_RUN — TARGET NOT_READY** |
| 25 | Production platform | **NOT_RUN — TARGET NOT_READY** |
| 26 | Verdict | **NO-GO — EXTERNAL QUALIFICATION PENDING; HOSTED TARGET INCOMPLETE** |

Frozen release pins remain MyEve `60d341f9909936f03e4d72e1a7f845721ef82c46` and Relay `614c638d6fc4099db8064540326f5de4438e93a1`. The new source SHA is proposed explicitly, not silently promoted. General federation remains disabled.

## Mandatory custody stop and correction to earlier preparation

At Relay `bbfcaa1`, `docs/v2/evidence.md:9` states:

> hosted deployments must bind the interface to a KMS or HSM.

Line17 requires account-scoped KMS wrapping for production. `docs/v2/security/security-architecture.md:112` states:

> Cloud KMS/HSM protects environment root keys; no root key is stored in application configuration.

ADR-016 also requires a V2-specific KMS key for production configuration. The planned isolated Relay uses the production application mode and these signing/wrapping interfaces. The newly added startup document offers exportable managed-secret custody, but does not explicitly amend these existing contracts. The earlier preparation report overlooked this conflict; local tests cannot resolve it. The owner's latest instruction explicitly requires STOP when a repository KMS/HSM requirement exists. No exemption was inferred and no security contract was weakened.

The existing signer/provider interfaces remain the integration seam if a compliant service is identified. Any implementation and resulting source pin would need separate qualification. No new KMS product or paid infrastructure was purchased.

## Database state, isolation and safe pause

Both reused Neon resources were reported as Free/free_v3: Relay marketplace `store_NoIIiEgH5AoDvwL5`, MyEve `store_LYKKUJFl0QhkiNJy`. Direct endpoint fingerprints in evidence identify the connections actually used. Initial allocated database totals were 24,739,840 bytes for MyEve's endpoint and 21,815,296 for Relay's, below the reported 0.5GB project allowance. No plan change or new endpoint was needed. Database regions were not independently attested; no app region is invented.

Each database was created from template0. Each has a distinct non-superuser, non-CREATEDB/CREATEROLE/BYPASSRLS application role with no inherited memberships and a connection limit of 4. A separate non-login owner owns the database/schema. The existing administrator received SET permission only for these new owner roles. Existing application-table/sequence privileges, security-definer function access and schema-CREATE privileges were checked via metadata and found absent for the new runtime roles; no private rows were read. A/B runtime credentials were denied connection to the other qualification DB. Existing production access rules were not modified.

Normal migration runners used short-lived synthetic owner logins. Those were disabled and passwords cleared after each run. Application roles were granted only public-schema DML/sequence access, excluding the migration journal, then checked for absence of schema/database CREATE and object ownership. New MyEve Agents and Relay accounts remained zero. On STOP, all three application logins/passwords were revoked, old credentials were observed denied, and the temporary mode0700/mode0600 credential files were removed. **These are preserved schemas, not currently usable app credentials.** Future resume must rotate fresh passwords into approved custody; never recreate duplicate databases.

Three preliminary provisioning attempts rolled back their own resources completely while resolving owner-role SET permissions and validating TLS on the certificate-verified client transport rather than Neon's internal proxy hop. Only the three successful IDs above remain. Local regression containers report removal. No personal or customer rows were copied or changed.

## Hosted migration defect and evidence boundary

The original MyEve HTTP runner failed on both fresh hosted databases with SQLSTATE42601, `cannot insert multiple commands into a prepared statement`. Existing migration chunks legitimately contain multiple commands. The historical local HTTP bridge ran them through node-postgres's simple-query path, so it did not faithfully reproduce Neon's HTTP restriction.

The focused correction uses the already installed Neon session Client, preserving SQL bytes/checksums. Each migration chunk set and journal insert run in an explicit transaction. Local real-wire tests verify fresh 27, populated 26→27 preservation, idempotency, schema equivalence, atomic rollback after a failed multi-command chunk, checksum-drift refusal, and the existing 2 authority integration scripts. The corrected normal runner then passed on hosted A/B. This fixes deployment preparation; it is not the production federation golden path.

Files evicted by iCloud initially blocked source reads. Exact Git commit objects were recovered from index/reflog data and verified against their expected hashes in temporary checkouts; source files were restored only when their blob hashes matched. The resulting MyEve checkout is based on the exact approved `767b585…`. Final local regression used fresh lockfile dependencies in that recovered checkout. Stalled duplicate task-owned tests were stopped; successful final logs are named explicitly. No changed or invented baseline was substituted.

## Remaining hosted resources and cost boundary

Reuse remains the plan: two existing Vercel projects for three isolated previews, existing Neon resources, two MyEve pollers and Relay maintenance code, existing DB-backed artifact routes. No new artifact bucket is required. Source-owned synthetic identities must later be created through normal flows; no IDs are fabricated now. All app deployment IDs/origins, worker identities, signer public fingerprints and hosted evidence destinations remain unset.

Railway read-only metadata reports existing Hobby membership and $3.98 remaining credit. The only existing project is unrelated production and was not repurposed. An isolated bounded worker deployment may fit credit, but no hard resource/deadline control or exact worker configuration was approved/provisioned before the custody STOP. Do not interpret available credit as authorization for indefinite paid operation. Current published rates are $0.00000386 per GB-second memory, $0.00000772 per vCPU-second CPU and $0.05/GB egress; actual consumption/build costs would need bounding before provisioning. [Railway pricing](https://railway.com/pricing).

No hard session budget implementation was completed before the stop. Existing estimated per-work budgets/soft alerts do not enforce the requested aggregate ceilings. No provider credential was installed and no model call was made. The next implementation phase must prove boundary/cap+1, concurrency, crash/restart, unknown usage, expiry, streamed artifact limit and stop behavior before target readiness.

## Automatic approval review and resumption

Automatic approval review rejected sending the new database credentials to Vercel sensitive environment variables, stating that the user had not explicitly named the destination project IDs. The rejected command did not run; no upload or Vercel configuration change occurred and no indirect workaround was used. The pending exact destinations were `sofie-personal-agent` / `prj_L6faw25wnFGUZtrLKBIccg8gIDLR` (separate synthetic A/B preview branches) and `relay` / `prj_3IRvr9knK5VJcBTgTYMvhv6ixmJK` (synthetic Relay preview branch). Credential approval alone would not resolve the independent KMS/HSM contract stop.

Resume only after the custody decision is consistent with the existing security contract and the secret-destination approval is resolved. Then reuse the recorded DBs, generate fresh credentials, finish isolated configuration and hard controls, deploy exact qualified successors, run infrastructure smoke only, and freeze a new non-secret handoff package. Actual gates still require an independent assessor and peer operator in separate contexts. The implementation agent cannot mark either gate PASS.
