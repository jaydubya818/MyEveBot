> Current preparation: [KMS and isolated credential report](kms-preparation-report.md). Synthetic Vercel secrets are staged on disabled branches; KMS and hosted controls remain incomplete. Both external gates are NOT_RUN. Earlier status below is historical where superseded.

> Current status: [authorized target report](authorized-target-report.md). Three schemas are prepared with credentials revoked; hosted construction stopped at the existing Relay KMS/HSM contract. Neither external gate ran. Earlier preparation statements below are historical where superseded.

# Synthetic qualification session contract

**PREPARED ONLY. Neither external gate has been executed.** This contract supplements every P01–P17 requirement in [platform-qualification.md](platform-qualification.md), not a reduced gate. Use the [deployment target](deployment-target.md) and [target manifest](target-manifest.json); blank target/authorization fields are stop conditions.

## Synthetic identities

Use a unique UTC run suffix in these display names. Actual server-generated account/Agent IDs and `relay://<owner>/<agent>` addresses go into the private operator target record after registration; do not invent canonical IDs in advance.

| Label | Purpose and binding |
| --- | --- |
| `fq-myeve-owner-<run>` | Fresh single owner of qualification MyEve deployment, separate Relay owner account A; never the personal production owner |
| `fq-sofie-<run>` | MyEve Agent bound explicitly to account A's Relay Agent/address; files.read-only analysis capability and exact owner approval |
| `fq-peer-owner-<run>` | Fresh Relay owner B, operated in a separate MyEve installation/context; no credential or storage shared with A |
| `fq-peer-<run>` | B's registered MyEve Agent; only named federation scopes; new Agent bearer; not existing V1 identity |
| `fq-peer-sibling-<run>` | Second Agent of B, no grants; proves Agent-level binding |
| `fq-outsider-owner-<run>` / `fq-outsider-<run>` | Third owner C and Agent, denied by default; assessor cross-owner tests only |

Provision synthetic owners via normal owner/account flows in the isolated database. Relay's single-owner private-preview bootstrap refuses ambiguous/multiple-owner state and is not a multi-tenant seeder. No direct bypass of membership/Passports/policy/budget enforcement. Operator must establish the supported bootstrap sequence using existing services before any test. Register hidden discovery and PRIVATE publications initially. Grant exact Agent/capability/resource only after owner action; PUBLIC publication is unnecessary.

Populate synthetic private canaries in MyEve Knowledge, Memory, Goals, conversations and Workspace and in the peer's own private store, plus two benign owner-published facts and one benign artifact. No production export, branch clone with rows, account impersonation or personal connector is allowed. Store canary hashes and access counters in evidence; avoid retaining raw canaries. The peer cannot mount MyEve files or DB, and its inference cannot receive these private canaries. Same-machine separate directories alone are not sufficient filesystem isolation for a fully capable CLI.

## Strict proposed budget — each separately authorized session

This budget applies independently to the production golden path and later assessor session. It grants no execution permission. A new session needs a fresh authorization; no automatic rerun or doubling the limits. Assessor exceptions require a revised written scope before testing.

