# Scoped successor to a82 hosted qualification failures

This change corrects five test and qualification files after the genuine failures
on `a82fbfacb6a9300d1880db022efd922bb8ffabc8`. Application code, dependency lock,
credentials, owner identities, accounting authority and serving deployments are
unchanged. This is a local nondeploying candidate, not a complete release approval.

## Corrections and reproductions

- The obsolete LangChain/LangSmith import contract reproduced
  `ERR_MODULE_NOT_FOUND` after the reviewed public telemetry migration. Its
  replacement imports the actual public client, span adapter and instrumentation,
  checks local redaction and test-mode gating with synthetic keys/Workshop
  configured, rejects network connections, and asserts the retired dependency
  chain remains absent. Other dependency-security cases remain intact.
- Both component browser fixtures bundled app React/ReactDOM 19.2.8 together
  with hoisted Next Link's root React 18.3.1. Actual esbuild metafiles proved the
  duplicate; the original feedback and Alpha Tasks browser failures reproduced.
  Public esbuild package aliases now share the app renderer's React, including
  subpaths. Real Next Link/components, authentication, install/update/rollback,
  isolation assertions, timeouts and dependency versions remain unchanged.
- The exact hosted composed report exposed two stale catalog entries. The
  password-schema case raises database-schema from two to three passing cases;
  current feature tests add both disabled Work-tool denials and remove the old
  `/work/new` allowance case, raising that suite from 77 to 78. All other suite
  identities, skipped identities, QE and historical baseline profiles match.
  The strict validator and its rejection controls are unchanged.
- The four owner-shell viewports expected an old navigation list. Existing
  server-allowed Results and Activity links are now included in exact order;
  an additional assertion checks every exact href. No destination or eligibility
  gate changed.

## Verification

The local evidence directory is
`output/beta-a82-hosted-successor-20261023` in the coordinating workspace.

- Standard `npm test`: 327 total, 324 passed, three existing skips, no failures.
- Full typecheck: four tasks passed, executor inventory UNKNOWN count zero.
- Actual Alpha Tasks PostgreSQL/pinned-Docker/browser suite: all five passed.
- Feedback response-loss/retry/read-recovery browser fixture: passed on desktop
  and mobile, with zero serious/critical accessibility findings.
- Current schema, feature-denial and navigation contracts: 86 passed.
- Strict report/pin controls: five passed, including malformed-report rejections.
- Original hosted reports, read without rerunning the campaign: composed 23
  files, 383 passed and six existing skips; QE eight files, 106 passed. The
  corrected exact catalog validates both. The original catalog and its `3 !== 2`
  failure are retained separately; no historical evidence was overwritten.
- Clean offline owner-UX production build passed. All 12 owner-shell browser
  cases passed, including four viewports, exact labels/hrefs, mobile focus,
  accessibility, denied routes, session recovery and draft preservation. A fresh
  IPv6-only local database preserved other running fixtures; its server and
  cluster were stopped after verification. No Work or provider was executed.
- All 1,595 existing production template input hashes and the lock hash remain
  unchanged. These test/catalog files are outside the Builder closure; no Builder
  reseal is required.

Independent review accepted the telemetry/browser fixes and the catalog/shell
assertions. Review evidence: `independent-review.md` and
`independent-catalog-shell-review.md`; the latter additionally verifies six
browser screenshot provenance records. Test counts above overlap and must not
be added together.

## Unresolved release holds

The selected Relay `f7264e0a` source lacks the ordering and capability-preparation
APIs required by composed admission. Canonical-source adoption and qualification
remain with the Relay owner/coordinator; this change does not copy policy code,
change pins, remove assertions or claim that composed admission passed.

All three original positive owner Work journeys remain failed/held. Retained
golden, E3 and independent CI artifacts show the synthetic model demanding
`engineering_work`, which the current chat-only model and executable-tool gates
correctly deny. They then report `OFFLINE_FIXTURE_MODEL_FAILED`. The first message
was submitted; the independent script's second click targets an empty disabled
composer. This is not evidence of a keyboard submission defect. The fixture also
lacks current chat-only enrollment/accounting prerequisites for the usage panel.
No gate, policy, budget, fixture identity or positive acceptance assertion was
changed to make those journeys pass. Their downstream checks were not reached.

Official CI must run against the final coordinated successor. No production
deployment, tester mutation, paid call or complete installed qualification is
authorized by this scoped receipt.
