# Independent review: QA100 reconciliation, Builder targets and peer pins

**Verdict: PASS_SCOPED_SOURCE_ADOPTION.** No unresolved security or quality blocker was found in this selective source change. This approves a source checkpoint only. It does not authorize deployment, credential changes, workflow dispatch, paid execution, or claim that the newly selected peer pair has been qualified.

Reviewed the staged candidate on `codex/beta-qa100-reconcile-20261023` against frozen baseline `2ee40f7a0650c77eedfa7d4936a035783a7565f4`. Scope is the selective missing UI/copy behavior from existing PR100 `2ccf0c7df095daccc160dc27ca7af69f4c892a9a`, the existing narrow Builder PR96 correction `9c7e7445a313f4cf806eca594772d820668cca2d`, and coordinator-selected immutable CI peer revisions. The reviewer changed only this report and independent output evidence.

## Reviewed behavior and boundaries

- Account Results, Memory and Activity links all use the existing destination gate. Tests derive the actual tester gate from server feature policy: Results and Activity are visible; Memory remains denied. Activity was already an allowed `TODAY_WORK` read destination and API; adding its navigation entry changes discoverability, not its feature grant. A narrower gate still hides these destinations.
- The existing Team destination and page now agree on “Team.” Activity preview and integrated page descriptions share one constant.
- Deep Agent unavailability is informational copy. The new helper exports one string, not an authority or qualification predicate. The UI renders it only under the existing server-derived external-alpha gate; outside that gate, it makes no provider-availability assertion. The chat-only instruction adds the same statement while preserving turn/spend ceilings, disabled Work/Factory, unavailable-tool restrictions, owner bindings, context bounds and untrusted-data rules.
- Runtime authentication, owner sessions, BFCache handling, thread/draft isolation, confirmed-deletion behavior, stale-action gating, partial-stream recovery, accounting SQL and capability grants are unchanged. The broader old PR100 authentication/sign-out edits and unused generic qualification predicate were correctly excluded.
- Governance inventories the new helper as `INTERNAL` informational copy and updates the context fingerprint. The helper is staged and present with its exact hash in the sealed Builder source inventory. The branch remains explicitly nondeploying.

Two browser-fixture corrections were reviewed. Waiting for an attached empty Work region plus its canonical read and completed loading avoids a zero-size empty-state timing race; the explicit outage and retry assertions remain. The non-alpha tap-target fixture now uses request-time `/today` instead of `/privacy`, which was prerendered with the build's tester gate. It checks all five account links and absence of the beta-only label. These are test corrections, not changes to runtime authorization.

## Builder environment scoping

The Builder runtime file exactly matches the selected PR96 implementation. Store connections and encrypted environment entries now target only Production through `OWNER_SECRET_TARGETS`. The non-secret plaintext managed-project marker remains available in Production, Preview and Development. Existing deployment creation still requests and validates Production.

All five tests use mocked fetch; no actual Vercel request or credential mutation occurred. This source fix prevents future provisioning through these paths from targeting Preview/Development. **It does not prove that previously issued Preview/Development credentials have been removed or rotated.** Existing deployment/environment cleanup is a separate authorized operation. Vercel's [environment documentation](https://vercel.com/docs/environment-variables) describes target-specific configuration taking effect on subsequent deployments.

## CI peer selection

The reviewed selection is:

- Factory `c5416e65f786f8f9abf14692a984b5a176271b67`
- Relay `ccd32878759bd03a8d6775141769498487496958`

Independent byte comparison against HEAD proves the seven CI/tooling files contain only **nine Factory SHA replacements and seven Relay SHA replacements**: seven Factory checkout refs plus two assertions/constants, and four Relay checkout refs plus three matching SHA environment literals. All other bytes are unchanged, including permissions, triggers, action versions, checkout options, steps, install commands and qualification gates. Historical peer references remain unchanged. Evidence: `independent-peer-pin-diff.json`.

The provided peer review handoffs establish why the coordinator selected these revisions; they are not this reviewer's independent review of both peer implementations. No workflow was dispatched, no financial/private-custody fixture was run, and no exact-current-pair integration or hosted qualification is claimed.

## Independent checks executed

Evidence directory: `/Users/jaywest/Myeve/output/beta-qa100-reconcile-20261023/`.

From `apps/eve`, **109/109 tests in seven suites PASS**, final run 413 ms:

```sh
env -i PATH="$PATH" NODE_ENV=test ../../node_modules/.bin/vitest run \
  components/owner/qa-medium.test.ts lib/deep-agent-availability.test.ts \
  lib/chat-only-activation.test.ts components/owner/navigation-reconciliation.test.tsx \
  lib/external-alpha/features.test.ts agent/instructions/persistent-agent.test.ts \
  lib/external-alpha/context.test.ts
```

