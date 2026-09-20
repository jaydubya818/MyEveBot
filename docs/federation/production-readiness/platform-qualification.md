> Current preparation: [KMS and isolated credential report](kms-preparation-report.md). Synthetic Vercel secrets are staged on disabled branches; KMS and hosted controls remain incomplete. Both external gates are NOT_RUN. Earlier status below is historical where superseded.

> Current status: [authorized target report](authorized-target-report.md). Three schemas are prepared with credentials revoked; hosted construction stopped at the existing Relay KMS/HSM contract. Neither external gate ran. Earlier preparation statements below are historical where superseded.

# Production Agent-platform qualification runbook

Concrete target preparation is now in [deployment-target.md](deployment-target.md) and [qualification-session.md](qualification-session.md). Hosted project identities are known; crypto/ingress candidates are locally qualified and a second MyEve installation supplies the receiver source. Hosted isolation, workers, budgets and smoke remain unresolved. All P01–P17 results remain NOT_RUN.

Status: NOT_RUN. A second isolated MyEve installation is the selected peer; its independently operated hosted target, access, budget controls and operators remain prerequisites. This does not certify a Claude/Codex receiver. Historical disposable Ava and qualification hosting shims are not production acceptance.

## Required target record

Before executing, record MyEve/Relay/peer names, operator, platform/runtime version, source SHA, immutable deployment or image digest, region, ingress/TLS, auth mode, database isolation, worker supervisor/replica count, queue/poll configuration, model provider/version, key IDs and secret-store references, retention scheduler, logging sink and clock synchronization. Record synthetic owners/Agents, approved UTC window, concurrency/rate and spend caps, intended load, availability objective, recovery objective and retention period. Never record private keys, session cookies, database credentials or canary plaintext.

Use actual deployed ingress, auth, database and worker/runtime. A segregated qualification installation must use the actual production stack and independent peer platform; record differences and require operator acceptance. Enable federation only explicitly in this isolated installation. The default and general production deployment remain disabled. Do not run `scripts/federation-qualification/run.mjs` against production: it provisions disposable hosts and does not implement this runbook.

## Execution order and acceptance

Each row is mandatory; capture timestamped request/response metadata, correlation IDs, deployment fingerprints, relevant side-effect/audit evidence and operator observations. All rows are currently NOT_RUN.

| ID | Action | Pass evidence |
| --- | --- | --- |
| P01 | Inspect deployed default and direct-route behavior before any opt-in | Flag absent/false; disabled owner GET; mutation/artifact denial; worker absent/refuses startup; no existing enrollment |
| P02 | Verify pins, database migration ledger through 0027, production ingress/auth and independent storage | Source/image match, checksums, exact origin/key IDs, valid TLS, isolated credentials, no cross-platform DB access; schema changes only by approved deployment procedure |
| P03 | Explicitly enroll synthetic owners/Agents on MyEve and real peer | Distinct principals, stable addresses and authenticated owner actions; no implicit grants/publications |
| P04 | Preview/confirm benign SNAPSHOT publication; test PRIVATE and explicit shared grant | Exact records/revisions/audience; denied query causes no disclosure; permitted query returns only projection |
| P05 | Exercise knowledge queries both directions with private canaries and injected instructions | Actual platform traces prove no canonical private reads, tools, hidden context or auto-promotion; source/version/expiry retained |
| P06 | Exchange message and reply with separately scoped grants | Durable delivery and conversation mapping, correct caller-only result, bounded retention; no-grant denial |
| P07 | Submit permitted analysis requiring approval, then exact approval; submit denied consequential work | Real Task/Run and canonical ActionGateway/model receipt with spend; denied work never executes; no unrestricted runtime |
| P08 | Send duplicate concurrent work at agreed deployment replica count and restart boundaries | Exactly one model action, atomic budget admission; no duplicate from redelivery/renewed assertion |
| P09 | Crash before claim, after claim, during model action, and lose completion response | Recovery or explicit uncertain state; never blind rerun; durable completion retry succeeds; trace local Run without leaking it to Relay |
| P10 | Revoke capability/approval/Agent, expire request and cancel in-flight runtime; stop worker | No new unauthorized action; measured in-flight cancellation/provider behavior, bounded deadline and truthful outcome/accounting |
| P11 | Share artifact both directions; mutate proof/audience/hash/size; revoke/expire | Actual source ingress enforces proof and expiry/revocation, redirect denial and egress isolation; permitted bytes hash correctly |
| P12 | Rotate/revoke Agent credentials, rotate deployment signing/encryption keys, restore under documented operator procedure | Old access denied, stable identity, no silent trust widening; historical evidence remains verifiable; encrypted state recoverable or explicitly unavailable without unsafe retry |
| P13 | Verify Relay-signed receipts and inspect persistence/logs across all platforms | Correct chain/owner and no private canaries, secrets or canonical MyEve Run state in Relay/peer/logs; retain redacted hashes |
| P14 | Run retention schedule with idle owner and offline/failed worker | Expired bodies purged within declared period; retry/idempotency evidence preserved; scheduler alerts verified |
| P15 | Operate at agreed bounded load; simulate peer offline, network loss and restart | Measured latency/backlog/resource use within agreed envelope; bounded retries and recovery; no availability claims beyond observed window |
| P16 | Trigger operational failure and security-denial alerts, perform backup/restore rehearsal | Named operator receives actionable alert; restore preserves claims/authority and does not resurrect revoked access |
| P17 | Execute cleanup/disable drill and capture final state | Test grants/publications/credentials revoked; all relevant workers stopped/drained; opted-in flags removed; denied route probes and no new work verified; evidence retained securely |

A provider that cannot attest private-context isolation fails qualification even if its API responses look correct. A blocked transport stays blocked. A missing key-rotation procedure, cancellation proof, retention scheduler or suitable concurrency evidence keeps the gate open; do not add features under this task to make the checklist green.

## Stop and disable procedure

On boundary failure, stop new submissions; have operators revoke test grants/credentials and pause publications through existing controls while access is available, stop/drain every test worker and account for in-flight model work. Remove opt-in from the isolated app and worker configuration and redeploy/restart as required. Verify disabled-route probes at ingress and lack of new provider actions. Preserve uncertain Runs/claims and reconcile read-only; do not reset them to runnable, delete audit rows, or roll back the additive migration as an emergency shortcut. Already delivered data cannot be recalled.

Setting an environment variable in a shell does not update deployed processes. The operator must record the exact deployment change and verification time. Encryption/signing rotation must follow a tested procedure; do not destroy old decryption material before recovery requirements are settled.

## Result template

For each P-ID: status; start/end UTC; operator; source/deployment/config IDs; prerequisites; steps; expected vs actual; bounded traffic/spend; redacted evidence path and SHA-256; defects; cleanup result. Attach an exceptions list and signed attestation from the MyEve, Relay and independent platform operators. Record final disabled state separately from scenario successes. Readiness remains NO-GO until both gates in README are signed off against the same candidate.
