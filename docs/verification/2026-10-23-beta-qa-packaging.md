# QA packaging lock requalification

Source-only correction on `codex/beta-qa-packaging-20261023`, derived directly from frozen QA candidate `ea7093a5f427238fe0bee335bee7746b558cefb3`. The separate productive HTTP fixture commit `cd0ca7c2cbc9e7d5705b2c31db91bf84cc7aa02a` is not included in this branch.

## Failure and minimal correction

Hosted CI run `40019649577` reached Builder's mandatory trace verification and failed `Dependency lock changed; packaging qualification required`. The QA adoption added the pinned dev-only DOM test environment, changing the exact root lock hash from `64a6344e61ad69f382a151932b6522b567f20c44c819d53ca7a8c6060b6b76bd` to `f3b0af7a0dcd0f7b7c526dc3f8ff894b458bc03ed1018fa911c263b04d4159c9`.

The correction reseals only `template-dependency-metadata.json`'s lock hash and records the exact QA source commit that contains that lock. Its 181 existing allowed metadata entries, package versions, registry integrities, body hashes and trace scope remain unchanged. No existing dependency version/integrity changed or package was removed. The only 5 new entries are `happy-dom` and its dev-only transitive dependencies. All 179 locally installed qualified metadata bodies matched their existing SHA256 pins; 2 optional Linux metadata bodies were absent locally, with their unchanged lock and existing qualification pins preserved.

No assertion, verifier script, tracing configuration, file allowlist, deployment control, credential, application runtime, authentication, accounting, pricing check or migration was relaxed. The new branch has an explicit false Git deployment entry before any publication. This is a packaging requalification after a dependency-lock change, not a bypass of the lock assertion.

## Qualification

1. Programmatically compared the old qualified lock and current lock, and verified all 181 existing metadata identities and available body hashes. Independent review repeated the lock/pin comparison.
2. Prepared the existing synthetic untracked private-file tripwire with `node --import tsx apps/builder/scripts/qualification-template-trace.ts --prepare`.
3. Ran `npm run build` from the monorepo root. The first local attempt passed the new lock assertion but the strict source inventory rejected generated package metadata left by prior hosted-Eve build output. That failed attempt is preserved. Ignored generated build directories were moved outside the checkout; no trace exemption was added.
4. A clean `npm run build` passed: three successful tasks, Builder and Eve freshly compiled, unchanged MyApps reference check reused from the preceding valid task. Builder's mandatory verifier passed all three routes with 1,592 exact source inputs, 179 dependency metadata bodies and one generated Next context. Eve build `bI2aU4O5g1KpEoqoxkKRd`; Builder build `umfOMpYaAJlaNI-jGZj2b`.
5. Ran the unchanged `node --import tsx apps/builder/scripts/qualification-template-trace.ts`. It passed strict inventory verification, injected untracked trace rejection, altered dependency metadata rejection, unexpected generated trace rejection, generated metadata tamper rejection, no-Git export parity and changed-source rejection. The sealed no-Git bundle matched all 1,628 exported files byte for byte. The script restored traces and dependency metadata and removed its synthetic tripwire.

The clean build retains the pre-existing optional MyApps dynamic asset resolution warning; this correction does not qualify MyApps or add a service. Application behavior is unchanged from the previously reviewed QA candidate, so no new tester/model/browser operation was needed for this packaging-only correction.

Evidence: `/Users/jaywest/Myeve/output/beta-qa-packaging-20261023/`, including the preserved hosted CI log, lock comparison, failed local generated-artifact trace, clean monorepo build and negative/no-Git qualification receipts. Independent review is recorded in the adjacent report. All tests are local and synthetic; no deployment, production SQL, settings/environment change, credentials, tester conversation or paid operation was touched.

## Release limits

Fresh hosted CI on the corrected successor remains required. The same historical CI run also failed PostgreSQL receiver qualification against its older pinned Factory pricing card. This branch deliberately leaves peer pins unchanged and does not claim that failure is repaired. Final Factory source-pair qualification and the separate delayed-admission financial hold remain open. Existing six-feedback accounting-status installation, deployment and bounded live-model smoke prerequisites remain unchanged; this report authorizes none of them.
