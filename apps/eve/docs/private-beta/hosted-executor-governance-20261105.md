# Executor governance on the hosted private-beta branch (2026-11-05)

Check: `node --import tsx scripts/check-executor-governance.ts` (apps/eve).

## The 18 failures reported on 255ddb1c
On `codex/private-beta-owner-work-20261103` at 255ddb1c, 18 executors failed. All 18 were already present on that base. None of them came from hosted work:
- 16 were "executor changed": fingerprints were not refreshed after the owner-local private-beta commits. The files were custody-assembly, custody-launcher, custody-profile, delivery-observer, factory-live-port, factory-stage-store-sources, gate, root, runtime-ports, static-build-export, static-publish-port, wiring, owner-work, prepare-execution, contract and factory-spend.
- 2 were "no governance review": owner-local-authorizations and owner-local-confirmation.

The canonical reconcile 667f91a1 refreshed the inventory for 17 of them. On 667f91a1 itself exactly 1 failure remains:
- `lib/product/owner-work.ts` was changed by 1aa3edbe/255ddb1c ("Completed after verified delivery." for completed owner-local stage Works). It is presentation-only.

## This branch
- The hosted work touches `owner-work.ts`, so its fingerprint was refreshed. The new reason covers both that base change and the hosted label.
- Every new or changed hosted executor has an entry that says "Hosted private beta 20261105 … NOT independently reviewed", with the evidence tests named.
- Result: `executor governance ok` (0 failures).
- None of these entries is an independent review. Each reason says so.
