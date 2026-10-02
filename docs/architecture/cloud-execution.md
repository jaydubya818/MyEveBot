# Cloud execution: current migration checkpoint

**Overall: NOT_READY.** The local Factory provider seam is implemented and qualified. Cloud Work, independent cloud verification and Mac-off Golden Journey remain NOT_RUN. This is not a laptop-independence launch claim.

## Source and durable checkpoint

| Repository | Canonical main inspected |
| --- | --- |
| MyEve | `2b22e387c053ba0631efc27c2e8f8a99fff1055e` |
| Relay | `a61f0ef697b02cf22da72ff2904c584d7faa026a` |
| MyFactory | `c0b4c1155a6a98f91375163443938042e6a0be10` |

MyFactory implementation checkpoint: [`7a69c472f05d540f490a41e33014b978f1165e82`](https://github.com/jaydubya818/MyFactory/commit/7a69c472f05d540f490a41e33014b978f1165e82), branch `codex/cloud-execution`. Pushed and exact remote SHA verified on 2026-10-02 UTC. Runtime source is recorded by hash in its qualification report. No canonical main, existing production service, owner database or historical Work was changed. A separate staging readiness service is now deployed.

- [Architecture decision, inventory and trust boundaries](https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/architecture/cloud-execution.md)
- [Qualification report and retained logs](https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/cloud-execution/phase-1/README.md)
- [Runbook](https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/runbooks/cloud-execution.md)
- [Staging resource proposal](https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/cloud-execution/staging-proposal.json)
- [Supplied mission attachments and completeness notes](https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/cloud-execution/mission-sources.json)

## What is established

MyFactory dispatch now uses an `ExecutionProvider` seam. Its local adapter wraps the existing JobManager, isolates process/Docker readback, rejects cross-attempt input, holds ambiguous resources, and preserves dispatch claims, spend authority and terminal fencing. Health fails closed; local teardown honestly retains the workspace required by current publication. It does not expose or enable a cloud route.

| Evidence tier | Outcome |
| --- | --- |
| DETERMINISTIC baseline | 170 pass, 0 fail, 5 gated skips |
| DETERMINISTIC latest | 187 pass, 0 fail, 5 gated skips |
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

[Phase 2 evidence](https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/cloud-execution/phase-2/README.md) records resource IDs, test counts and the verified preview deployment. Hosted liveness succeeds; authenticated readiness reports dependencies available but `ready=false`, `admission=DISABLED`. Vercel's automatic first-deployment production labeling affected only the new staging project; that deployment was removed and a real preview verified.

Next: immutable worker image, exact public source checkout, deterministic infrastructure execution, private artifact collection and confirmed teardown. No paid model or DeepAgent follows merely from booting a sandbox. Keep the existing harness and all Attempt-8 publication boundaries.

Promotion later moves code, migrations, FactoryVersion, image and qualified policies/configuration only. Staging database rows, Work and candidates never become production state.

This branch disables its Git-triggered MyEve deployment using the repository's existing `git.deploymentEnabled` convention.

## External unblock before allocation

The pinned Node 24/Git worker image builds locally. Both documented managed VCR images return 404, and legacy Docker, compressed Buildx and independent host-side crane uploads fail at the TLS upload boundary. Provider inventories show no published image and no sandbox. [Failure evidence and required provider/network configuration](https://github.com/jaydubya818/MyFactory/blob/7a69c472f05d540f490a41e33014b978f1165e82/docs/cloud-execution/phase-2/image-blocker.md). No production credential, TLS weakening or alternate provider workaround was introduced.

Resume after a compatible immutable image is accessible to this staging project. Allocation/teardown, cloud harness, custody/verifier, Result/Proof and Mac-off P0 remain NOT_RUN. No real-model authorization is requested at this checkpoint.
