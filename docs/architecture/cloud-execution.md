# Cloud execution: current migration checkpoint

**Overall: NOT_READY.** The local Factory provider seam is implemented and qualified. Cloud Work, independent cloud verification and Mac-off Golden Journey remain NOT_RUN. This is not a laptop-independence launch claim.

## Source and durable checkpoint

| Repository | Canonical main inspected |
| --- | --- |
| MyEve | `2b22e387c053ba0631efc27c2e8f8a99fff1055e` |
| Relay | `a61f0ef697b02cf22da72ff2904c584d7faa026a` |
| MyFactory | `c0b4c1155a6a98f91375163443938042e6a0be10` |

MyFactory implementation checkpoint: [`71a9776f33b87398c52c7a8fa04827a64d5c7112`](https://github.com/jaydubya818/MyFactory/commit/71a9776f33b87398c52c7a8fa04827a64d5c7112), branch `codex/cloud-execution`. Pushed and exact remote SHA verified on 2026-10-02 UTC. Runtime source is recorded by hash in its qualification report. No canonical main, runtime deployment, owner database or historical Work was changed.

- [Architecture decision, inventory and trust boundaries](https://github.com/jaydubya818/MyFactory/blob/71a9776f33b87398c52c7a8fa04827a64d5c7112/docs/architecture/cloud-execution.md)
- [Qualification report and retained logs](https://github.com/jaydubya818/MyFactory/blob/71a9776f33b87398c52c7a8fa04827a64d5c7112/docs/cloud-execution/phase-1/README.md)
- [Runbook](https://github.com/jaydubya818/MyFactory/blob/71a9776f33b87398c52c7a8fa04827a64d5c7112/docs/runbooks/cloud-execution.md)
- [Staging resource proposal](https://github.com/jaydubya818/MyFactory/blob/71a9776f33b87398c52c7a8fa04827a64d5c7112/docs/cloud-execution/staging-proposal.json)
- [Supplied mission attachments and completeness notes](https://github.com/jaydubya818/MyFactory/blob/71a9776f33b87398c52c7a8fa04827a64d5c7112/docs/cloud-execution/mission-sources.json)

## What is established

MyFactory dispatch now uses an `ExecutionProvider` seam. Its local adapter wraps the existing JobManager, isolates process/Docker readback, rejects cross-attempt input, holds ambiguous resources, and preserves dispatch claims, spend authority and terminal fencing. Health fails closed; local teardown honestly retains the workspace required by current publication. It does not expose or enable a cloud route.

| Evidence tier | Outcome |
| --- | --- |
| DETERMINISTIC baseline | 170 pass, 0 fail, 5 gated skips |
| DETERMINISTIC final | 179 pass, 0 fail, 5 gated skips |
| CONNECTED LOCAL | The 5 gated CLI/Docker cases separately pass with synthetic Responses; no paid model |
| Static/build | Producer types, governance, workspace types and build PASS |
| CONNECTED CLOUD / LIVE | NOT_RUN |

No cloud safety counters were measured. Do not report zero local dependencies, secret disclosures or duplicate cloud executions from this local evidence. DeepAgent remains NOT_QUALIFIED. During this work, canonical MyEve main advanced from `1bd482e1b6de1e4ca52f130b3c23724589c4859b` to `2b22e387c053ba0631efc27c2e8f8a99fff1055e`. The latter records Attempt 8's successful real local Golden Journey and adds the qualified owner-decision/exact-candidate publisher. It is merged into this cloud branch unchanged; real publication and owner acceptance remain gated. The Factory checkpoint records both initial inventory and refreshed canonical source.

## What MyEve still needs

The current `apps/eve/lib/engineering/factory-live-adapter.ts` explicitly admits a loopback producer and an absolute local repository path. `factory-runtime.ts` reads source with local Git and instantiates `DockerProtectedVerifier`. Candidate custody also retains local dependencies. Removing an origin restriction alone would break the trust boundary without providing cloud execution.

The next coordinated milestone needs a versioned authenticated HTTPS contract, Factory-owned durable PostgreSQL queue/ledger and remote resource identities, private immutable artifact custody, a separate cloud verifier, cloud-native source reads, canonical Result/Proof readback and production-path deterministic model fixtures. Reuse canonical `owner-publication.ts`, `candidate-publication.ts`, `candidate-publication-github.ts` and migration 0079. Its current host consumer already reconstructs candidate Git objects independently of a mutable Factory workspace; cloud hosting and scoped publisher identity remain to be qualified. Preserve those exact-candidate and owner-decision controls; do not fork them. P0 must start naturally in Sofie and run while browser, local companion, local Factory and local verifier are off.

## Staging scope decision

Recommended: **a dedicated `myfactory-cloud-staging` Vercel service, with separate staging PostgreSQL and private Blob scope**, using Vercel Sandbox already present in the platform. Alternative: explicitly isolated preview resources inside `sofie-personal-agent`. The latter reduces setup but shares more identity, data and deployment risk with the owner application.

The read-only project inventory found Sofie/Relay and independent projects, but no dedicated MyFactory staging project. Existing development OIDC for Sofie is not evidence of a Factory staging database/storage grant. Choose this resource/identity boundary before provisioning or migrating execution authority. No paid-plan upgrade or material recurring commitment is assumed.

First proposed infrastructure probe: one ephemeral 1-vCPU/2-GB sandbox, 120 seconds, image pinned by real digest, no public ports, no model calls, no source-control writes, bounded artifacts and confirmed teardown. Estimated compute at documented `iad1` rates is about $0.00568 plus creation/transfer/storage and other service charges; recheck account pricing before provisioning. This proposal does not authorize the later live model canary, which requires its own exact envelope.

This branch disables its Git-triggered MyEve deployment using the repository's existing `git.deploymentEnabled` convention, so publishing this documentation checkpoint is not a staging or production rollout.
