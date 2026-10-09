# Canonical MyEve convergence

The owner selected Relay main `e2eb350f5655427d55cc204264020a9295173f96` as authoritative. This supersedes the protocol-selection blocker in [the prior checkpoint](final-consolidation.md). Historical evidence remains unchanged and is not relabeled as qualification of this protocol.

## Preserved source

Started from the published MyEve checkpoint `f3aa77397c158884f625f9d556ed298d77cc2d9f`. History-preserving merges `3025d71` and `8762e40` include canonical Decision Intelligence (`3d9f0e5`) and qualified Lazy Computer/migration bridge (`aa07dbb`). Product Acceptance fixes remain ancestors. No Relay source was changed.

During qualification, concurrent PR #4 advanced canonical main to `400cadb59b868c62fcdc5f31c6d8418b40334fec`. Its history, canonical producer fixture, added CI checks and deployment guard were preserved. The reconciliation retains the stricter explicit immutable-version binding and the already-qualified 33-migration runner; no historical migration was rewritten. The duplicate public fixture was consolidated into the canonical copy. Both workstreams' cross-repository suites pass on the cumulative receiver.

The receiver now verifies canonical V2 `Ed25519` / `relay-federation-v2` assertions using the `relay.federation` signing envelope, exact canonical header/payload digest, purpose, key ID and immutable version. Explicit legacy V1 remains supported; the superseded 179-byte format is rejected without fallback. The 262,144-character token bound remains intact. Trusted provider versions are configured separately from incoming assertions; local signer versions default to their unique key IDs.

The root Node test launcher now uses the existing `tsx` dependency: the merged Lazy Computer code requires TypeScript parameter-property and extensionless-import support, which Node strip-only mode does not provide. No dependency versions changed.

The required loopback Relay URL needs an explicit local override. `MYEVE_RELAY_ALLOW_LOCAL_HTTP=true` is accepted only under `NODE_ENV=development` for exact loopback hostnames. Production/non-loopback HTTP, credentials in URLs, paths, queries and disabled Federation remain rejected; 12 regression cases cover this boundary.

## Qualification

- Exact lockfile installation; 853 Vitest tests and 135 Node tests passed.
- Both workspace typechecks and production builds passed. Capability registry, skill routing and 545 executor classifications passed.
- All 33 migrations ordered. The real isolated PostgreSQL lineage suite passed fresh/current/historical reconciliation, state/ledger preservation, schema convergence, rollback, checksum/tamper rejection and authority preservation. No shared database was used.
- Unchanged public canonical Relay vector passes MyEve verification, including Unicode/canonicalization and immutable key-version binding.
- Actual canonical Relay producer and both verifiers pass synthetic material sizes 1,291; 23,193; 61,925; 132,893; 260,000; 262,057 bytes. Exact maximum token is 262,144 characters; oversize is rejected before signing. Tamper rejection passes. Signatures use ephemeral local keys; private keys are not persisted. KMS calls: **0**.
- Clean-environment builds use the qualified runtime-provider blocker and skip Sandbox prewarm. Runtime-provider attempts: **0**.

[Machine-readable checks](evidence/canonical-convergence/checks.json) and [cross-repository interoperability](evidence/canonical-convergence/interop.json) record this scope. Reproduce interoperability from the clean canonical Relay checkout with `node --import tsx <MyEve checkout>/apps/eve/scripts/qualification/canonical-relay-interop.ts`.

## Deployment boundary

MyEve's verified Vercel project root is `apps/eve`. Its `vercel.json` disables Git deployments for `codex/myeve-relay-final` and `main`, and preserves the concurrent canonical guard for `codex/federation-final-consolidation`. Other branches remain unchanged. This uses Vercel's documented [git.deploymentEnabled](https://vercel.com/docs/project-configuration/git-configuration) control. Existing hosted deployments are untouched. Production deployment is not part of this source integration. Keep the guard until an explicit release decision.

Federation remains disabled by default. Independent security review and Production-platform qualification remain **NOT_RUN**.

## Local E2E status

Source qualification is not a local E2E attestation. At resumption, the previously reported Relay runtime and PostgreSQL under `/private/tmp` no longer existed; ports 3000 and 55584 were closed. The owner was asked whether to restore that same canonical runtime because the current work order forbids starting another Relay server. No replacement has been started pending that response.

The model credential was not discovered, read, printed, copied or persisted. Conversational qualification must use the separately authorized inherited process environment. Deterministic application E2E remains pending a running canonical Relay.
