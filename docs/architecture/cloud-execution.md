> **Current: DETERMINISTIC CLOUD GOLDEN JOURNEY PASS.** [Hosted P0 evidence](../verification/cloud-composition/hosted-p0.md). Zero local dependencies, paid model calls and production effects. Cloud feature development FROZEN; production admission/publication DISABLED. Older checkpoint statuses below are historical.

# Cloud execution: current migration checkpoint

**Overall: NOT_READY.** The local Factory provider seam is implemented and qualified. Cloud Work, independent cloud verification and Mac-off Golden Journey remain NOT_RUN. This is not a laptop-independence launch claim.

## Source and durable checkpoint

| Repository | Canonical main inspected |
| --- | --- |
| MyEve | `2b22e387c053ba0631efc27c2e8f8a99fff1055e` |
| Relay | `a61f0ef697b02cf22da72ff2904c584d7faa026a` |
| MyFactory | `c0b4c1155a6a98f91375163443938042e6a0be10` |

MyFactory implementation checkpoint: [`4e5f7ebe7582125d8ba896751e32b405460346a0`](https://github.com/jaydubya818/MyFactory/commit/4e5f7ebe7582125d8ba896751e32b405460346a0), branch `codex/cloud-execution`. Pushed and exact remote SHA verified on 2026-10-02 UTC. Runtime source is recorded by hash in its qualification report. No canonical main, existing production service, owner database or historical Work was changed. Dedicated staging readiness and a bounded infrastructure-only controller are deployed.

- [Architecture decision, inventory and trust boundaries](https://github.com/jaydubya818/MyFactory/blob/4e5f7ebe7582125d8ba896751e32b405460346a0/docs/architecture/cloud-execution.md)
- [Qualification report and retained logs](https://github.com/jaydubya818/MyFactory/blob/4e5f7ebe7582125d8ba896751e32b405460346a0/docs/cloud-execution/phase-1/README.md)
- [Runbook](https://github.com/jaydubya818/MyFactory/blob/4e5f7ebe7582125d8ba896751e32b405460346a0/docs/runbooks/cloud-execution.md)
- [Staging resource proposal](https://github.com/jaydubya818/MyFactory/blob/4e5f7ebe7582125d8ba896751e32b405460346a0/docs/cloud-execution/staging-proposal.json)
- [Supplied mission attachments and completeness notes](https://github.com/jaydubya818/MyFactory/blob/4e5f7ebe7582125d8ba896751e32b405460346a0/docs/cloud-execution/mission-sources.json)

## What is established

MyFactory dispatch now uses an `ExecutionProvider` seam. Its local adapter wraps the existing JobManager, isolates process/Docker readback, rejects cross-attempt input, holds ambiguous resources, and preserves dispatch claims, spend authority and terminal fencing. Health fails closed; local teardown honestly retains the workspace required by current publication. It does not expose or enable a cloud route.

| Evidence tier | Outcome |
| --- | --- |
| DETERMINISTIC baseline | 170 pass, 0 fail, 5 gated skips |
| DETERMINISTIC latest | 197 pass, 0 fail, 5 gated skips |
| CONNECTED LOCAL | The 5 gated CLI/Docker cases separately pass with synthetic Responses; no paid model |
| Static/build | Producer types, governance, workspace types and build PASS |
| CONNECTED CLOUD foundation | Dedicated DB migration and hosted DB/Blob/Sandbox readiness PASS; Work admission disabled |
| Cloud Work / Mac-off / LIVE model | NOT_RUN |

No cloud safety counters were measured. Do not report zero local dependencies, secret disclosures or duplicate cloud executions from this local evidence. DeepAgent remains NOT_QUALIFIED. During this work, canonical MyEve main advanced from `1bd482e1b6de1e4ca52f130b3c23724589c4859b` to `2b22e387c053ba0631efc27c2e8f8a99fff1055e`. The latter records Attempt 8's successful real local Golden Journey and adds the qualified owner-decision/exact-candidate publisher. It is merged into this cloud branch unchanged; real publication and owner acceptance remain gated. The Factory checkpoint records both initial inventory and refreshed canonical source.

## What MyEve still needs

The current `apps/eve/lib/engineering/factory-live-adapter.ts` explicitly admits a loopback producer and an absolute local repository path. `factory-runtime.ts` reads source with local Git and instantiates `DockerProtectedVerifier`. Candidate custody also retains local dependencies. Removing an origin restriction alone would break the trust boundary without providing cloud execution.

The next coordinated milestone needs a versioned authenticated HTTPS contract, Factory-owned durable PostgreSQL queue/ledger and remote resource identities, private immutable artifact custody, a separate cloud verifier, cloud-native source reads, canonical Result/Proof readback and production-path deterministic model fixtures. Reuse canonical `owner-publication.ts`, `candidate-publication.ts`, `candidate-publication-github.ts` and migration 0079. Its current host consumer already reconstructs candidate Git objects independently of a mutable Factory workspace; cloud hosting and scoped publisher identity remain to be qualified. Preserve those exact-candidate and owner-decision controls; do not fork them. P0 must start naturally in Sofie and run while browser, local companion, local Factory and local verifier are off.

## Dedicated staging approved and provisioned

Owner approved the dedicated MyFactory boundary. Created `myfactory-cloud-staging` (`prj_IRXTY6HOzS2q9wRPdabsJnmddzl4`), separate free-plan Neon database, private Blob custody store and private worker registry in iad1. Only staging preview receives credentials. No Factory state or credentials live in Sofie preview resources; no owner records were copied. Producer/verifier identities and canonical cloud Work admission are still pending qualification.

[Phase 2 evidence](https://github.com/jaydubya818/MyFactory/blob/4e5f7ebe7582125d8ba896751e32b405460346a0/docs/cloud-execution/phase-2/README.md) records resource IDs, test counts and the verified preview deployment. Hosted liveness succeeds; authenticated readiness reports dependencies available but `ready=false`, `admission=DISABLED`. Vercel's automatic first-deployment production labeling affected only the new staging project; that deployment was removed and a real preview verified.

Image qualification, exact public source checkout, hosted deterministic infrastructure execution, private artifact collection and confirmed teardown now pass. Next: canonical cloud Work/storage and the existing harness with deterministic responses. No paid model or DeepAgent follows merely from booting a sandbox. Keep the existing harness and all Attempt-8 publication boundaries.

Promotion later moves code, migrations, FactoryVersion, image and qualified policies/configuration only. Staging database rows, Work and candidates never become production state.

This branch disables its Git-triggered MyEve deployment using the repository's existing `git.deploymentEnabled` convention.

## Image blocker resolved; hosted infrastructure qualified

The provider-native Node 24 image resolves through `Sandbox.create()` and is pinned at `vercel/sandbox/node@sha256:6ad1291a9fe7d243ee9f23626e6b08614a596431801c55e14cc5ee9d525f28d1`. Direct OCI manifest 404 did not establish managed runtime unavailability. Custom VCR upload TLS failures remain unexplained but are nonblocking. No TLS weakening or replacement hosting architecture was needed.

CONNECTED PASS: the hosted Factory control plane allocated the pinned sandbox, explicitly checked out the exact public commit/tree as an unprivileged user, disabled egress, ran six deterministic checks, collected a hash-validated artifact into dedicated private Blob storage and confirmed sandbox deletion. Independent post-teardown readback matched the artifact hash and anonymous access was denied. Repeated submission returned the original receipt. All failed requests/attempts and their repairs are preserved in the [Phase 2 evidence](https://github.com/jaydubya818/MyFactory/blob/4e5f7ebe7582125d8ba896751e32b405460346a0/docs/cloud-execution/phase-2/README.md).

This is a fixed infrastructure qualification endpoint with a separate operator token, one active sandbox, a 120-second worker deadline and an eight-attempt ceiling. It is not the MyEve Work contract. Sofie has no Factory database, artifact or worker credentials. Cloud admission remains DISABLED; paid model operations and publications remain 0. Canonical cloud Work, candidate custody, independent verifier, Result/Proof, browser-off and Mac-off P0 remain NOT_RUN. No real-model authorization is requested.


MyFactory staging checkpoint [`1d31332`](https://github.com/jaydubya818/MyFactory/commit/1d3133273343d11833851c28c7f9c90cc302ec15) adds the canonical PostgreSQL V2 spend ledger and hosted private queue delivery. Connected queue completion occurred after the requesting process exited; duplicate submission reused the receipt. This is infrastructure qualification only. MyEve cloud Work routing, cloud harness, independent verifier and Mac-off/P0 remain unqualified; cloud admission and paid model calls remain disabled. The Attempt-8 publisher is unchanged.


The explicit cloud client transport now pins MyFactory staging HTTPS and serializes immutable repository source without laptop paths. Local transport remains loopback-only. The isolated Sofie qualification project/database are provisioned with canonical migrations and no copied owner data. [Evidence](../cloud-execution/phase-3/README.md). Full MyEve regression: 2,001 passed, 94 skipped; typecheck and executor governance passed. Cloud runtime admission remains blocked pending source/verifier integration; Mac-off/P0 is NOT_RUN.


Cloud execution snapshot V2 now pins the source tree, worker/verifier image digests, provider, policies, resource bounds, versioned skills and evidence class. MyEve verifies the same synthetic signed packet as Factory and rejects tampering and V1 downgrade. Cloud preparation requires V2 DETERMINISTIC evidence; local V1 behavior is retained. Validation: 2,003 tests passed, 94 skipped; typecheck, capability, skill routing and executor governance passed. Hosted cloud Work, verifier, Mac-off and P0 remain NOT_RUN. No paid models or publication were invoked.


The V2 cloud custody path now accepts a bounded Factory file projection without running local Git, recomputes the exact source tree, and applies the existing authenticated candidate/commit identity guard. The local V1 custody path and Attempt-8 publisher remain unchanged. Full validation: 2,005 passed, 94 skipped; typecheck/governance passed. Hosted cloud Work, independent verifier, Mac-off and P0 remain NOT_RUN.

Dedicated staging access approval is configured server-side only. A fixed operator probe and browser-bundle credential scan now guard the qualification path; hosted boundary tests are pending. All other isolated staging ingress remains closed until deterministic models are qualified. See [access boundary](../cloud-execution/phase-3/access-boundary.md).

The hosted bundle credential scan passed (77 files). The access matrix remains NOT_RUN: operator ingress to the separately protected Sofie staging project requires its own grant or authenticated Vercel session. No Sofie bypass has been created. The Factory bypass remains backend-only; canonical cloud Work and Mac-off/P0 remain NOT_RUN.
