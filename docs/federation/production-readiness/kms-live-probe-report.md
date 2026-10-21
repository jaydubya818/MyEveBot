# KMS compatibility probe — FAILED

Google Cloud KMS rejected a valid canonical Relay delivery signing input of **132,693 bytes** with HTTP 400 / INVALID_ARGUMENT: “Request field data must have length of at least 0, but not more than 65536. Provided value had length 132693.” No protocol, verifier limit, canonical serialization or signed bytes were changed. Signing stopped on this first incompatibility; no retry or smaller substitute was used.

Project `relay-local-qualification` (`1079783030880`), region `us-east4`. Created only keyring `fq-compatibility-probe`, CryptoKey `fq-ed25519-probe`, initial version `1`: SOFTWARE / EC_SIGN_ED25519 / ENABLED.

Exact version: `projects/relay-local-qualification/locations/us-east4/keyRings/fq-compatibility-probe/cryptoKeys/fq-ed25519-probe/cryptoKeyVersions/1`.

| Raw signing bytes | Base64 transport bytes | KMS | Relay verification |
|---|---|---|---|
| 1,091 | 1,456 | HTTP 200 | PASS |
| 22,993 | 30,660 | HTTP 200 | PASS |
| 61,725 | 82,300 | HTTP 200 | PASS |
| 132,693 | 176,924 | HTTP 400: maximum 65,536 bytes | No signature returned |
| 260,000 | 346,668 | NOT_RUN after mandatory stop | Local fixture valid; no KMS signature |
| 262,057 | 349,412 | NOT_RUN after mandatory stop | Local fixture valid; no KMS signature |

All six fixtures first passed the pinned Relay producer and canonical verifier using an ephemeral local synthetic key. Submission and publication inputs were each within their unchanged 128-KiB bounds. For all three successful live cases, 64-byte Ed25519 signatures passed CRC checks, direct verification against the KMS public key and Relay `verifyDelivery`. The exact maximum fixture produces a valid 262,144-character token locally. This does not claim Google signed the unexecuted maximum case.

Relay pin: `d817c848a7f6797fe04787e28ac96081b69359ae`. This operator provider-compatibility probe used the owner's existing authentication; it does not qualify hosted WIF/IAM, application admission or either external gate.

[Sanitized results and public key](evidence/kms-live-probe/results.json), [resources and cost](evidence/kms-live-probe/resources-and-cost.json), and [reproducible probe](../../../scripts/federation-readiness/kms-live-compatibility.mjs).

Conservative operation estimate: **$0.000015** for four sign attempts plus one public-key retrieval, counting the rejected attempt conservatively. Actual billed cost is not yet available. Key-version storage is approximately **$0.06/month**, prorated ($0.000082192/hour); the key remains ENABLED and retained. No destruction or other resources were authorized. [Google pricing](https://cloud.google.com/kms/pricing).

**KMS COMPATIBILITY: FAILED. NO-GO — EXTERNAL QUALIFICATION PENDING / KMS PROVIDER INCOMPATIBLE WITH THE UNCHANGED CANONICAL ENVELOPE.** Federation remains disabled. Independent security and production-platform qualification remain NOT_RUN. No hosted deployment, additional key, IAM/WIF resource or Railway service was created. Further provider/design decisions require owner direction; this task makes none.
