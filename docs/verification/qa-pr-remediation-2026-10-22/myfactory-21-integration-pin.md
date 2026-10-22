# MyFactory PR #21 integration pin

**Qualified git source (do not inherit past this SHA without a fresh campaign):**
`f00ccd885f70f8e088231be4bd6a2f0775714390` on `cursor/qa-remediation-38cf` (PR #21).

Recorded 22 October 2026, America/Los_Angeles. This pin is for integration consumers. It is not permission to merge, deploy, or run paid Work.

## What stays qualified

PR #21 holds the QA-06/07/08/09/23/24/25/37/39/41/42 supervisor and Playwright remediation that hosted CI accepted on that exact SHA. Successor identity is already recorded as `SOURCE_IDENTITY_RECORD_ONLY_NO_INHERITED_QUALIFICATION` in [`qa-remediation-successor.json`](qa-remediation-successor.json).

## How to consume it

- Pin `MYFACTORY_SOURCE_ROOT` / checkout ref to `f00ccd885f70f8e088231be4bd6a2f0775714390` unless a later SHA is independently requalified.
- Do not treat a later documentation commit on this branch as the qualified execution source.
- Do not merge this PR under this document. Merge, installation, owner, execution, and paid-path qualification remain separate decisions.
- MyEve PRs #91/#92/#94 consolidate on a main-based candidate; this Factory SHA is the sibling pin for that candidate. MyEve #93 stays on its Deep Agent base and must not be merged to `main`.
