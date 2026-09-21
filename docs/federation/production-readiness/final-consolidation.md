# Final consolidation checkpoint

Status: **BLOCKED — owner protocol selection required**. Federation remains disabled by default. Independent security and production-platform qualification remain **NOT_RUN**.

## Ancestry and canonical reconciliation

The exact missing commit `7852287e1c5f8eb14119d9e8accdf174d27eeb69` was recovered from the preserved `myeve-federation-hosting` checkout. Its original object bytes hash to that exact SHA; its parent is `60d341f9909936f03e4d72e1a7f845721ef82c46`. The candidate clone lacked this object; the underlying transfer/deletion cause is not established. No commit was fabricated or rewritten. Connectivity fsck passed. The unchanged recovered candidate `6d8dd369eaf8f21ca7c8cab042c9ba429c0e54fa` was pushed to `codex/myeve-hosted-controls` with remote parity.

MyEve main is `e9984e4962151bffca1f6eb48c544b60bb643aa7`. The qualified runtime was merged onto it at `d5811b48b6c162129eee79a73493bc6ef64c7a05`, preserving newer routine, authority, owner-file and migration work. The executor inventory conflict was reconciled against actual merged sources. A genuine migration-client integration defect was fixed: owner-file reconciliation now runs transactionally on the same Neon session instead of referring to the removed HTTP client.

Readiness controls/docs were merged separately at `522822d686724032f2939ba01f61e498e2e74f84`. Both checkpoints were pushed to `codex/federation-final-consolidation` with exact local/remote parity. No canonical branch was changed by this task.

## Concurrent Relay canonical change

The initial canonical checkpoint was `7ea29b2886d2b8bad7b1a1ca1c3e8df1d39ee9ee`. A direct GitHub recheck found main at `e2eb350f5655427d55cc204264020a9295173f96`, merged through [PR #12](https://github.com/jaydubya818/relay/pull/12) at 2026-09-21 06:12:30 UTC with its `quality` check successful. The temporary regression checkout's origin is a local clone; fetching that remote alone was insufficient to detect this update. Subsequent canonical verification uses GitHub directly.

The two branches diverge after `d817c848a7f6797fe04787e28ac96081b69359ae`. Their v2 contracts are incompatible:

| Contract | Requested candidate c910c9d | Current canonical e2eb350 |
|---|---|---|
| Header algorithm | `Relay-Ed25519-SHA256-v2` | `Ed25519` |
| Header type | `relay-federation+digest` | `relay-federation-v2` |
| Commitment | 179-byte `relay.signature` object | `relay.federation` object with immutable key identity/version |
| MyEve candidate receiver | Supported | Not supported |

Canonical's integration report explicitly preserves the alternate candidate/evidence but excludes its protocol from that release. Choosing either format silently would contradict one of the owner's approved contracts. No third format, downgrade fallback or cryptographic change has been introduced. Owner selection is pending. Preserve canonical's `iad1` setting and explicit automatic-deployment guard during any subsequent reconciliation.

## Verified scope

MyEve: **663 Vitest + 134 Node tests**, typecheck, capability/skill checks, **520 executor classifications**, and both production builds passed. The normal migration runner passed fresh and populated-current-canonical checks for **30 migrations**, zero checksum changes/reapplications, matching schemas, transaction rollback, checksum-drift rejection, and execution-reliability/action-upgrade integration suites. Disposable migration infrastructure and credentials were removed.

Controls: **61 Node + 15 Python** passed. Disabled-default probes reject all unset/empty/false/nonliteral flags before owner mutations, artifact access, client use and worker execution.

Relay **c910c9d only**: **312 passed / 5 existing opt-in skips**, two performance tests, two functional browser tests, one production browser performance test; maximum route p95 **113.98 ms <200 ms**. Typecheck, lint, production build, migration consistency and immutable frontier passed. These results do **not** certify `e2eb350` or a future reconciled pair. Existing KMS live evidence remains specific to its recorded wire contract; no new KMS call was made.

The existing **13-scenario three-worker regression passed**, including all eight stop adapters and denial after stop. All disposable databases, roles, processes and fixture secrets were cleaned up. This run pairs Relay `c910c9d` with MyEve `522822d`; the expanded final approval/cancellation/replay golden path remains pending protocol selection. [Three-party evidence](evidence/final-consolidation/three-party.json).

Machine-readable results and log hashes: [checkpoint](evidence/final-consolidation/checkpoint.json), [migration qualification](evidence/final-consolidation/migrations.json), [disabled defaults](evidence/final-consolidation/disabled-defaults.json).

## Deployment and remaining work

Read-only Vercel metadata confirms the existing `sofie-personal-agent` and `relay` projects and the three branch-scoped synthetic qualification configurations. Existing preview READY status is not three-party qualification. Purpose-separated hosted keys/WIF, controller and supervised worker services, verified stop bindings, named operators and window remain prerequisites in the target manifest; this task has not provisioned or attested them. The prior probe key is not authorization to provision the remaining resources.

After owner protocol selection: reconcile only the selected contract, rerun exact-source cross-repository regression including explicit approval/cancellation/replay cases, freeze packages, complete PR review and required remote checks, then merge only under the authorized conditions. Deployment remains limited to existing approved isolated infrastructure, with hosted preflight required. Owner UI test URLs cannot be represented as ready before that target exists and passes smoke.

No new PR, merge, hosted deployment or external gate execution has occurred in this consolidation task at this checkpoint. Do not treat the separately merged Relay PR as completion of this cross-product mission.
