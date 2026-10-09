# Canonical Relay v2 convergence

Authority: Relay main `e2eb350f5655427d55cc204264020a9295173f96`; MyEve pre-convergence checkpoint `f3aa77397c158884f625f9d556ed298d77cc2d9f` is preserved. This comparison was written before adapting MyEve.

| Property | Historical c910c9d | Canonical e2eb350 |
|---|---|---|
| Compact wire | unpadded base64url(header).base64url(claims).base64url(signature) | Same framing |
| Header | alg=Relay-Ed25519-SHA256-v2, typ=relay-federation+digest, kid, v=2, purpose=federation-delivery | alg=Ed25519, typ=relay-federation-v2, kid, keyVersion |
| Domain | commitment domain=relay.signature | commitment protocol=relay.federation |
| Digest | SHA-256 of exact UTF-8 header.payload segments; payloadHash lowercase hex | Same bytes and hash; payloadDigest lowercase hex |
| Commitment fields | domain, version=2, purpose=federation-delivery, hashAlgorithm=SHA-256, payloadHash | protocol, version=2, purpose=federation-delivery, payloadDigestAlgorithm=SHA-256, payloadDigest, signingAlgorithm=Ed25519, keyIdentity={id,version} |
| Algorithm binding | protected header plus Ed25519 primitive | protected header, commitment signingAlgorithm, Ed25519 public-key type validation |
| Key binding | kid hashed in protected header | kid and keyVersion hashed in header, duplicated in signed commitment keyIdentity |
| Version binding | protected v=2 and commitment version=2 | protected typ=relay-federation-v2 and commitment version=2 |
| Purpose binding | header and commitment purpose | signed commitment purpose |
| Signature | pure Ed25519 over UTF-8 canonical commitment; 64 bytes / 86 base64url chars | Same primitive and representation; different signed commitment bytes |
| Canonicalization | recursive lexicographic object keys, JSON scalar serialization; strict roundtrip of both segments | Same; rejects noncanonical base64url, whitespace, duplicate properties and invalid UTF-8 |
| Verification input | reconstruct fixed historical commitment from exact received segments | reconstruct fixed canonical commitment and exact received key identity/version |
| V1 | explicit EdDSA / relay-federation+jwt raw material | Same explicit legacy branch; no retry/fallback from malformed v2 |
| Token bound | 262144 chars, header.payload maximum 262057 bytes | Unchanged; maximum+1 rejected before signer invocation |
| Provider input | 179 bytes | Variable bounded commitment, schema limits key ID to 255 and version to 512 UTF-16 units; explicit 8192-byte cap |

Security equivalence inspection: the complete serialized claims and protected header remain authenticated through SHA-256 and a domain-, purpose-, version-, algorithm- and key-bound Ed25519 signature. Moving fixed purpose/version into the signed commitment does not remove their binding. No format-based fallback is allowed. Runtime claim validation and durable replay admission remain separate from authentication. Successful verification never grants MyEve local Action authority. Deterministic adversarial checks must pass before integration.

KMS classification: cryptographic construction equivalent YES; exact provider invocation semantics unchanged YES (asymmetricSign data containing ordinary Ed25519 message bytes plus CRC); signed bytes unchanged NO; historical 179-byte live evidence directly applicable NO. Canonical Relay has separate committed live evidence under docs/federation/evidence/signing-envelope-v2; applicability requires source comparison. No new live KMS call is authorized or needed solely for serialization changes.

Historical 179-byte tokens were synthetic qualification artifacts in the preserved reports, not an enabled production protocol. Canonical Relay explicitly does not accept that format. Preserve reports/tests/vectors through their immutable Git history and copied historical test source; do not retain an alternate runtime parser.

Reverse direction: MyEve submits authenticated commands through RelayClient; Relay alone signs federation delivery assertions. MyEve artifact-source proofs and audit receipts use their distinct canonical contracts and must not be relabeled as v2 delivery signatures. Tests will verify MyEve reconstructed signing input with Relay verification without introducing a MyEve delivery signer API.

Local qualification passed: six canonical schema-valid cases through 262144 token characters; both verifiers agree. Re-signed wrong-purpose/version/domain/algorithm/key commitments, tampered payload, wrong signing key and downgrade all denied. Maximum+1 rejected with zero signer calls. Worst possible schema-valid escaped key metadata produces 4861 provider bytes; explicit cap 8192. Current maximum-size fixture uses 406 bytes. New KMS calls: 0. Diff from canonical live-probe implementation 68c8d8c to e2eb350 is empty across lib/v2/federation and lib/v2/evidence; canonical's own live evidence therefore applies. Historical 179-byte evidence remains distinct.

Canonical Relay CI already verifies the public fixture at docs/federation/vectors/signing-envelope-v2.json. MyEve stores a byte-identical copy and CI fetches the current canonical fixture, fails on drift, and exercises its verifier. Contract fixture SHA256: b690dcc401b985c007fecda8d4308be4449d5034c157fac163b89443e4c98bc5. This is drift evidence, not runtime authority or an exact-Git-SHA deployment requirement.
