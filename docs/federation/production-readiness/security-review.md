# Independent security review and penetration-test package

The frozen target handoff is prepared in [assessor-target.md](assessor-target.md). No assessor has been contacted and no adversarial test executed; implementation cannot mark this gate PASS.

Status: PREPARED, NOT EXECUTED by an independent assessor. See README for immutable pins and closure rules. This package is scoped to federation and its authority dependencies, not a certification of all MyEve or Relay.

## Reviewer handoff

Record assessor identity, organization, dates, independence from implementation, exact source/tree hashes, dependency lock hash, target deployment versions, tools and exclusions. Review source before testing deployed ingress. Assess both authorized-user abuse and unauthenticated attacks using two independent owners, two sibling Agents, and an unrelated third owner. Use synthetic private canaries and explicitly published benign records. Review production infrastructure controls alongside application code.

No external tests start until target URLs, operator authorization, time window, test accounts, traffic and spend ceilings, and emergency contact are recorded. Stay inside test-owned tenants and artifacts. No destructive production migration, customer-data extraction, unrestricted stress test, social engineering, or third-party targeting. Stop on unintended access, unbounded spending, real-user impact, or an isolation failure; retain redacted evidence and alert the named operator. Clean up grants/publications/credentials/test data after evidence capture. The coordinator has not sent this package to anyone.

## Source and trust-boundary map

All paths below are repository-relative at the pinned MyEve SHA.

| Boundary | Source to inspect |
| --- | --- |
| Owner identity, same-origin mutations, disabled routes | apps/eve/lib/relay/owner-api.ts; apps/eve/lib/web-auth.ts; apps/eve/app/api/relay/route.ts |
| Signing pins, identity, lifetime, ciphertext owner binding | apps/eve/lib/relay/transport.ts; client.ts; contracts.ts |
| Explicit projection publication and revocation | apps/eve/lib/relay/owner.ts; projection.ts |
| Durable inbox/replay/concurrency | apps/eve/lib/relay/inbox.ts; store.ts; apps/eve/migrations/0027_relay_federation.sql |
| Local Agent/Run/capability/approval and model authority | apps/eve/lib/relay/work.ts; imported canonical action-gateway/executor/authority modules |
| Source-owned artifacts and outbound requests | apps/eve/lib/relay/artifacts.ts; apps/eve/app/api/relay/artifacts/[id]/route.ts |
| Receipt provenance, expiry and owner UI | apps/eve/lib/relay/receipts.ts; store.ts; apps/eve/components/relay-panel.tsx |
| Worker lifecycle and environment | apps/eve/scripts/relay-worker.ts; deployed ingress/supervision/secrets configuration |
| Relay side of protocol | Pinned Relay docs/federation/platform-contract.md and production handlers/services it describes |

Paths abbreviated after the first entry in a row share its directory. Review transitive authority dependencies; federation cannot be assessed solely by grepping the adapter. Existing `adapter.test.ts`, `review-regressions.test.ts`, `work-authority.test.ts` and historical evidence provide reproductions, not reviewer conclusions.

## Mandatory adversarial matrix

Each case needs input/actor/resource, expected denial or bounded output, observed response, side-effect/DB/runtime proof, UTC timestamps, correlation IDs, deployment versions, and a PASS/FAIL/NOT_RUN result. HTTP status alone is insufficient for execution or isolation claims.

