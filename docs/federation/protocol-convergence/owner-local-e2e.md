# Canonical convergence and owner local handoff — 2026-09-21

**MyEve final source integration complete. Relay final source integration complete. Canonical Relay v2 converged. Local deterministic HTTP integration PASS; model-backed Sofie federation journey PENDING AUTHENTICATION.** Independent security and production-platform qualification remain **NOT_RUN**. Production readiness remains **NO-GO — EXTERNAL QUALIFICATION PENDING**.

## Source and scope

| Checkpoint | SHA |
| --- | --- |
| Preserved pre-convergence MyEve | `f3aa77397c158884f625f9d556ed298d77cc2d9f` |
| This task's protocol adaptation | `310aab4ea15d54d80ad749eb5f627b91bda7b8f1` |
| This task's reviewed integration candidate | `fa8bc48831f4984a20b646596afe19c4fcca4958` |
| MyEve PR #4 merge | `400cadb59b868c62fcdc5f31c6d8418b40334fec` |
| Current MyEve main, including concurrent Computer/migration reconciliation | `380d6a30753e5983b51fd51b5d4c7758cd86177a` |
| Relay main / PR #12 merge | `e2eb350f5655427d55cc204264020a9295173f96` |

[MyEve PR #4](https://github.com/jaydubya818/MyEveBot/pull/4) merged after its required CI passed. Current MyEve main preserves that merge and the other qualified canonical lineage. The local applications were rebuilt/restarted after fast-forwarding to `380d6a3`; current checks below were repeated there. The final evidence checkpoint adds documentation only on the existing deployment-guarded `codex/federation-final-consolidation` branch. Its application source is identical to the canonical main SHA above. Both worktrees are clean at handoff and canonical local main matches origin/main.

## Protocol and KMS

The canonical contract is `relay-federation-v2`, signing domain `relay.federation`, version `2`, purpose `federation-delivery`. Exact protocol analysis is in [protocol-diff.md](protocol-diff.md). Historical 179-byte tests/evidence are retained as historical artifacts; runtime does not fall back to that format. Explicit canonical V1 remains separate.

Payload contract remains **262,144 token characters / 262,057 signing-material bytes**. Maximum-plus-one is rejected before the signer (zero calls). Cross-repository cases cover material sizes **1,291; 23,193; 61,925; 132,893; 260,000; 262,057 bytes**. Domain, payload, purpose, version, algorithm and key bindings pass; tamper, unknown variant, future version and downgrade cases deny. Immutable key-version pinning from the concurrent canonical merge is preserved.

The maximum-payload fixture produces **406 provider-input bytes**; another tested metadata shape produces 407. Worst schema-valid escaped key metadata produces **4,861 bytes**, with an absolute provider-input cap of **8,192 bytes**, below 65,536. Cryptographic construction and KMS invocation semantics are unchanged; serialization differs from the historical 179-byte evidence. That historical evidence is not directly byte-applicable. Canonical Relay has its own prior live report and unchanged provider implementation, so its evidence applies; no new live probe was needed. **New KMS calls: 0.** No new key/resource or provider spend.

Relay owns the shared vector; both repositories verify it. MyEve CI also checks the canonical publication for drift. Contract SHA-256: `b690dcc401b985c007fecda8d4308be4449d5034c157fac163b89443e4c98bc5`. This identifies evidence, not runtime authority or Git-SHA coupling.

Relay → MyEve: PASS, including an actual HTTP-poll artifact. MyEve canonical-byte reconstruction → Relay: PASS. Runtime reverse delivery signing is **not applicable**: MyEve sends authenticated commands and does not issue Relay delivery assertions. No fictional reverse signer was added. [Actual wire proof](owner-local/protocol-proof.json) records safe request/digest/key metadata; both verifiers pass at the captured receipt time and reject a tampered copy.

## Qualification

- Current MyEve: **853 Vitest + 135 Node PASS**, both typechecks/builds, registry/skill routing/Builder checks PASS; **545 classified executors, UNKNOWN 0**. Action Gateway, owner isolation and federation regressions included.
- Relay unchanged canonical: **314 passed / 5 disclosed opt-in skips**, 2 performance checks, TypeScript/lint/build/migrations/vector checks PASS. Affected signing/provider subset: 50 tests PASS.
- Migration: retained real-PostgreSQL canonical lineage qualification covers all 33 migrations, history reconciliation, rollback and checksum/authority preservation. This run additionally upgraded both isolated owner databases from 30 to 33 through the canonical runner; no shared database touched.
- Resource-free builds/startup PASS. MyEve redirects to authentication (307); Builder serves setup (200). No credentials/database/model supplied; runtime-provider attempts **0**.
- Earlier 13-scenario worker simulation covers artifacts, bounded mocked inference, refusal, restart, stop adapters and cleanup at its recorded source. It is not relabeled as live inference or as a fresh 13-case simulation of the later concurrent merge. Current-source HTTP evidence is separately recorded below.
- No private keys, credentials, browser sessions or captured bearer material are committed. [Current checks and log hashes](owner-local/checks.json).

## Running local topology

`Sofie (canonical MyEve) ↔ canonical Relay ↔ synthetic Atlas (same real MyEve worker, independent owner/database/credential)`

| Component | Local address / storage |
| --- | --- |
| Sofie owner UI | http://localhost:3001/chat |
| Sofie sharing UI | http://localhost:3001/manage/relay |
| Relay owner UI | http://localhost:3000 — V2 Agents `/v2/agents`, Activity `/v2/activity` |
| Atlas owner app | IPv4 `http://127.0.0.1:3002`; API owner origin `http://localhost:3002` |
| Relay federation ingress | https://127.0.0.1:3443 — local trusted certificate/proxy, no TLS verification bypass |
| Sofie engine | http://127.0.0.1:4274 — canonical Eve development server |
| PostgreSQL | existing Docker `relay-v2-test-postgres`, loopback port 55432 |
| MyEve database | `fq_owner_myeve_v2`, synthetic owner `fq-sofie` |
| Atlas database | `fq_owner_peer_v2`, synthetic owner `fq-atlas` |
| Relay database | `fq_owner_relay_v2` |

Synthetic Sofie Relay Agent: `agt_2b7c9c0f58f240d6afb51986449565ff`.
Synthetic Atlas Relay Agent: `agt_c30b1933dcd943ba9e61350f071beb0f`.
Full safe binding metadata: [connections.json](owner-local/connections.json).

Canonical local signing uses generated persistent local keys; no KMS. Local federation overrides remain enabled; source defaults remain disabled. Separate real workers poll every five seconds. Worker DB roles retain DML-only privileges. Separate local web roles own the legacy UI initialization tables and have CREATE within their isolated database schema; they have no superuser, role-creation, database-creation or RLS-bypass privilege. This local UI arrangement is not a hosted least-privilege certification.

Atlas advertises its name/capabilities only to explicit contacts. The pilot fact is SHARED only with Sofie under an explicit publication and grant. The private `Indigo-472` marker remains unpublished. No owner/private production data is present. Grants/publication are time-limited (initial publication expires approximately 09:30 Pacific on September 21); renew explicitly in the local sharing UI for later owner testing. Passports last 24 hours. Work remains at normal **owner approval** policy, with bounded synthetic grants; no model credential is configured.

## HTTP and UI evidence

[HTTP checks](owner-local/e2e-report.json) distinguish the initial canonical run and repeats after the concurrent main update. Passed: exact identity binding, contact-scoped discovery, explicit publication, published fact retrieval, private query/direct-reference denial, Agent-to-Agent messaging, durable inbox, revocation/restoration, actual canonical signed delivery, tamper rejection, audit correlation, and local authority refusal.

For double authorization, Relay grant **YES** admitted a signed safe `work.request`; MyEve local policy **NO** produced `MYEVE_LOCAL_POLICY_DENIED`, correlated in MyEve's local audit. Relay deliberately omits the private local reason from its result. No inference occurred. Authorized knowledge/messaging completed through existing local handlers; model-backed work is not claimed PASS. Successful Relay verification authenticates the request; it does not authorize MyEve actions. Published knowledge access grants neither private knowledge access nor consequential local authority.

[Audit correlation](owner-local/audit-correlation.json) links Sofie's outgoing request, Relay grant/publication and signed audit metadata, Atlas's completed incoming request, and Sofie's completed receipt. The sender's `relay_acknowledged` field is not a recipient acknowledgement; the actual recipient record is acknowledged. Evidence shows one delivery attempt for the correlated knowledge request. This is correlation evidence, not a newly imported signed audit-export receipt.

Relay outage left MyEve chat available and federation truthfully unavailable. Restart retained keys, identities, grant and terminal result. Additional polling did not re-execute completed work. MyEve restart restored the durable connection without registration. No peer backchannel was used for federation requests.

Initial Atlas latency was **6,247.5 ms**, including the real polling interval. The exact current-source repeat latency is retained in `e2e-report.json`; this is a local observation, not a production SLA or browser-p95 measurement.

Browser verification: Sofie shows the active Relay address/pinned key and normal local work policy; Relay V2 shows the active Agent/passport and real federation audit activity. Chat, engine info/health, threads and automations are available. Initial UI bootstrap permission errors were resolved with separate web roles; workers were not elevated. The authenticated browser remains open on Sofie chat and Relay activity. Model catalog/conversational inference remains unavailable without authentication; no mock is passed off as a live model.

No third synthetic Agent was created solely for cross-Agent testing. Exact owner/Agent/target scope denial remains covered by the cumulative adversarial tests. No observed private-data, impersonation, grant, signature, downgrade or Action Gateway bypass; this bounded evidence is not independent penetration testing.

## Owner handoff and limits

Open the already-authenticated Sofie browser. After supplying model authentication through the normal secure local setup and restarting the local web/engine with that credential, test: “Ask the Atlas Research Agent for the published pilot launch information,” then “Ask the Atlas Research Agent for any private internal code it has.” Expect the October 15 fact and no private marker. Model credentials were not searched, copied, printed or committed.

Private local process/configuration material is under `/private/tmp/canonical-owner-runtime` (directory 0700, secret files 0600); do not paste or commit it. This is session-local persistence, not a reboot-managed deployment. The running database/container and synthetic fixtures are intentionally retained. Stop only these owned process groups using their PID files; do not stop unrelated listeners. `start.mjs <component>` restarts a named component with its existing private configuration. Do not rerun `prepare.mjs`, which refuses pre-existing databases. An unrelated IPv6 listener on 3002 was left untouched; Atlas checks explicitly used IPv4.

No new cloud provisioning, Production deployment, shared Production/Preview DB mutation, Production KMS mutation or general federation enablement occurred. Git deployment guards remain on main and integration branches. Read-only post-merge deployment history showed no deployment for this task's canonical merge; the latest existing MyEve Production record remained `3d9f0e5`. That independent pre-existing release is not claimed as part of this work.

**Local E2E: PARTIALLY QUALIFIED — MODEL-BACKED SOFIE JOURNEY PENDING AUTHENTICATION. External gates: NOT_RUN.**
