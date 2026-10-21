> Latest: [final engineering closure](final-engineering-closure.md). **HOSTED TARGET READY FOR RESOURCE PROVISIONING; overall NO-GO.** Local three-worker simulation and stop PASS. Relay retains direct KMS workload authority under the approved application-admission boundary. KMS provider compatibility and both external gates remain unverified/NOT_RUN. Earlier checkpoints below are historical where superseded.

> Current preparation: [KMS and isolated credential report](kms-preparation-report.md). Synthetic Vercel secrets are staged on disabled branches; KMS and hosted controls remain incomplete. Both external gates are NOT_RUN. Earlier status below is historical where superseded.

> Current status: [authorized target report](authorized-target-report.md). Three schemas are prepared with credentials revoked; hosted construction stopped at the existing Relay KMS/HSM contract. Neither external gate ran. Earlier preparation statements below are historical where superseded.

# Qualification deployment target — blocker-closure update

**NO-GO — EXTERNAL QUALIFICATION PENDING. Both gates NOT_RUN.** Local source fixes exist; there is no executable three-party hosted target. No hosted infrastructure, credential, account, domain or flag was changed. The frozen pins remain MyEve `60d341f9909936f03e4d72e1a7f845721ef82c46` and Relay `614c638d6fc4099db8064540326f5de4438e93a1`. Proposed successors and exact regression results are in [the closure report](deployment-blockers-report.md).

## Current inventory and reuse

Authenticated metadata snapshot: [hosting inventory](evidence/blocker-closure/hosting-inventory.json), observed 2026-09-20T17:41Z. Environment names/scopes only; no secret values or owner rows. [Database metadata](evidence/blocker-closure/database-access.json) records PostgreSQL versions, hashed endpoints and provisioning privileges, not data.

| Resource | Observed | Decision |
| --- | --- | --- |
| MyEve Vercel | `sofie-personal-agent`, project `prj_L6faw25wnFGUZtrLKBIccg8gIDLR`, Node 24.x, root `apps/eve`; production `dpl_CjbdgUWpszU2nV8srA2m2egmoKgY`, SHA `1d20be474e7841871001cf592b8f523a178770e1` | Reuse hosting project subject to branch-level isolation; exclude personal production alias/data. |
| Exact-pin MyEve preview | `dpl_95jNGPuqEGhuBe2QXpkcUnh8v9U7`, SHA `60d341f…`, Ready | Hosting precedent only; not proved synthetic. Do not reuse its datastore or active branch. |
| Relay Vercel | project `prj_3IRvr9knK5VJcBTgTYMvhv6ixmJK`; production now `dpl_4SZwzNJ4jML9ACR2DCdWC7jLTwos`, SHA `7ea29b2886d2b8bad7b1a1ca1c3e8df1d39ee9ee`, host `relay-4j3wj2jrq-jaydubya818.vercel.app` | Current production has advanced and is excluded. Deploy the separately qualified successor on an isolated branch only after prerequisites. |
| Relay latest preview | `dpl_3aa1PgPAHzpw6PSuczJDc5ifgyhr`, `relay-lne28pb5e-jaydubya818.vercel.app` | Not qualification evidence. Do not disturb concurrent owner-preview work. |
| Existing Neon | Distinct MyEve and Relay endpoints; PG18.6 on both; existing administrative connections can create databases/roles. Relay marketplace resource `store_NoIIiEgH5AoDvwL5`, Free/free_v3 | Reuse existing resources, subject to capacity and authorization. Three fresh template0 DBs and separate restricted roles still missing. Never clone production rows. |
| Vercel TLS/protection | Existing TLS; both project policies `all_except_custom_domains`; branch settings broadly inherit database aliases | Reuse TLS, retain protection. Resolve *every* inherited secret alias before deployment. New DATABASE_URL alone is insufficient. |
| Railway | Read-only CLI inventory exposes only unrelated `mission-control-bot` production project | Do not repurpose it. No suitable existing worker host identified; obtain existing runner or explicitly approved provisioning scope/cost. |
| Artifact storage | Both MyEve installations have existing encrypted database-backed federation artifacts and proof-enforcing HTTPS routes | No new bucket or personal Blob needed. Exclude provider-event body retention. |

Canonical MyEve source observed at `d4c374c79cb9a909b50befc91b4bc5bd8c14fd1f`; canonical Relay at `7ea29b2886d2b8bad7b1a1ca1c3e8df1d39ee9ee`. Neither was substituted into the frozen source clones. Hosting Ready is not configuration, isolation or qualification evidence.