| Limit | Ceiling / enforcement prerequisite |
| --- | --- |
| Total wall time | 60 minutes from first authenticated request; maximum 45 minutes active tests, final 15 minutes cleanup. Stop admissions at minute 45. No unattended soak. |
| Requests | 120 federation submissions including denied attempts; 2,000 total target HTTP requests including polls, owner setup, retries, health checks and artifact GETs. Atomic operator traffic ledger/proxy counter required; refuse further admissions at cap. No unmetered CLI autonomous loop. |
| Rate/concurrency | Aggregate ≤2 HTTP requests/second, ≤2 in flight; one model invocation in flight; baseline one MyEve poller. Two pollers permitted solely for a bounded duplicate-race case, subject to same caps. No delegated workers. |
| Spend | USD 5.00 maximum total incremental model spend: MyEve ≤2.00, peer ≤3.00. Maximum eight MyEve model calls, each declared ≤0.25, one model step, runtime ≤60 seconds, existing maxOutputTokens=800 and maxRetries=0. Peer hard call/token-cost ceiling must fit 3.00. Infra purchases/additional paid services: USD 0 without separate approval. |
| Spend enforcement | Dedicated provider/gateway budget credential with a hard cap or demonstrable worst-case reservation plus admission cutoff; provider usage reconciled per call. Current MyEve estimate is explicitly not a billing guarantee. Shared subscription usage/soft alert alone is insufficient. If a hard bound cannot be established, model execution remains blocked. Reserve in-flight maximum before admission; no new work at 80% spent/reserved. |
| Payload/artifacts | Task ≤2 KiB UTF-8; at most 5 returned records; artifacts ≤65,536 bytes each, ≤8 artifacts, ≤512 KiB aggregate transfer. Allow only text/plain, text/markdown, application/json. Smaller qualification limits are operator admission policy, not changes to the protocol's existing maxima. |
| Lifetimes | Requests/artifact bodies/context expire within 15 minutes, work deadline ≤60 seconds after approved start, grants revoked at session end; existing retrieval token ≤120 seconds. Synthetic sessions/keys rotated/revoked on cleanup. |
| Stop | Named operator present throughout, separate admin access, independent supervisor watchdog. On limit/authority/canary violation stop admissions immediately; revoke test grants and credentials, pause publications, stop pollers/peer process, remove isolated opt-in and restart deployment processes. Verify denial within 60 seconds; reconcile any in-flight call for up to its 60-second deadline. No claim that changing an env var cancels an existing process. |

The traffic counter/watchdog/provider hard cap are **required but not provisioned**. Do not claim this document enforces limits. Existing Relay rate windows and work budgets remain in force; the session envelope may be stricter. Stress/DoS, customer targeting, spend actions and provider event-body retention are excluded.

## Measured envelope (acceptance targets, not observed SLAs)

| Property | Acceptance target and measurement |
| --- | --- |
| API latency | Non-model authenticated API p95 ≤2 s and every call ≤15 s; minimum 20 benign calls per hosted service; report cold start separately without hiding it. Owner/login/projection calls included; model waiting measured separately. |
| Delivery/completion | Healthy poll-to-local-accept p95 ≤10 s; knowledge/message end-to-end p95 ≤15 s; approved safe work ≤75 s including ≤60 s model deadline. Human approval waiting reported separately. |
| Availability | One scheduled liveness/readiness observation per minute during 45-minute active interval, plus all benign golden-path calls: ≥99% success outside predeclared fault windows; zero unexpected auth/isolation failures. Record numerator/denominator and wall-clock fault windows, report raw availability too. This tiny window is not a general uptime SLA. |
| Retries | Pinned Relay delivers at most 3 attempts with 30/60/120-second next-attempt backoff, subject to expiry; observe no premature retry. After third unacknowledged delivery, next eligible poll yields terminal failure. MyEve polls every 5 s; model maxRetries=0. No new request/idempotency key to disguise an uncertain retry. Bound all polls by session counter. |
| Recovery | Supervisor restarts killed worker ≤60 s; durable known completion/ack converges ≤120 s after connectivity returns. Unknown execution remains fenced for operator inspection within 5 minutes, never auto-runnable. Capture at-most-once provider execution and persisted request state. |
| Cancellation | No new model action after a successful authority revocation check; existing call obeys its ≤60 s deadline and is reconciled. If provider ignores abort, record failure/uncertainty, stop, and keep gate open. |
| Retention | Bodies expire ≤15 min after creation; active maintenance purges ≤60 s after expiry. During deliberate outage, purge ≤60 s after restored worker; report outage retention separately. Replay identifiers/audit metadata persist through recovery and 30-day evidence window. Verify database backup expiry separately; do not claim row deletion erases backups. |
| Cleanup | Stop admission at minute 45; revoke synthetic grants/credentials, pause publications, stop all qualification workers and verify no new actions within 60 s. Purge expired bodies by minute 60. Remove synthetic secrets within 24 h; retain redacted signed evidence ≤30 days with named custodian, then delete per operator policy. Keep production owner data untouched. |

