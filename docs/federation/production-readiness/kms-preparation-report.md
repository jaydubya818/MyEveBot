# KMS and isolated credential preparation

**NO-GO — EXTERNAL QUALIFICATION PENDING / HOSTED TARGET INCOMPLETE.**

Observed 2026-09-20. This report supersedes the prior credential-upload stop in
[authorized-target-report.md](authorized-target-report.md). The owner's latest
approval explicitly names both Vercel projects. It does not authorize paid KMS,
new paid workers, external gates, or general federation enablement.

## 1. Vercel synthetic secret configuration

**Completed for database credentials and isolation overrides; application identity,
ingress and model credentials remain pending.** Created three inert Git branch
slots because Vercel requires the branch to exist before accepting branch-scoped
environment variables. Each placeholder tree contains only a disabled notice and
`vercel.json` with Git deployments disabled. No application source is present.

| Installation | Existing project | Qualification branch | Sensitive entries |
| --- | --- | --- | --- |
| MyEve A | `prj_L6faw25wnFGUZtrLKBIccg8gIDLR` | `codex/fq-a-6384519e0e01` | 26 |
| MyEve B, independently operated peer | same MyEve project | `codex/fq-b-6384519e0e01` | 26 |
| Relay | `prj_3IRvr9knK5VJcBTgTYMvhv6ixmJK` | `codex/fq-relay-6384519e0e01` | 26 |

All entries are `sensitive`, target **preview only**, exact branch only. Fresh
synthetic application passwords were generated in memory and sent to the managed
store over authenticated TLS; no plaintext secret file was created. All inherited
preview DB aliases are overridden with the matching synthetic DB/role, including
unpooled/Prisma aliases and individual PostgreSQL variables. The misleading
`POSTGRES_URL_NO_SSL` alias also retains TLS verification. Personal preview owner,
login/session, Blob, connector and memory integration settings are blanked in the
MyEve slots. Relay's inherited Neon Auth endpoints are blanked. No production
credentials were copied into a qualification slot. All prior environment metadata,
production targets and protection settings are unchanged; latest inventory has
zero qualification deployments.

Federation and session flags are false, Relay V2 actions are false, signup is false,
and the Relay backend is deliberately `kms-required-unconfigured`. The three
existing migrated databases are preserved. All application roles are **NOLOGIN**,
with **zero active sessions**, independently rechecked after storage. Staged
passwords are retained only for later authorized activation; they currently cannot
authenticate. Owner roles remain non-login. No synthetic owner/Agent/grant exists.
Blanking an AI key is **not** proof that Vercel's automatic OIDC gateway billing is
disabled. This is one reason no executable app was deployed.

Evidence: [secret references](evidence/kms-preparation/secret-status.json),
[branch refs](evidence/kms-preparation/branch-slots.json),
[unchanged hosting](evidence/kms-preparation/hosting-verification.json),
[database stop state](evidence/kms-preparation/database-brake.json). Failed early
attempts returned Vercel `BAD_REQUEST` for a missing Git branch, revoked their
attempted passwords, and created no secret entries. These were provider errors,
not a renewed automatic-approval rejection.

## 2. Exact authoritative contract and implementation gaps

At Relay `bbfcaa18710556fc689f60990599f4734e99a720`:

| Question | What the existing source actually requires or does |
| --- | --- |
| Custody | `docs/v2/evidence.md:9` requires hosted signing through KMS or HSM. `security/security-architecture.md:112` excludes environment root keys from application configuration. `evidence.md:17` requires account-scoped KMS wrapping and private object storage for the evidence artifact subsystem. |
| Non-exportability | The text does not prescribe a provider-specific exportability attribute or HSM certification. It does forbid application-config root keys and describes local signing as development-only. This proposal uses service-generated, non-exportable keys; it does not treat encrypted export to Vercel as compliant. |
| Remote signing | Binding the signer to a remote KMS operation satisfies the stated custody boundary. An ordinary runtime private key does not. The contract does not mandate a particular cloud/network protocol. |
| Algorithm | `evidence/crypto.ts` and `federation/transport.ts` use pure Ed25519 over the exact UTF-8 material, a 64-byte signature encoded base64url, SPKI public PEM, and existing EdDSA JWS header/claims. No prehash or alternate curve is interchangeable. |
| Key identity | Existing `keyId` appears in signed headers, audit records and encrypted envelopes. `security-architecture.md:113–116` additionally requires purpose separation, activation/retirement/revocation metadata, overlapping public verification history, one active signer, and compromise revocation epochs. |
| Audit | Key use must be audited without private material/plaintext. Existing Relay audit records are signed; offline `verifyAuditBundle` consumes public key history. Cloud-operation logs supplement rather than replace Relay provenance. |
| Availability | No numeric KMS latency or availability SLA is specified by these contract passages. Missing platform bindings return 503; local signer/wrapper reject production. The latest owner instruction explicitly adds missing configuration, invalid workload identity, unavailable/disabled/revoked key, failed signing and wrong algorithm as fail-closed cases, with no local production fallback. |
| Development | Explicit local/test adapters may remain. `managed-secret` at `bbfcaa1` is locally tested but not acceptable hosted custody; it is not configured for this target. |
| Resource isolation | ADR-016 requires V2-specific resources/credentials, excluding V1/rc1/soak namespaces. Existing unrelated AWS FDLC profiles are not permission to reuse their keys. |

