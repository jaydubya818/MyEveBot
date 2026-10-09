# MYEVE ALPHA UX — FINAL QUALIFICATION

Checkpoint H is **FAIL / not qualified for alpha adoption**. A–G remain accepted at `5110293cb7dd7d2af8eea490c783c736fee72ff7`. This document belongs to the candidate source commit; final exact-SHA fresh-checkout, CI and independent-review outcomes are reported with that commit in the delivery report.

## Implemented and locally verified

- First-message context: PASS. The actual 71,425-byte failing request now reaches the deterministic provider at 24,930 bytes; the Work-create follow-up is 28,702 bytes. The 32,000-byte bound and 1,024-output-token cap are unchanged. Current mandatory policy is required before pricing and before dispatch. See `context-qualification.md`.
- Login lands on Today. Work discussion opens a new owner-scoped conversation bound to exact canonical Work. Resume/pause retain existing compare-and-swap controls; any external-alpha authority fences generic controls. Durable server effects associate newly created Work with the correct owner/Agent/session/thread.
- Focused contracts: 296 tests across the affected suites; PostgreSQL: 52; chat recovery: 6. TypeScript passes.
- Desktop/390px, keyboard, accessibility and visual regression: 25 browser tests pass. Exact local macOS/Chrome baselines compare with zero differing pixels after masking timestamps. Linux CI captures are not exact comparisons with macOS baselines. Accessibility means no serious/critical axe WCAG 2 A/AA and 2.1 AA findings in the tested states, plus the documented keyboard checks; it is not a comprehensive accessibility certification.
- Independent source review identified and closed the missing-policy admission gap. All 12 changed Work-detail baselines received limited visual review. Final exact-commit review remains a separate release gate.

## Golden Journey: FAIL

The deterministic browser integration exercises real login, Today, Sofie, canonical Work creation, a canonical pre-admission Needs You answer, resume, dispatch, signed Result ingestion, Proof and Work reload. Model output and Factory responses are synthetic, while owner checks, execution tools, PostgreSQL authority/accounting and Result validation are real.

Observed durable counts: **one Work, one authority, one dispatch, one execution and one Result**. The verified candidate remains PARTIAL, with the same immutable Result ID after reload. No duplicate lifecycle effects were observed. A pass of the boundary-regression test confirms these counts and the exact failures below; it does not qualify the requested end-to-end Golden Journey.

1. After successful Work dispatch, the next paid chat step is rejected by `EXTERNAL_ALPHA_SHARED_FENCED`. The local chat reservation remains unresolved; even after scheduled Work reconciliation retains the Result, a later paid Sofie readback fails with `Unresolved exposure fences further admission`. Work/Proof remain readable. No accounting records were cleared or manually settled. A reviewed non-paid acknowledgment/recovery design is needed.
2. The frozen backend has no owner-accept/complete operation. A Needs You answer records continuation eligibility, not Result acceptance. It would be false to relabel a verified private candidate Completed. The requested post-Result decision → completion flow requires an owner-approved acceptance contract or an explicit change to the release requirement.
3. Historical screenshot provenance is unresolved. The brief supplies no screenshot source environment or record IDs. Candidate seed scripts are documented in `implementation-ledger.md`, but cannot establish attribution. No tester installation was queried, altered or scrubbed.

## Release impact

See `external-alpha-change-impact.md` for the comparison against frozen `8338309582d6806829dec1ae1beef301d6b52425`, changed context and generic-control behavior, unchanged migrations/Factory protocol/accounting contracts, adoption prerequisites and rollback boundaries. The package does not authorize adoption of the new source in an existing tester installation.

Production deployment: **NOT_RUN**. Paid providers, policy activations, tester grants, tester installation mutations and publication effects: **0**. Synthetic disposable test-policy activation is fixture setup only. Recommended alpha adoption: **NO**.