| ID | Exercise | Required security property |
| --- | --- | --- |
| S01 | Missing/false/malformed opt-in; direct owner and artifact endpoints; worker startup | Owner GET says disabled, mutations/artifact return 404, client and worker refuse; no DB/model/network work |
| S02 | No/forged/expired owner session; development bypass; cross-origin POST; spoof forwarded host | Authenticated exact owner and pinned browser origin required; no mutation |
| S03 | Swap owner/Agent/resource/request/artifact IDs, including sibling Agent | No cross-owner or sibling-Agent read, decision, result, or credential use |
| S04 | Forged/wrong-key/algorithm/issuer/audience/target JWT, malformed fields, expired/future times | Reject before durable acceptance/execution; no request-supplied trust key |
| S05 | Duplicate/parallel delivery, renewed signed assertion, altered payload under same key, replay after restart/expiry | Durable idempotency and payload binding; one execution; no resurrection |
| S06 | Relay-authorized work without local capability; forged/stale/reused approval or lease; revoke/disable Agent between checks | Canonical authority consumed immediately before model work; no consequential transport escape |
| S07 | Parallel budget admission and overlapping approvals; expiry during model call | No excess authorized budget or action count; bounded deadline and accountable cancellation |
| S08 | PRIVATE/unconfirmed/stale/tampered preview; revision change; revoked/paused publication race | Only exact owner-confirmed current projection; local denial survives remote ambiguity |
| S09 | Prompt injection in query, external record, message and artifact; private canaries across Knowledge/Memory/Goals/conversation/Workspace | No private retrieval, unrestricted tools, canonical promotion or hidden context disclosure |
| S10 | Artifact URL alone, wrong recipient proof, replay after revoke/expiry, tampered size/hash/type | Exact source and recipient binding; denied stale retrieval; bounded content; no cache disclosure |
| S11 | Artifact SSRF: redirects, userinfo, alternate ports, loopback/private/link-local IPv4/IPv6, DNS changes at trusted origin | No unauthorized internal/metadata access or credential forwarding; verify deployed egress controls, not only URL syntax |
| S12 | Truncated/forged/reordered/foreign-owner audit bundle; rotation across historical receipts | No false signed disclosure claim; honest key-history limitations and validated recovery |
| S13 | Oversized/chunked/malformed bodies, slow responses, poll flooding within agreed limits | Bounded memory, time, retries and requests; no secret-bearing diagnostics |
| S14 | Owner-rendered external content, markdown/link payloads, artifact MIME, shared caches | No script execution, credential exposure or cross-owner cache leak |
| S15 | Stolen/revoked Agent credential; encryption-key wrong owner; key rotation/restore | Old credential denied, stable address, protected at-rest data and documented fail-closed recovery |
| S16 | Process death before claim/after claim/in-flight/after completion with lost response | Durable recovery without blind uncertain execution retry; result acknowledgement can recover |
| S17 | Expired bodies during idle/offline worker; retention and backup inspection | Scheduled disposal meets declared policy; replay/audit metadata remains protected and sufficient |
| S18 | Deployed dependency and container scan; secret/log/config review | Findings triaged on actual lock/image; no leaked keys, unsafe debug surfaces or unaccounted exposure |

## Known qualification gaps to investigate (not asserted vulnerabilities)

The architecture explicitly states receipt imports accept the deployment's pinned signing key and key-history rotation is not implemented/qualified. Prove a workable controlled rotation/recovery procedure with historical verification or leave the gate open. Do not silently add key-history features.

Artifact origin pinning and redirect denial exist; production DNS and egress isolation are not established by local tests. Inspect the actual network boundary. Retention purge is called from polling/dashboard access; verify scheduling and idle/offline behavior operationally. A worker shutdown/flag change must not be assumed to cancel already running work. Measure runtime cancellation and shutdown behavior.

## Reporting and retest

For each finding record ID, severity, concrete impact, affected boundary/files/lines, target/version, minimal redacted reproduction, expected/actual results, exploit prerequisites, remediation owner, proposed resolution, and independent retest evidence. Include negative tests and exclusions. A scanner-only summary or prior AI PR review is insufficient. Sign the final assessment with date and exact tested candidate. Apply the README closure rules; NOT_RUN is never PASS.

Methodology reference: [OWASP Web Security Testing Guide](https://wstg.owasp.org/) for authentication, authorization, input validation and business-logic testing. The matrix above adds application-specific federation trust boundaries. This does not claim OWASP certification.