**Newly explicit source gaps:** `V2PlatformBindings.signer` is currently shared by
leases, Passport operations, evidence and federation delivery. For example
`issueAgentPassport` signs the Passport and its audit event with the same supplied
signer. Merely creating five cloud keys does not satisfy purpose separation. The
current production key resolver exposes only its active key; lifecycle metadata
and retained verification history are not supplied. `unseal` rejects any wrapper
key ID other than the active one. Purpose-specific provider wiring and the
maintenance/rotation procedure must be qualified before hosted readiness. No
contract text was relaxed and no source protocol was changed in this mission.

## 3–11. Proposed KMS architecture, resources and cost

**Recommend Google Cloud KMS as the smallest candidate to validate, not an already
qualified provider.** Use `SOFTWARE` protection, `ASYMMETRIC_SIGN` /
`EC_SIGN_ED25519`, server-generated keys, and remote `asymmetricSign.data` over the
unchanged message. Google documents this as pure EdDSA and does not list Ed25519
under its HSM protection tier. The Relay contract permits KMS **or** HSM; it does
not require hardware protection. [Algorithm reference](https://docs.cloud.google.com/kms/docs/algorithms).

The topology remains hosted MyEve A ↔ hosted Relay ↔ independently operated hosted
MyEve B. Add Relay → short-lived workload federation → Cloud KMS, returning only
signatures/public keys. No signing/root private key enters Vercel. Google states
that principals cannot export raw key-version material.
[Key-version custody](https://docs.cloud.google.com/kms/docs/resource-hierarchy).

Proposed resources, **none created**:

- One owner-designated billing-enabled GCP project (reuse one if supplied and
  inspection confirms isolation), one `relay-v2-fq-6384519e0e01` key ring, initially
  `us-east4` only if final Vercel placement is compatible. Region is a proposal,
  not an observed deployment region. Key rings cannot be deleted; record this
  before approval.
- Four distinct software Ed25519 keys for lease, Passport, evidence and session/
  delivery signing, plus one `ENCRYPT_DECRYPT` / `GOOGLE_SYMMETRIC_ENCRYPTION`
  wrapping key. Separate purpose wiring remains required before use.
- One narrowly scoped workload identity pool/provider and service account; KMS
  permissions only on these keys, with signing/public-key/version-metadata reads
  and separately scoped encrypt/decrypt. No key administration, export, project
  Editor/Owner, or long-lived service-account JSON in the runtime. Separate
  operator identity performs rotation/revocation.
- Cloud KMS Data Access audit logging for sign/encrypt/decrypt, with an operator
  custodian and 30-day filtered evidence retention. Never enable raw HTTP body,
  Authorization-header, prompt or signing-input logging.

Vercel provides an OIDC-to-GCP integration path.
[Integration reference](https://vercel.com/docs/oidc/gcp). However, its documented
standard token identifies team/project/**environment**, not Git branch. A trust
policy for all `relay:preview` deployments would exceed the approved branch-only
scope. Use a qualification-only **custom environment** in the existing project,
if available on the account, and validate its stable ID/subject in IAM; otherwise
stop for an alternative isolated identity design. Do not invent a branch claim or
assume a branch-scoped ARN makes IAM branch-scoped. No custom environment, trust
policy or broad preview grant was created.
[OIDC claims](https://vercel.com/docs/oidc/reference).

The adapter seam is `AuditSigner` / `KeyWrapper` / `LeaseKeyResolver`, configured
at Node startup. Map a short immutable Relay key ID to an exact cloud key-version
resource and public-key fingerprint, not a mutable alias. Validate configured
purpose/algorithm/state and returned version/signature; verify the returned
signature locally with the existing verifier. Propagate failure as unavailable,
with no fallback. Preserve issuer, audience, JWS material, timestamps, request IDs,
replay claims and audit-hash material. Google accepts raw `data` and returns the
actual version name and integrity checks.
[Signing API](https://docs.cloud.google.com/kms/docs/reference/rest/v1/projects.locations.keyRings.cryptoKeys.cryptoKeyVersions/asymmetricSign).

For wrapping, the existing local RSA adapter binds `SHA256(ownerId)` as the OAEP
label. Cloud RSA decrypt APIs do not expose that same label. The **abstract**
`KeyWrapper` ciphertext is opaque to peers: a provider implementation can instead
KMS-encrypt each existing 32-byte data key with the same owner digest as required
AAD, retaining AES-256-GCM content encryption and envelope fields. This needs
cross-owner negative tests, key-version pinning and rotation tests; it is not an
assertion of RSA ciphertext compatibility. The isolated target has no existing
encrypted application rows to migrate. If exact old RSA ciphertext compatibility
is required, this candidate is insufficient and a compatible remote HSM is needed.

Rotation: provision a new version, export only the public key into the verified
history, stage recipient trust, quiesce new work, drain/expire in-flight ciphertext,
switch one active signer per purpose, restart, verify historical evidence and
old/new credential behavior, then disable old private operations. Keep public
verification records for the retention window. Revoke immediately on compromise
and increment the applicable existing epoch; do not silently repin recipients or
claim historical validity for signatures after a compromise cutoff. Do not change
wrapper versions while live ciphertext still requires the old wrapper. The
current code's history and purpose gaps remain prerequisites.

**Latency:** no hosted measurement exists. Planning estimate is 50–300 ms per warm
remote operation in nearby regions, with wide uncertainty; use p95 ≤500 ms per
operation and the runbook's API p95 ≤2 s as acceptance targets, not provider
promises. Cold identity exchange, multiple serialized signatures per request and
cross-cloud network latency must be measured. Use a bounded timeout, at most one
explicitly budgeted transient retry, and fail closed. No paid probe was made.

**Expected KMS cost:** five software versions × $0.06/month = **$0.30/month**;
10,000 cryptographic operations × $0.03/10,000 = **$0.03**, hence **$0.33** for that
illustrative month/session allocation, before logs/network/tax. Rotation adds
$0.06/month for each retained billable software version. Hourly version charge is
$0.000082192; five versions for one hour plus 10,000 operations is about $0.030411.
This is an estimate, not a provider-enforced dollar cap. Billing must be enabled;
no Autokey free allowance is assumed for these manually scoped signing keys.
[Google pricing](https://cloud.google.com/kms/pricing).

Before purchase, require operator confirmation of project/region, raw-message
size support across Relay's full permitted envelope range (not just short audit
hashes), IAM isolation, audit retention/cost, and purpose-specific wiring. The
public signing API/proto inspected did not establish an explicit maximum raw
message size; **that remains unverified**, not assumed unlimited.

Alternatives evaluated:

| Service | Finding |
| --- | --- |
| AWS KMS | Now supports `ECC_NIST_EDWARDS25519` / `ED25519_SHA_512`, RAW. Its 4,096-byte input maximum cannot cover Relay's permitted larger JWS messages. Ed25519ph/digest substitution changes the contract. Candidate only for a separately approved restricted-size scope, not the recommended unrestricted adapter. Local AWS SSO identity check expired before resource listing; existing keys are unverified. [Sign API](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html). |
| Vercel KMS | Existing account is convenient, but published supported algorithms omit Ed25519. Reject as a protocol-preserving provider. [KMS overview](https://vercel.com/docs/kms). |
| GCP Cloud KMS | Pure Ed25519 and opaque owner-bound wrapping are available as provider primitives; no local authenticated account/resource could be verified. Recommend validating this candidate before procurement. |
| Managed Vault Transit | Ed25519 remote signing with export disabled is technically relevant, but no existing cluster was identified; a dedicated service adds operational/cost scope. Not justified over a cloud KMS candidate at this stage. [Transit API](https://docs.hashicorp.com/vault/api-docs/secret/transit). |

## 12–15. Reuse, budgets, worker and emergency stop

Reuse both Vercel projects, TLS/protection, existing Neon endpoints, the three
migrated empty synthetic databases (27/27/22 migrations), and MyEve's existing
DB-backed artifact storage. Do not reuse the personal Blob token or create a new
bucket just for the federation golden path. The broader evidence object-storage
contract remains required if that subsystem is exercised.

**Hard-budget status: local control component implemented/tested; hosted aggregate
enforcement remains INCOMPLETE.** [Control code and limitations](../../../scripts/federation-readiness/controls/README.md)
cover 120 submissions, 2,000 HTTP attempts, concurrency 2/model 1, durable $5
liability ceiling (earlier cutoff at $4), 64 KiB artifacts and 60-minute session.
Existing narrower component/call/active-window limits are preserved. The component
has no authority over uninstrumented app ingress or gateway calls. Model liability
proof, hosted admission adapters, direct-origin bypass prevention, and durable
shared control placement remain blockers. No model call was made; spend is zero.

**Worker:** existing Railway Hobby workspace has $3.98 remaining credit and only
the unrelated `mission-control-bot` service. It is not a reusable qualification
worker and was untouched. Reuse the account, not that service. Proposed smallest
isolated runtime: three short-lived services, MyEve A poller, Relay maintenance
worker, MyEve B poller, one replica each, no new general queue. Propose ≤0.5 GB and
≤0.25 vCPU per service, automatic restart disabled outside supervised fault tests,
hard deadline and credential fence independent of the child process. Resource
limits are requirements, not confirmed available settings. Peer secrets/operator
access remain separate. A shared admission authority/durable state location is
still needed; local SQLite tests are not proof of serverless coordination.

At published rates, three services continuously using those proposed bounds cost
about **$0.041688 per hour**, plus $0.05/GB egress, build/control-state overhead and
any storage. A 0.5 GB volume, if required, adds about $0.000108/hour. Existing credit
is not a spending cap, nor permission to create new paid services. No service or
volume was provisioned. [Railway pricing](https://railway.com/pricing).

**Emergency stop:** local orchestration tests exercise all brakes despite partial
failure; real local subprocess test verifies forced termination. The exact
synthetic DB freeze command is implemented and its current no-login/no-session
state is verified hosted. It does not substitute for signed Agent/grant revocation,
provider cancellation, function/deployment stopping, or independent supervisor-loss
recovery. Those need actual immutable target IDs and hosted adapters. No Agent or
grant exists to revoke, and no qualification worker/execution is running. Do not
claim the full hosted stop drill passed.

Telemetry preparation records only counters, timings, reservation amounts, state
and nonsecret operation IDs. Capture KMS request IDs/version IDs, provider usage
receipts and signed Relay audit separately after authorization. Evidence retention
is 30 days; raw bodies/headers/keys/canaries are excluded. Existing platform log
retention is not automatically the runbook's evidence-retention policy.

## 16–17. Changes, commits and regression

Product source remains **MyEve `a63b2fe` / Relay `bbfcaa1`**. Frozen release pins are
unchanged. Readiness scaffolding and documentation are committed separately from
product code. The remote placeholder commits are MyEve
`d292edca5842530f1ae310e4ac3cf563f8e9d259` (both slots) and Relay
`73d9104fbe8a2c102258dc593ce61d0f23d9254f`.

New checks: **15 Python tests and 5 Node tests pass**; include cross-process
admission races, 120/2,000 boundaries, spend reservations, unknown-cost fencing,
restart persistence, actual artifact bytes, deadlines, partial-stop failure,
forced subprocess kill and exact synthetic DB scope. Current target preflight
correctly exits 1. Hosted read-only verification confirms all three app roles are
NOLOGIN/no sessions and unchanged production metadata. No hosted crypto smoke or
external test ran. Prior full product regression evidence remains historical;
product suites were not rerun because product source did not change.

## 18. Exact remaining owner/operator actions

1. Name the permitted GCP project/billing account and region, or supply an existing
   compliant KMS resource for read-only inspection. If AWS reuse is preferred,
   refresh the existing SSO session and designate an isolated non-FDLC key scope;
   the AWS message-size mismatch still needs resolution.
2. **Do not authorize purchase blindly:** first resolve the raw-signature size
   acceptance check and isolated OIDC environment. Then authorize the exact five
   cloud key resources, IAM setup and audit retention, with the $0.33 illustrative
   base/operation cost plus a stated log/network allowance. This mission created
   no paid KMS resource.
3. Confirm whether the existing Vercel plan supports a qualification-only custom
   environment for IAM isolation, or approve another identity boundary. Broad
   project-preview IAM trust is not allowed by the branch-only approval.
4. Authorize three bounded Railway services only after their resource/deadline
   settings and control-state location are concrete; expected base usage about
   $0.042/hour. No plan upgrade or reuse of the unrelated production service.
5. Supply/authorize a synthetic model credential with a verified hard liability
   bound. General account credit/soft spend alerts and MyEve's estimate do not
   suffice. Hosted adapters and stop-drill integration are engineering work still
   required, not something owner approval can mark complete.
6. Name operator, independent peer operator, assessor, stop contact and test window.
   After prerequisites and hosted operational smoke are evidenced, explicitly
   authorize each external gate separately. Freeze the resulting package for the
   assessor in a separate context; the implementation agent must never award PASS.

## 19–21. Gate status and verdict

- Independent security review / penetration testing: **NOT_RUN**.
- Production Agent-platform qualification: **NOT_RUN**.
- Hosted target: **INCOMPLETE**.
- Federation: **disabled by default**, no general or synthetic runtime enabled.
- Verdict: **NO-GO — EXTERNAL QUALIFICATION PENDING**.

Stop here before paid provisioning or either external gate. Preparation is not
qualification, and local control tests are not a hosted budget/stop attestation.