If a row cannot be measured in the budget, mark it NOT_RUN and schedule a separately authorized session; do not silently lower requirements or extend time/spend.

## Minimum real-platform golden path

| Step | Procedure and evidence | Runbook mapping / dependency |
| --- | --- | --- |
| G01 | Inspect immutable deployments, absent default flags, synthetic DB/secret isolation, real ingress, signer fingerprints; freeze operator target record | P01–P02; all deployment blockers resolved first |
| G02 | Create synthetic owners/Agents and Passports, register hidden addresses through authenticated owner flows, bind peer bearer to B's Agent, test sibling/C denial | P03; registration is owner work, never peer self-authorization |
| G03 | Owner A previews exact benign facts, confirms SHARED snapshot and scoped grant; owner B independently publishes its benign projection | P04; B uses the same existing MyEve explicit-publication flow in its separate installation |
| G04 | The independent peer submits knowledge.query through the existing authenticated Relay client; hosted MyEve polls actual signed delivery, verifies pin/audience/lifetime and local projection; fetch bounded result | P05; retain request ID/attempt/signature verification and record provenance |
| G05 | Query private refs and injected instructions in both directions; inspect synthetic private-store access and absence of canaries in Relay/peer | P05/P13; reverse hosted direction remains untested |
| G06 | Replay same signed delivery after restart and submit same idempotency key with altered payload; prove durable claim/refusal and no duplicate effects | P08–P09; peer claims must be code-enforced, not model memory |
| G07 | Revoke query grant, prove denial; explicitly grant again for distinct test then revoke/pause publication and prove denial with stale references | P04/P13; no accidental reuse of revoked state |
| G08 | Create message-only grant, peer→Sofie message, Sofie→peer reply; preserve independent conversation/caller binding and signed peer receipt | P06; receiving reply uses the independent MyEve receiver; `get` response alone is not bidirectional messaging proof |
| G09 | Relay admits a locally prohibited work request; MyEve refuses before model/Run effects. Submit benign analysis, exact owner approval, then real gateway execution with measured cost and ≤1 model step | P07/P10; hard model cap required; no unrestricted chat/tool dispatch |
| G10 | Transfer MyEve generated artifact to peer using exact audience proof; validate SHA-256/size/type. Transfer independently owned peer artifact back; test revocation/expiry | P11; outbound MyEve DB-backed artifact exists; reverse peer source uses its own MyEve artifact route; deployment remains missing |
| G11 | Kill/restart polling process before/after claim; interrupt completion response using operator-controlled network fault; recover durable result; reconcile uncertain state without retry | P08–P09/P15; real supervised process, no disposable hosting shim |
| G12 | Rotate Agent credential, prove stable address and old-token denial, revoke new credential; execute controlled signer/wrapper recovery/rotation procedure and verify old signed evidence | P12; key-history/version limitations cannot be hidden or fixed by changing semantics |
| G13 | Export signed owner-filtered Relay audit bundle through existing trusted operator service, import MyEve receipts, correlate local Run separately, measure envelope, retention, alerts, restore and cleanup | P13–P17; no new remote audit API; scan evidence for private/secret data |

**Coverage limitation:** the selected peer reuses a full receiver in a separately operated MyEve installation. Its source supports the required boundaries, but hosted behavior, credentials, recovery and operator independence are not yet demonstrated. This is same-platform federation qualification, not Claude/Codex receiver certification. G12 still requires the unchanged single-active-key maintenance procedure. The hard budget remains missing; this document does not enforce it. All P01–P17 requirements remain mandatory.
