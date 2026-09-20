# Frozen independent assessment target — prepared, not dispatched

Status: TARGET_NOT_READY. The implementation coordinator cannot set the security gate to PASS. No assessor was launched or contacted, and no adversarial requests were sent.

The independent assessor receives the existing [security-review.md](security-review.md) S01–S18 matrix, [deployment target](deployment-target.md), [session budget](qualification-session.md), source pins, current qualification docs, local prior evidence with its limits, and an immutable hash manifest. The candidate target is the same segregated hosted MyEve ↔ Relay ↔ real Codex environment used for production qualification, after infrastructure and receiver prerequisites are resolved. It is not either personal production alias and not the Ava harness.

## Freeze before handoff

Operator and product owner must complete the target record with: exact immutable deployment IDs and URLs, MyEve/Relay SHA and any separately reviewed deployment bootstrap SHA, receiver source/version, Codex binary version/hash, dependency/image hashes, synthetic account/Agent addresses, allowed host/path list, signing public fingerprints, key version IDs, database isolation attestation, scope window, rate/spend controls, emergency contacts and independent assessor identity. Secret locations are delivered through the approved vault; credentials are never part of the frozen package.

Freeze files with SHA-256; assessor verifies against the separately delivered expected digest and checks target identity before testing. No moving branch/alias accepted as sole identity. Any implementation/deployment/config change during review pauses the review, produces a new target digest, and triggers assessor-led retest. The operator must not import private production DB rows to seed the target.

## Separate context and role boundary

The assessor uses a fresh task/session and separate OS identity/runner, not an implementation conversation, agent child with inherited history, shared credential store or shared editable checkout. Supply the frozen package rather than an implementation transcript. The assessor did not author target code and must record independence. Access is restricted to synthetic owners, metadata and test artifacts; source is read-only. The implementation coordinator may answer written factual questions and implement separately approved fixes later, but cannot author the assessor's conclusion or convert its findings into PASS.

The real Codex peer session is also separate from implementation. Operating the peer is not itself independent security assessment. Assessor identity and peer operator may differ; conflicts must be disclosed. No model choice or reviewer assignment has been made on the owner's behalf.

## Prepared rules of engagement

- Explicit host/path scope includes MyEve owner/artifact endpoints, Relay owner/Agent federation REST/MCP endpoints, peer's approved receiver/artifact service and authorized synthetic auth flows. Canonical personal aliases and unrelated connectors/providers are excluded.
- S01–S18 are mandatory, including all cross-owner/Agent, signing/replay, publication, authority, artifact egress, runtime, cryptographic recovery and retention boundaries.
- Use the separately authorized 60-minute, 120-submission/2,000-HTTP, concurrency-2, USD-5 session cap. If the assessor needs more time/cases, return a revised scoped request before execution. Do not use this cap to claim comprehensive coverage where not achieved.
- No destructive or availability-impacting tests outside the designated synthetic target. Stop immediately on private-data exposure, cross-owner effect, cost uncertainty or operator stop signal; preserve redacted evidence and notify the operator through the agreed channel.
- Assessor signs findings and retests with exact target digest; human product owner accepts only permitted residual findings. The implementation agent records receipt of that assessment and keeps the gate pending until the independent authority signs it. Existing closure rules remain unchanged.

## Handoff prompt (not sent)

Independently review and penetration-test the frozen MyEve federation target described in this package after verifying operator authorization, target digest and controls. You did not implement this target. Use only the approved synthetic identities and S01–S18 scope, remain within the session envelope, and stop on a boundary violation or missing prerequisite. Produce evidence-backed findings, exclusions and NOT_RUN cases, then independently retest any authorized remediation. Do not treat prior implementation tests, PR review, hosted Ready status or successful MCP connection as security approval. Identify your context and independence, sign your conclusion against exact source/deployment/configuration versions, and leave the gate pending wherever mandatory evidence is absent.
