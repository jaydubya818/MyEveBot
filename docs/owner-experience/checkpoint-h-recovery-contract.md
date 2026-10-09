# Checkpoint H recovery contracts

Owner-approved recovery starts at `2fc749237023e41dbd8bd03200aa02651fab25c9`. A–G remain accepted. Adoption, deployment, paid operations, tester changes, publication, generated PRs and automatic repair remain unauthorized.

## Private acceptance

This extends `engineering_owner_decisions` with `accept_private`. The existing canonical Result, Proof, Work, Needs You response and Work event remain the sources of truth. No second Result system is introduced.

A Needs You request is derived from the current canonical owner Work, retained signed candidate and independent verification. Its action ID binds the exact Result ID and a digest of owner, Work version/generation, criteria version, candidate commit/tree, proof hash, manifest and verifier digests, FactoryVersion, policy and execution authority. The browser chooses an answer; it cannot choose the evidence or completion state. The authenticated response is delivered through the existing inbox consumer.

The existing owner-scoped inbox idempotency key generates the stable response identity. The acceptance stores that response ID and its server-recorded decision timestamp, with a deterministic decision ID. Concurrent deliveries serialize on policy, authority, Work and owner-inbox locks. Exact replay returns the original decision; forged or corrupted bindings fail. Authentic answers made obsolete by Work change, cancellation, expiry or revocation receive a terminal stale receipt without completion; later inbox decisions can still deliver. One transaction inserts the immutable owner decision, advances Work version/generation to lifecycle `accepted` with paused control, and records its Work event. A crash after commit but before inbox delivery confirmation replays without another effect.

Completion requires active/unrevoked policy, the exact active agent-controlled Work revision, completed execution authority, independent PASS for the exact candidate and every current criterion, intact signed Result/Proof, confirmed cleanup, known settled Work accounting and no unresolved local exposure/tool effects. Current configured verifier keys and FactoryVersion are rechecked. Unverified PARTIAL, FAIL, stale, cancelled, revoked and UNKNOWN states cannot be accepted.

The Result and Proof remain byte-for-byte unchanged, including their historical PARTIAL outcome. Bound owner acceptance is a later fact. Readback recognizes completion only at the exact resulting Work revision; reopening or changing Work invalidates current acceptance presentation. Publication readiness remains false. Acceptance never invokes a model, Factory, publication, repair, branch push, PR, merge or deployment.

## Chat accounting recovery

The defect was local `DISPATCHED` reservation before the shared dispatch lease. A post-Work shared-fence rejection happened before any provider call, outside the model cleanup block. Local admission subsequently treated the unsent reservation as unresolved forever.

Migration 0091 creates explicit `PREPARED → DISPATCHED` and `PREPARED → NOT_DISPATCHED` compare-and-swap transitions. Only the unique dispatch claimant can call the provider. Rejection before that claim records authoritative no-send evidence. The original operation, reservation and fixed allowance charge remain; nothing is refunded or recycled. Once claimed, timeout/unknown usage remains reserved. Legacy DISPATCHED rows receive no speculative backfill.

The separately installed shared-accounting recovery schema supports exact-operation no-send tombstones. It cancels a shared lease or inserts a tombstone that rejects a delayed grant request after acknowledgment loss. The application requires the matching local owner/policy/Sofie NOT_DISPATCHED fact first. Scheduled reconciliation cancels only aged PREPARED rows and repeats durable cancellation/settlement facts. Provider claims race safely with cancellation on the same locked row. UNKNOWN is irreversible. A lost shared settlement acknowledgment preserves local known SETTLED usage; it does not poison the allowance as UNKNOWN.

Shared repair outages remain fail-closed for new paid admission but do not prevent non-paid Factory readback, cleanup or authority expiry processing. A shared-schema rollout would require separate deployment authorization; this work only tests disposable local/CI databases.

## Same-conversation readback

An initially unbound conversation may adopt the single Work that its exact owner/Agent/session/thread created, using a server-retained `engineering_work` creation effect. Reading old Work does not qualify; an existing selection is never replaced. The owner still explicitly chooses continuation intent before asking Sofie to start Work.

The post-start acknowledgment comes from the exact completed Factory tool effect and authority. The narrow text-only question “What did you change?” reads the single canonically associated Work's retained Result/Proof directly. Multi-part requests with additional text, foreign or ambiguous associations, and fabricated tool outputs do not qualify. These replies call no provider and create no allowance, Work, intake, writer or candidate. Authentication, current Agent policy and session binding remain prerequisites.

## Screenshots and qualification

Original historical screenshots remain references with provenance **UNKNOWN**. They are not deleted, attributed to invented environments or used as authoritative release evidence. Their missing metadata is no longer a functional blocker under the owner's recovery approval.

New authoritative screenshots must record the exact candidate source SHA, fixture revision, synthetic owner identity, browser/version, viewport and feature policy. Screenshot fixtures must contain no tester data. Local exact-pixel comparison and hosted accessibility are distinct gates; accessibility cannot pass while the hosted run fails.

The first two hosted attempts for `ce2a5ac5` could not initialize PostgreSQL because Docker Hub timed out/rate-limited its public pull. Qualification now pins Docker's official PostgreSQL 17 image from [its public ECR repository](https://gallery.ecr.aws/docker/library/postgres) by immutable manifest digest. No database credential or production access was added; each hosted job remains bounded to 20 minutes and uses a disposable service database.

The implementation touches accounting, acceptance, readback and their UI consumers because this is one end-to-end lifecycle. Existing ordinary publication contracts, frozen migrations and tester evidence remain preserved. New app migrations 0091/0092 and the standalone shared accounting upgrade are additive release-impact items and require coordinated rollout only after explicit adoption authorization.
