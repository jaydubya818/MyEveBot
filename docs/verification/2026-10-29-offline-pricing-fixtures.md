# Offline pricing fixture continuity

The canonical Factory price card expired at 2026-10-29T00:00:00Z. Its production
expiry guards remain unchanged. Ordinary tests must use an explicit synthetic
price identity instead of depending on a current provider tariff.

The opted-in productive fixture now supplies the same bounded five-minute
`fixture-offline-productive-v1` price/plan to the deterministic provider, HTTP
preflight, admission closure and execution control. The existing helper refuses
production mode, missing opt-in, inconsistent canonical bounds or a wider validity
window. Restart reconstructs the same frozen fixture dependencies. No provider
network fallback, protected test, financial policy or production entry changes.
The authority-only PostgreSQL fixture uses its existing separate synthetic plan
limited to the disposable request deadline; its expired-plan denial is retained.

Validation: seven pure fixture cases pass. Five selected existing no-allocation
PostgreSQL admission/cancellation/lost-ack cases pass; 61 nonselected cases are not
claimed as tested. Factory's two public authority/delivery suites reproduce
12 expiry failures in the unchanged parent (16pass/12fail), then pass all29cases
with the fixture correction, including expiry denial and duplicate recovery.
No actual tester or paid model request is made. All PostgreSQL fixtures use owned
localhost clusters and randomly named disposable databases/schemas.

Current ordinary CI peer: `6eb1ae16c1c25800f1c822f7ebcf65b8d47ff833`. Workflow pins, tooling assertions and
the nonexecutable authorization draft are synchronized to this exact source.
Historical compatibility fixtures retain their own identities. Candidate adoption,
independent source qualification, installed authority, production migrations,
protected custody, paid Work and tester activation remain ungranted or pending.
The new source peer is not represented as independently qualified.

The two public workflow hash guards were reconciled only after proving that the
entire composition workflow differs from parent d5da796ab92c7c21e3882405c5e984e77e433187
by exactly three checkout-SHA scalar replacements. The required positive Work
preflight block is byte-identical. Full workflow and residual hashes remain
exact equality assertions. Supplemental component checks retain the distinct
254e peer; their role cannot substitute for composition or release authority.
