# Independent review — productive HTTP fixture port

Date: 2026-10-23 (America/Los_Angeles)

**Verdict: no blocker found in this narrow test-only port. The delayed-refusal financial hold remains OPEN.** This review does not qualify productive Work for release, deployment or paid execution.

## Scope and provenance

Reviewed `codex/productive-http-fixture-20261023` in `/tmp/myeve-auth-password-management`, against frozen MyEve base `ea7093a5f427238fe0bee335bee7746b558cefb3`.

The diff changes only the productive-journey fixture and adds the branch's `git.deploymentEnabled: false` entry. The resulting fixture blob, `927fd386d4ed02f1f27e5755c95ebddf63e62034`, exactly matches the original `c8eec458` file. No runtime source, migration, tool, permission, quota, credential or production setting changes.

Selected peer: Factory `1da82a739b2dd411ac63cdf261963effd5451d94`, extracted at `/tmp/myeve-factory-peer-20261023`. Its source identity matches the selection record:

- Source digest: `92c6f5ebae7d0a1a9ca32ab12ef6d7e4c74d806a6f9ed7b000c753fe589a1e7a`.
- Package lock SHA-256: `eb16ce6d285827ca998bdb7b739711a44aa5d4649ee8d64840de279f1f6870f6`.
- Both capability workspace imports resolve inside that peer checkout. This review did not independently attest every extracted peer file or re-audit its copied third-party dependencies.

## Review findings

The three HTTP fixture fields now derive from the same synthetic capability policy supplied to the injected runtime: the exact per-client binding, its canonical digest, and `current_user` read inside the actual store transaction. The peer fixture assumes its restricted role immediately after BEGIN. This avoids inventing a binding or using the provisioning/admin connection's role.

The real `externalAlphaSlotCapability` loader remains active. The port does not replace it with a permissive stub, weaken its owner/installation pin checks, or change runtime authorization. The foreign-owner negative recomputes the digest after changing the owner, so the denial tests ownership independently of a stale digest.

Both negative cases assert the immediate refusal, current local cancellation state, no Factory intake/authority rows, no queued delivery, and zero allocation/model transport calls. Those are useful point-in-time assertions. They do **not** prove permanent nonadmission after configuration changes or delayed requests. In particular, a current `CANCELLED` assertion cannot close the separate delayed-refusal financial hold.

The fixture still injects a real PostgreSQL-backed runtime with fake transport, queue and caller verification. It does not qualify deployed runtime construction, real OIDC, live providers, production grants or the full protected-custody journey.

## Evidence

Independently verified the diff scope, original/resulting Git blob match, selected peer source-identity/lock values, relevant fixture/runtime/HTTP-loader wiring and workspace link resolution. `git diff --check` passed.

Independently ran from `apps/eve`:

```sh
/tmp/myeve-auth-password-management/node_modules/.bin/vitest run \
  lib/external-alpha/productive-sandbox-test-fixture.test.ts
```

**2/2 mailbox tests passed, 140 ms.** No PostgreSQL, financial vulnerability or delayed/replay reproduction was run by this reviewer.

Inspected the implementation agent's `output/productive-http-fixture-20261023/productive-journey.log`: **9 passed, 3 skipped, two suites, 13.13 seconds, exit 0**. These comprise seven journey cases and two mailbox cases. The three private verifier-custody cases remain skipped; independent protected PASS/FAIL and changed-Work proof qualification must not be inferred from this result. The logged command was:

```sh
npm exec --workspace=apps/eve -- vitest run --fileParallelism=false \
  --testTimeout=60000 lib/external-alpha/productive-journey-postgres.test.ts \
  lib/external-alpha/productive-sandbox-test-fixture.test.ts
```

That journey requires the explicit productive-fixture opt-in, selected Factory source root and disposable local PostgreSQL fixture. It is not enabled by ordinary production environment variables.

Also inspected the implementation agent's full typecheck log: exit 0; **903 classified sources, UNKNOWN=0**, routine activation remains disabled. These implementation-agent runs are distinct from the independent mailbox run and are not additional unique-test totals.

## Constraints

No production, provider, private verifier custody, credentials or live tester data were accessed by this reviewer. Only source/report reads, local mailbox tests and these review documents were used; no application source was edited.

The financial hold stays OPEN, private-custody skips stay visible, and no broad integration PASS, permanent nonadmission, production readiness, hosted CI or deployment claim is made. Further financial work requires its own authorized scope and evidence; this fixture correction supplies none of that authority.

Fixture SHA-256: `69b91a240c01c99225af859dab2151183be29fdeeb45e3f32a758afa49d774ed`.