Evidence: `independent-affected-tests-final.log`.

From the repository root:

```sh
env -i PATH="$PATH" NODE_ENV=test node --import tsx --test apps/builder/lib/vercel-api.test.ts
env -i PATH="$PATH" NODE_ENV=test node --test scripts/myapps-composition/current-pins.test.mjs
```

Results: **5/5 Builder tests PASS** (138.9 ms) and **3/3 peer-pin tests PASS** (193.5 ms). Evidence: `independent-builder96-tests.log` and `independent-peer-pins-tests.log`. These are separate campaigns; no combined unique-test count is implied.

## Parent-owned final qualification inspected

The following final campaigns were inspected, not independently rerun by this reviewer:

- `typecheck-post-builder96.log`: all four tasks uncached and successful; 905 governed sources, UNKNOWN=0, 157 capability definitions and 130 authored tools.
- `build-post-builder96-receipt.json`: exact 1,594-input Builder trace inventory; new helper hash included; ordinary metadata and generated-context sets empty. Mandatory verifier remains byte-identical at `485001fb394d8217c9590d817b93464f4db676f6dc3e48549f3ebdd575b3a3f7`.
- Final Eve build `jDZupp5kswc8POmxwXLt1`; Builder build `VFXjDqXp4AVu7ibNodEnJ`.
- `browser-post-builder96/receipt.json` matches that exact Eve build and passes desktop/mobile, accounting-display/error/retry, owner-switch isolation, failed-delete unsynced-history/draft preservation, composer layout and accessibility checks. It uses the real built application with synthetic resource responses; live model behavior was not exercised.
- `qa-browser-post-builder96.log`: **5/5 PASS**, including valid and signed-out BFCache restore, landscape drawer focus behavior, touch composer size and five account-link tap targets.
- Parent's `affected-tests-final.log` records **111/111 in seven suites**. Its selection differs from the independent 109-test command above; these counts are not interchangeable or additive.

Earlier timing/fixture failures were retained in the evidence directory. Parent reported both owned local servers stopped.

## Read-only preflight preparation

The separate evidence-only `relay-binding-readonly-preflight.mjs` was statically inspected, not executed by this reviewer. Its exact hash is `32c78514ad18b6d0bd0396bc5499a67116fe375f41bf1a31eee7136b945091e7`.

The script uses bounded, parameterized, owner-scoped SELECTs, session-default and explicit transaction read-only settings, rollback and timeouts. It retrieves identifiers, states and presence booleans, not secret/ciphertext/public-key values; errors are reduced to generic codes. No DML, DDL, decryption or Relay provider call was found. The stated scope is accurate: existing cached configuration and local canonical-binding observations cannot establish current Vercel configuration, remote credential validity, enrollment, grants or executable availability. All those remote claims remain unverified.

## Residual release holds

No production credentials, cached environment contents, production databases, provider accounts or tester sessions were accessed by this reviewer. No source runtime, manifest, lockfile, deployment, role, grant or environment setting was changed.

This stage does not close the inherited dependency audit's remaining Zod v3/TOML high findings, the prior unavailable hosted Eve bundle/PG-bundle qualification, or Factory financial/private-custody/installed-qualification holds. Selecting new peer SHAs does not substitute for exact-pair qualification. Live-model adherence to prompt copy remains unverified. These limits preclude a whole-release or production-readiness verdict.

## Reviewed fingerprints

| File | SHA256 |
| --- | --- |
| `apps/builder/lib/vercel-api.ts` | `f69e1fa5b1b5d38872f690e2f712ca9e963deea54ff74e3417f2ed941a56fb29` |
| `apps/builder/lib/vercel-api.test.ts` | `0f7af8bb2b520f16cefadfa021d59376ddd1897619da68ffcbb4e28223de0c7a` |
| `apps/eve/components/owner/navigation.tsx` | `bb8a5b69b184a01519fce873a1305582e6fb3781d742b2a3882f4a65c665af85` |
| `apps/eve/components/owner/destinations.ts` | `2b7fc45b128d3371a4d72846e640276704a614d07a03aad8f732a0a8c89ca43d` |
| `apps/eve/lib/deep-agent-availability.ts` | `ccbf20f18afc31f1de142e34bb89f92ec001570913a710694b5cb32bd6da561e` |
| `apps/eve/lib/external-alpha/context.ts` | `5d96a998c9501560c8b482a170ef67cbfce6c54f15f960dd038a5e3970d67121` |
| `scripts/myapps-composition/current-pins.mjs` | `779f6bfdb395b0f7f64b60e4fdecdad233633d6c0744f27ac5ecb26c011bc286` |
| `scripts/unified-beta/qualification-envelope.mjs` | `6f004f86dd92f06b57e002c699cfb4a368c8108d0498b495658cb19e5ac8895e` |

