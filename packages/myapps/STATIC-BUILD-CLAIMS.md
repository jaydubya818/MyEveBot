# Static build claim contract proposal

Status: **PROPOSED INTERNAL CONTRACT; NOT APPROVED FOR RELEASE USE**.
`static-build-claim.ts` verifies a configured producer's signature against exact
retained bytes. It adds no producer signer, HTTP route, runtime registration,
installation, independent acceptance or production authority. Existing Result
V1–V4 schemas and their artifact kinds remain unchanged.

The consumer is a future trusted backend adapter. It must supply the expected
binding from authenticated canonical Work/Result custody and the issuer policy
from independently authorized backend configuration. Neither input may come
from a model, generated app, wire claim, or unsigned inventory. This component
checks their mathematical consistency; it does not establish that authority.

The wire value is canonical JSON, at most 8192 UTF-8 bytes, with exactly
`payload` and `signature`. The payload contains exactly `schema`, `keyId`,
`binding`, `inventoryDigest`, `artifactDigest`, and `builtAt`. The schema is
`myeve.static-build-claim/v1`. The signature is canonical unpadded base64url
encoding of a 64-byte Ed25519 signature over the UTF-8 domain
`myeve.static-build-claim/v1` followed by one NUL byte and canonical payload JSON.

The binding names owner, Agent, app, Work/version/generation, request, run,
Factory/version/source/configuration, input commit/tree, candidate commit/tree,
lock digest, build-profile digest and deadline. All must exactly equal the
backend's expected binding. FactoryVersion is recomputed from source and
configuration digests. Source commit/tree/lock and both artifact digests must
match a genuine `StaticArtifactCandidate` created through validated retention.
There is no JSON-to-candidate hydration or disk/network fallback.

The issuer policy pins an Ed25519 public SPKI SHA-256, key ID, build-provenance
purpose, owner, Factory/version and build profile. It contains no private key.
The build timestamp must be canonical UTC, within the key's validity window,
no later than the bound Work deadline and no later than the observation time.
A revoked configured key is refused. An otherwise valid historical signature
can still be inspected after its deadline or key validity window ends; that
inspection cannot renew a Work, authorize adoption or retry execution.

The immutable result reports only a signature matched to the configured key and
retained artifact. `independentVerification` remains `NOT_ESTABLISHED`,
`signedResult`, `releaseQualified`, and `installed` remain false. A signature
does not prove that the producer executed its declared compiler or derived the
bytes from the source. Protected independent verification remains necessary.

The stable public error is `APP_BUILD_CLAIM_INVALID`, with no key/parser detail.
This is a pure read: no persistence, reservation, charge, provisioning, process,
provider call, retry or cleanup occurs. Repeated verification has a stable
claim digest. A future effectful consumer must atomically recheck current
owner/Work/Result/key/profile/installation authority and use existing monotonic
installation/delivery revisions. This result is not an authorization token.

Ordinary tests use only in-memory source, byte arrays and ephemeral synthetic
keys. Independent contract review and the authorized custody/profile approvals
are still required before a runtime may adopt this proposal.
