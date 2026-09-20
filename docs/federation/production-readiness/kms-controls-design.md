# KMS design and shared qualification controls

**NO-GO — EXTERNAL QUALIFICATION PENDING / HOSTED TARGET INCOMPLETE.**
This continues readiness `068690d`, MyEve `a63b2fe`, and Relay `bbfcaa1`.
Neither external gate ran. No paid resources, application deployments, hosted
federation golden path, synthetic owners/Agents, or general enablement were created.
The original release pins remain unchanged. Implementation is not an independent
security assessment and cannot mark that gate PASS.

1. **Google Ed25519 verdict: COMPATIBLE at the documented API/cryptographic
   contract; hosted maximum-size acceptance remains UNVERIFIED.** Google specifies
   pure Ed25519 (`EC_SIGN_ED25519`, SOFTWARE protection) over raw `data`. Relay
   sends its exact existing UTF-8 signing input as base64 `data`, not a new digest.
   The provider checks CRC32C in both directions, returned version/protection,
   ENABLED state, algorithm, signature length and pinned public-key verification.
   Local tests cover 71, 4,096, 65,536, 196,608, 262,057 and 270,431 raw bytes.
   A local mock cannot prove the provider's size limit. The REST definition does
   not publish that limit; the documented 64 KiB **Encrypt/Decrypt** limit is not
   evidence of an asymmetric-sign limit. Obtain provider confirmation or an
   explicitly authorized test against an existing key before calling this proof
   complete. No new hashing, truncation or signature-format change was made.
   [Algorithms](https://docs.cloud.google.com/kms/docs/algorithms),
   [signing request](https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/asymmetricSign).

2. **Exact signed sizes.** Reproducible measurements use Relay's actual
   `signDelivery`, `verifyDelivery`, `canonicalHash` and input schemas; see
   `evidence/kms-controls/signing-sizes.json`. These are local synthetic fixtures,
   not hosted observations. Sizes below are bytes of raw signing input, before
   the GCP API's base64 transport encoding:

   | Artifact / fixture | Signing input | Complete token | Result |
   |---|---:|---:|---|
   | Representative message | 1,091 | 1,178 | Verifies |
   | Maximum ASCII message fields, fixed synthetic routing | 22,993 | 23,080 | Verifies |
   | Maximum JSON-escaped message fields, fixed routing | 132,693 | 132,780 | Verifies |
   | Maximum JSON-escaped work payload, fixed routing | 61,725 | 61,812 | Verifies |
   | 64 KiB artifact's metadata delivery | 1,478 | 1,565 | Verifies |
   | Representative knowledge query | 1,150 | 1,237 | Verifies |
   | Knowledge query joined to publication, each input under 128 KiB | 270,431 | 270,518 | Existing verifier rejects |
   | Audit receipt / provenance record hash | 71 | Not JWS | `sha256:` + 64 hex characters |
   | Audit-export manifest / Passport hash | 71 | Not JWS | Same existing hash representation |

   Ed25519 signatures are 64 bytes / 86 base64url characters. Consequently the
   existing 262,144-character JWS verifier admits at most **262,057 bytes** of
   ASCII signing input (subtract one separator and 86 signature characters).
   This is a verifier ceiling, not a guarantee that the producer caps at it.
   The reproduced knowledge join has an 88,347-byte query and 115,600-byte
   publication with five entries. The producer has no aggregate-envelope bound;
   configuration strings also lack a universal finite schema bound. Do not label
   the above fixtures universal schema maxima. Freeze small synthetic publications
   for qualification; record the existing oversized-join defect for disposition
   without silently changing federation semantics.

   Policy/capability/approval records and delegated provenance also sign the
   existing 71-byte canonical hash. Lease/workload tokens sign full compact-JWS
   inputs and are outside this target. MyEve artifact source and receiver proofs
   sign their full JSON-based JWT input with each installation's own Ed25519 key;
   the measured source assertion signs 243 bytes and receiver proof 713 bytes, both
   verified through the actual MyEve functions with synthetic store/fetch adapters
   (`myeve-signing-sizes.json`). Their verifier limits tokens to 8,192 characters, hence at most 8,105 signing
   bytes. Artifact content is hashed, not placed inside those signatures. MyEve
   proof custody is separate from Relay KMS and is unchanged in this mission.

3. **Purpose separation.** The authoritative Relay contract is
   `docs/v2/security/security-architecture.md:110–120` and `docs/v2/evidence.md`.
   The qualification bootstrap issues Passports before registration. Delivery
   uses a separate issuer/audience assertion; audit, approval/policy evidence and
   provenance use the evidence key. Workload sessions and capability leases are
   not exercised and get no active signer. The abstraction knows all five signing
   purposes; that is not a request to provision five signing keys.

   | Proposed CryptoKey | Algorithm | Version / application key ID | Signer and verifier audience |
   |---|---|---|---|
   | `fq-delivery` | EC_SIGN_ED25519 / SOFTWARE | `/cryptoKeyVersions/1`; `fq-delivery-v1` | Qualification Relay only; MyEve A/B delivery verifiers |
   | `fq-evidence` | EC_SIGN_ED25519 / SOFTWARE | `/cryptoKeyVersions/1`; `fq-evidence-v1` | Qualification Relay only; owner/assessor offline audit verifiers |
   | `fq-passport` | EC_SIGN_ED25519 / SOFTWARE | `/cryptoKeyVersions/1`; `fq-passport-v1` | Qualification Relay bootstrap; Passport verification |
   | `fq-envelope` | GOOGLE_SYMMETRIC_ENCRYPTION / SOFTWARE | `/cryptoKeyVersions/1`; versioned wrapper identity | Qualification Relay only; account-bound DEK wrap/unwrap, no public verifier |

   Full resource prefix is
   `projects/<OWNER_PROJECT>/locations/us-east4/keyRings/fq-6384519e0e01/cryptoKeys/`.
   Owner project and actual versions are unresolved, not invented deployed IDs.
   Envelope AAD must retain the existing owner-binding semantics (SHA-256 owner
   bytes). The remote KMS wrapper is still an implementation blocker. Do not send
   the current nonempty RSA-OAEP owner label to an API that does not support it.

4. **Minimum: four CryptoKeys, four initial versions.** Three asymmetric signing
   keys plus one symmetric envelope key. The environment KEK wraps per-payload
   random DEKs with owner-bound context; it never grants one owner another owner's
   data. No lease/session keys or object-storage service are provisioned for this
   federation target. A delivery and evidence rotation exercise temporarily adds
   two versions, not two CryptoKeys. Broader V2 qualification needs its own keys
   and resources and is not implied by this narrower set.

5. **Historical lifecycle implemented locally.** Registry binds key ID, version,
   purpose, Ed25519 algorithm, activation, retirement, revocation timestamp and
   state. One active signer per purpose; missing, wrong-purpose, unknown,
   algorithm-mismatched and revoked keys fail closed. New exports explicitly use
   the current evidence signer and include old public keys. A database-backed
   test verifies pre-rotation receipts after the old private signer is gone.
   Retired/administratively disabled keys retain historical verification; a
   compromised/revoked key is rejected even for historical signatures. Preserve
   affected records as untrusted incident evidence. The existing offline verifier
   still verifies cryptographic integrity; lifecycle verification additionally
   requires the trusted registry, not merely public keys supplied by a bundle.
   Close admission, disable the old KMS version, verify disablement, replace every
   process registry, and activate the successor before reopening. Never overlap
   old/new private signing rights. Retain public metadata at least 30 days for
   synthetic evidence. Wrapping-key ciphertext recovery remains separately needed.

6. **Vercel → KMS identity design.** Fresh read-only metadata confirms team-scoped
   OIDC is already enabled on both existing projects, plan Pro, no custom
   environments. Ordinary branch previews share the same OIDC environment and
   cannot provide qualification-only IAM by branch name. Use the existing Relay
   project's unused custom-environment slot, slug `federation-qualification`,
   with its real stable ID pinned. This creates no duplicate application project.
   No custom environment was created or secret scope changed in this mission.
   Source/deploy permissions and disabled Git auto-deployment must restrict who
   can deploy into that environment; its identity alone does not attest a commit.

   Request-scoped Vercel OIDC is exchanged at Google STS; no service-account key,
   ADC fallback or project-admin role. The checked renderer
   `scripts/federation-readiness/controls/identity-policy.mjs` refuses unresolved
   project number/custom-environment IDs. It requires exact issuer/audience,
   owner ID, Relay project ID, environment slug, stable custom-environment ID and
   subject. Grant a custom sign role (`get`, `useToSign`) on only the three
   CryptoKeys; a separate encrypt/decrypt role on only `fq-envelope`. No runtime
   create/update/destroy/IAM permissions. MyEve A/B and Railway workers receive no
   Relay signing access. Request token acquisition, STS composition and real IAM
   allow/deny tests remain unimplemented/unexecuted. The two local policy tests
   verify rendering constraints, not live IAM behavior.
   [Vercel claims](https://vercel.com/docs/oidc/reference),
   [custom environments](https://vercel.com/docs/deployments/environments),
   [Google STS](https://docs.cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token).

7. **Recommended KMS region: `us-east4` for an explicitly `iad1` qualification
   deployment.** Fresh metadata shows BOTH actual existing deployments in `iad1`;
   Relay's checked-in `vercel.json` instead requests `sfo1`. Do not silently assume
   that production metadata or repository config wins. The qualification-only
   deployment override must freeze all three web apps in `iad1`, retaining the
   actual existing topology; then Northern Virginia KMS is the appropriate nearby
   location. If the operator retains `sfo1` for Relay, use a western region after
   measurement instead. No region setting changed here. The security contract
   requires custody/availability, not a named US coast; changing the region does
   not relax purpose separation or introduce cross-region fallback.
   [KMS locations](https://docs.cloud.google.com/kms/docs/locations).

8. **Latency/availability envelope, not an observed SLA.** Qualification targets:
   warm KMS operation p95 ≤250 ms, p99 ≤1 s; provider metadata and sign each time
   out at 5 s with zero automatic retries. Admission p95 ≤100 ms; federation
   control request p95 ≤2 s excluding model work; delivery ≤15 s with healthy
   workers; bounded work ≤60 s. At least 99% of planned non-adversarial requests
   must complete within their stated bounds during the 60-minute window; any
   unexplained failure blocks qualification. A single-region KMS outage denies
   new signing; no local or historical private-key fallback. Measure cold STS
   exchange separately. Existing Relay delivery retry limit/backoff is unchanged;
   every retry must consume the shared request allowance. RPO 0 for committed
   control state; controlled process recovery target ≤60 s; uncertain operations
   remain fenced, not automatically resumed or refunded.

9. **$5 enforcement: durable reservation core implemented; hosted billing bound
   not yet proven.** PostgreSQL row locking serializes all admitted model calls
   across hosts. Reserve integer micro-USD before invocation, one model at a time,
   up to $0.25 per call, $2 MyEve A / $3 peer, at most eight A calls; stop new work
   at $4 reserved, never refund reservations. Duplicate operation IDs cannot
   execute again. Restart retains consumed/reserved budget and occupied slots.
   Unknown/excess actual cost closes the session. The model adapter polls stop
   state and aborts on deadline/lost authority. It still requires a verified
   worst-case liability bound from the selected provider/model configuration.
   A caller-supplied reference string and MyEve's current estimate do not prove
   that bound. No hosted model adapter is wired; model execution stays disabled.
   Do not describe these ledger tests as an enforced provider billing cap.

10. **Aggregate controls implemented and tested in shared PostgreSQL:** 120
    submission attempts, 2,000 admitted HTTP attempts including retries, two HTTP
    slots, two starts/second, one model slot, the reservation bounds above,
    65,536 actual bytes per artifact, eight artifacts / 524,288 aggregate bytes,
    45-minute new-work cutoff and 60-minute cleanup deadline. Clock comes from
    PostgreSQL after row lock. Missing/corrupt state and lock/DB failures deny;
    no auto-created fresh allowance. Ambiguous HTTP/model completion keeps slots.
    See `controls/postgres.mjs` and 21 local integration tests with independent
    connection pools. The schema has been installed only in disposable local DBs.

    **Not closed:** hosted ingress/model/artifact/worker adapters. Deploy one
    authenticated authority alongside the Relay worker, backed by a separate
    `fq_control` schema in the existing synthetic Relay DB. Only this controller
    may mutate the ledger; never give app credentials direct UPDATE/INSERT
    privileges. All public/direct-origin paths must fail closed without a
    one-use, request-bound permit. The forwarding controller owns an HTTP slot
    through body completion; artifacts buffer/validate before exposure. Workers,
    retries and model calls must use it. No unguarded provider credential may be
    released to a worker. This network integration is engineering work remaining,
    not a permission request or a completed hosted control claim.

11. **Emergency stop core implemented and tested.** Close durable admission
    first; attempt credentials, grants, queued-work denial, worker stop and model
    credential disable independently with timeouts; preserve evidence; apply the
    database brake last. One failed/hung action does not prevent the others;
    completion requires verified results from every adapter. DB loss also leaves
    out-of-band brakes available. The existing allowlisted DB brake uses NOLOGIN,
    credential invalidation and connection termination; it does not delete or
    rewrite application rows. Fresh read-only checks confirm all three staged
    roles remain NOLOGIN with zero sessions. Real revocation/queue/worker/provider
    adapters still require integration with immutable synthetic IDs and authorized
    APIs. They are not implemented by passing a callback that merely returns true.
    Target: admission closes ≤2 s; worker process groups TERM/KILL ≤5 s; all stop
    actions return verified/unconfirmed status ≤10 s. Preserve full model liability
    if client cancellation cannot prove provider termination. Existing local
    supervisor tests exercise an actual child ignoring SIGTERM.

12. **Three Railway workers; do not create yet.** Exact proposed specifications
    are in `worker-specification.json`. MyEve A/B use `a63b2fe` and independent
    owner identities/credentials; Relay uses the candidate source recorded in the
    evidence manifest, not an unqualified promoted pin. Each has one replica,
    Never restart, no volume, 0.5 GB RAM and proposed 0.25 vCPU cap. The provider's
    accepted fractional cap must be confirmed before this becomes an enforceable
    bill bound. Worker liveness must report a session-bound heartbeat to the
    shared authority every five seconds; no status means no fresh admission.
    Relay currently only runs maintenance and has no shared-controller supervisor.
    Its qualification entrypoint and guarded MyEve worker entrypoint remain to be
    implemented. Do not deploy the ordinary commands unsupervised.

13. **Changes and commits:** see `evidence/kms-controls/verification.json` for the
    final product commit and tested file hashes. Relay product commit
    `d1c4ed0c0ae1c246afb31b0f3c31178a4b8eda88` is separate from documentation/scaffolding
    commit `50a2c968a49620711dc8b7e55b8841a3d6a4bcc3`. Product changes are purpose
    routing, historical registry/export verification, raw Ed25519 provider,
    explicit hosted composition, production rejection of managed secrets, size
    measurement and tests. Readiness commit separately contains PostgreSQL
    controls, IAM renderer, specifications and evidence. MyEve source unchanged.
    No new federation capability or on-wire format was added. Frozen release
    pins remain MyEve `60d341f9909936f03e4d72e1a7f845721ef82c46`, Relay
    `614c638d6fc4099db8064540326f5de4438e93a1`.

14. **Regression:** complete Relay suite 243 passed / 4 skipped (45 files passed,
    3 skipped); final affected federation rerun 63/63; performance 2/2; disposable
    regression 46/46; readiness controls 43/43 (15 Python, 7 Node, 21 PostgreSQL).
    Typecheck, lint, build, migration metadata and negative startup smoke passed.
    Exact final counts and limitations are in
    `evidence/kms-controls/verification.json`. Preserve the initial failed runs:
    default 5-second DB tests timed out and cascaded fixture cleanup; the complete
    suite was rerun with 30-second local timeouts. One concurrent-run Playwright
    warm-route p95 exceeded its unchanged 200 ms threshold, again on a quiet
    rerun. Unchanged baseline `bbfcaa1` reproduces the same failure (p95 776.644 ms).
    Candidate browser results remain 2 passed / 1 failed. No threshold was weakened
    and this candidate is not promoted as completely requalified.
    Disposable Ava regression is not independent hosted-platform qualification.
    The old positive managed-secret startup smoke was deliberately replaced with
    a negative production-startup check. That checks refusal, not live KMS success.

15. **Google provisioning request is NOT ready for authorization.** Missing owner
    project ID/number and billing selection; no authenticated existing GCP project
    was available to inspect. Conditional exact resources: one qualification key
    ring, four CryptoKeys/four initial SOFTWARE versions, one workload identity
    pool/provider, two minimal custom roles/key-level bindings, and KMS Data Access
    audit logging with 30-day synthetic retention. No service-account private key,
    admin runtime role, HSM upgrade, or new storage bucket. Allow two additional
    signing versions for delivery/evidence rotation. At published rates the key
    component is **4 × $0.06 = $0.24/month**, or **$0.36/month** with six retained
    versions; 10,000 software crypto operations add **$0.03**, giving illustrative
    totals **$0.27 / $0.39**, excluding logging/egress/tax. Operation count is an
    estimate, not an implemented KMS spend cap. Approve actual billing scope only
    after payload support, identity composition and control integration are closed.
    [KMS pricing](https://cloud.google.com/kms/pricing).

16. **Railway request is also conditional.** Existing Hobby workspace
    `56a1e903-2507-4cd4-904b-9c57513046b4`; no unrelated service reuse. Three new
    bounded services, one replica each, no volumes, no automatic restart, maximum
    3,600 seconds INCLUDING startup and any manually authorized recovery. At
    $0.00000386/GB-second memory and $0.00000772/vCPU-second CPU, the proposed
    0.5 GB / 0.25 vCPU configuration totals **$0.041688** for three full hours of
    aggregate service time. A 0.05 GB aggregate egress allowance adds **$0.002500**:
    **$0.044188 variable runtime estimate**, excluding builds/tax/base subscription.
    Requested session ceiling would be **$0.10**, but the current scripts do not
    enforce Railway egress/build charges or provider resource shutdown; therefore
    $0.10 is NOT yet a demonstrated hard infrastructure cap. No paid approval is
    requested under a false ceiling. Existing account-level spend settings affect
    unrelated services and must not be changed implicitly.
    [Railway rates](https://railway.com/pricing),
    [cost controls](https://docs.railway.com/pricing/cost-control),
    [restart policy](https://docs.railway.com/deployments/restart-policy).

17. **Remaining operator inputs versus engineering work.** Owner: designate an
    existing GCP project/billing account; select who can deploy the qualification
    custom environment; approve the explicit `iad1` target override; supply named
    operator, independent peer operator, assessor, stop contact, test window, and
    a model/provider configuration with a verifiable per-call liability bound.
    No secret values belong in chat. Existing synthetic Vercel secret storage is
    already authorized and is not being requested again. Engineering: complete
    STS/KMS/wrapper composition, obtain size evidence, implement guarded hosted
    adapters/controller entrypoint and revocation/worker APIs, prove direct-origin
    bypass rejection, and resolve worker billing containment. Only then freeze
    actual versions/IDs and request the exact paid resources. Owner approval alone
    cannot turn the current scaffold into an enforced hosted target.

18. **Independent security gate: NOT_RUN.** Assessor must receive a frozen source
    package, target IDs, synthetic identities, rule-of-engagement budget and stop
    contact from a separate context after readiness prerequisites. Add the
    oversized projection join, wrong-purpose/retired-key attempts, raw signing
    boundaries, OIDC preview-versus-custom-env isolation, concurrent admissions,
    uncertain retries, direct-origin bypass and partial-stop failure to the
    adversarial target. This mission ran local regression only; no adversarial
    hosted traffic or assessor verdict was produced.

19. **Production-platform gate: NOT_RUN.** Target remains isolated hosted
    MyEve A/Sofie ↔ hosted Relay ↔ independently operated hosted MyEve B. It is a
    real existing receiver/executor rather than the disposable Ava adapter, but
    it does not certify heterogeneous vendors. Keep the existing runbook's full
    identity/publication/isolation/query/delivery/replay/revocation/message/work/
    local-refusal/execution/artifact/restart/credential/audit golden path. No hosted
    session begins until the aggregate controls and stop drill prerequisites work.

20. **Final verdict: NO-GO — EXTERNAL QUALIFICATION PENDING / HOSTED TARGET
    INCOMPLETE.** Signing/lifecycle and shared-ledger engineering advanced, but
    maximum-size provider acceptance and the hosted control path are not closed.
    Federation remains disabled. No paid infrastructure provisioned. STOP here;
    neither external gate is authorized or passed by this report.