## Selected three-party topology

```text
Vercel synthetic MyEve/Sofie installation A (proposed MyEve successor)
  own empty Neon DB / owner / session / encryption / artifact identity
  supervised existing relay-worker.ts process A
                 ↕ HTTPS; protected ingress + application authentication
Vercel synthetic Relay installation (proposed Relay successor)
  own empty Neon DB / persistent Ed25519 signer / RSA owner-bound wrapper
  existing Relay maintenance worker
                 ↕ HTTPS; protected ingress + application authentication
Vercel synthetic MyEve peer installation B (same proposed MyEve successor)
  own empty Neon DB / owner / session / encryption / artifact identity
  supervised existing relay-worker.ts process B; separate human/operator context
```

Reuse the two Vercel projects for three separately configured previews **only if resolved environment scope and operator access can be isolated**. Existing bypass secrets can have project-wide scope: do not give a peer operator project administration or a credential that admits personal production. If fine-grained access cannot satisfy this boundary, stop for an owner decision on a dedicated minimal project; no new paid service is presumed authorized. General production federation stays disabled. Flags are deployment-wide, so isolation is by synthetic-only installations, not a purported per-tenant flag.

The independent peer is a second real MyEve installation. Existing code implements authenticated binding, signature verification, durable claims, explicit projections, private-state separation, knowledge.query, messages, work, local refusal, safe execution, artifact proofs, receipts and persisted recovery. It has independent keys/state/administration; implementation prepares but another operator controls B during the gate. There is no new Agent platform or disposable receiver shim.

Codex 0.153.3 and Claude Code 2.1.270 have existing V1 MCP integrations and recorded real-client compatibility. Neither inspected integration supplies a complete durable federation receiver. They can be auxiliary requester clients; neither is selected to satisfy the receiver gate. No heterogeneous vendor interoperability claim follows from two MyEve installations.

Difference from Ava: immutable real Next deployments, actual Vercel ingress, managed PostgreSQL, persistent key identity, separate durable peer state, independently controlled receiver, supervised restarts and retained operational evidence. These are **target requirements**, not properties already measured here.

## Runtime and configuration requirements

| Component | Required runtime/configuration | Current delta |
| --- | --- | --- |
| MyEve A and B | Node24, Next16, locked npm dependencies, 27 normal migrations through0027; separate signed owner/session, DB, Relay Agent bearer, 32-byte encryption key and Ed25519 artifact key per installation | Source locally qualified; hosted installations missing. No personal connectors, memory services, channel credentials or Blob settings. |
| Relay | Existing Node-compatible Next15.5.22 build, normal22-entry migration journal; exact HTTPS issuer; explicit existing production mode/action/federation gates on isolated preview only | Startup candidate locally qualified; hosted deployment missing. Keep current production/private-preview guards unchanged. |
| PostgreSQL | Three empty databases, three non-superuser application roles, TLS, no cross-DB access or inherited production privileges; schema/migration and metadata-only denial evidence | Authorized creation blocked. Prepared script is syntax-checked only, not an isolation attestation. Backup/retention/free-tier limitations require operator record. |
| Ingress | Server-only exact-origin `MYEVE_RELAY_INGRESS_SECRETS` on A/B; supported Vercel automation bypass header; existing owner/Agent auth and artifact proof remain authoritative |14 tests plus full regression; actual protected ingress smoke NOT_RUN. No bypass minted or project protection weakened. |
| Workers | A/B existing serial5s pollers and Relay30s maintenance; supervised restart/health/logs/stop; least-privilege component secrets | Host and worker identity BLOCKED. Hosted startup, bounded retry, poison handling, duplicate suppression, recovery and clean shutdown unproved. No queue/new worker architecture. |
| Custody | Opt-in Relay `managed-secret` backend: persistent Ed25519 PKCS8 signing and RSA≥2048 PKCS8 wrapping secrets with version IDs. Separate Relay credential encryption secret and A/B federation encryption/artifact identities | Vercel sensitive secrets are a supported *candidate*, awaiting owner acceptance of exportable runtime keys. Existing KMS/HSM not identified. No fallback or generated production key. |
| Telemetry | Correlated request/Agent/decision/attempt/receipt/Run/artifact metadata, measured latency/cost, signed audit export, redacted operator log | Existing code/storage reused; hosted export location/access and redaction drill BLOCKED. Private body logging not authorized. |
| Budget | Atomic aggregate120 submissions/2000HTTP, concurrency2/model1, hard$5 reservation/provider cutoff,64KiB streaming bound,60min persistent deadline | NOT IMPLEMENTED/PROVEN. Existing protocol limits/estimated work budgets do not establish these aggregate limits. All hosted/model execution blocked. |

MyEve A/B secret names: `MYEVE_OWNER_ID`, `MYEVE_ACCESS_PASSWORD`, `MYEVE_SESSION_SECRET`, isolated `DATABASE_URL`; after isolation and authorization `MYEVE_RELAY_ENABLED=true`, exact `MYEVE_RELAY_ORIGIN`/`MYEVE_RELAY_OWNER_ORIGIN`, `MYEVE_RELAY_KEY_ID`/`MYEVE_RELAY_PUBLIC_KEY`, `MYEVE_RELAY_ENCRYPTION_KEY`, `MYEVE_RELAY_ARTIFACT_PRIVATE_KEY`/`MYEVE_RELAY_ARTIFACT_ORIGIN`, `MYEVE_RELAY_INGRESS_SECRETS`. Provider credentials must be isolated and budget-enforced before model execution.

Relay secret/config names: isolated `RELAY_DATABASE_URL`, fresh `RELAY_SESSION_SECRET`/`RELAY_ENCRYPTION_KEY`, exact `NEXT_PUBLIC_RELAY_URL`/`RELAY_ISSUER_URL`, controlled signup then `RELAY_ALLOW_SIGNUP=false`; isolated-only `RELAY_DEPLOYMENT_MODE=production`, `RELAY_V2_ACTIONS_ENABLED=true`, `RELAY_FEDERATION_ENABLED=true`; `RELAY_CRYPTO_BACKEND=managed-secret`, `RELAY_SIGNING_KEY_ID`/`RELAY_SIGNING_PRIVATE_KEY`, `RELAY_WRAPPING_KEY_ID`/`RELAY_WRAPPING_PRIVATE_KEY`; maintenance interval30000ms. Do not set these project-wide. All ordinary defaults remain disabled.

## Key custody and rotation boundary

[Vercel sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables) can store secrets unavailable for normal dashboard/API readback; running code still receives plaintext keys. Project deployment/admin identity and server code are therefore inside the trust boundary. Startup validates keys, derives public material and fails closed on invalid/missing configuration; errors are generic. Access/audit retention and backup/recovery must be confirmed by the operator. This is not non-exportable KMS custody.

Versioned configuration preserves existing provider contracts. Stop admissions/workers, drain/reconcile pending ciphertext, archive public verification material and custody old private wrapping keys, rotate versioned secrets, redeploy every instance, update exact receiver pins, and test old-token denial plus evidence verification. Existing single-active-wrapper/key-pin constraints prohibit claims of seamless multi-key rotation. No protocol/history behavior was added. Agent bearer rotation/revocation uses existing owner routes.

Ingress solution uses the supported [Vercel automation bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation). Separate endpoints/proxies were rejected as unnecessary new routing infrastructure; globally disabling protection was rejected. Actual plan/project scope must be verified before issuing a credential to an independent operator.

## Stop and remaining implementation work

Obtain explicit database authorization, custody selection and worker host/scope first; no spend ceiling for infrastructure has been supplied. Before any hosted smoke, implement and test hard shared admission and cost reservation using the chosen runtime/provider. A soft provider spend alert is insufficient. Include retries, worker polls, artifacts and owner traffic; no bypass route or counter reset on restart. Test exact-cap and cap+1, simultaneous admission, crash/restart, missing state, failed usage reconciliation, timeout and streaming size overflow. These tests and controls are not claimed completed.

Emergency procedure: operator stops admissions, revokes test Agent credentials/grants, pauses publications, stops all three workers and peer process, removes synthetic opt-in and redeploys; verify denial within60s and reconcile in-flight calls within their60s deadline. Removing an env var does not instantly stop existing processes. Local disabled-state probes passed; complete hosted emergency-stop drill remains NOT_RUN. Budget/window watchdog requires an independent supervisor.

Provision through normal supported synthetic owner flows only; IDs remain unassigned until registration. See [session contract](qualification-session.md) for identities, complete P01–P17 golden path, latency/availability/retry/recovery/retention/cleanup acceptance targets. No external gate or full golden path is authorized by target preparation. Exact deployment URLs/IDs, independent operator/assessor names, secret references, worker identity, evidence destination and test window remain BLOCKED in the target record.
