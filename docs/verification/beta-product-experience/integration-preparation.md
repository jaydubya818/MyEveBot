# Final integration preparation

**READY FOR INTEGRATION — UI/API-contract qualified**

**LIVE DESIGN-PARTNER E2E — NOT YET QUALIFIED**

Accepted candidate `ed0f6b5dad0e3a131a9f5332139e627245cbd4e8` is retained as
an ancestor on `codex/beta-product-experience`; baseline remains `d64f2f9`.
This record belongs to the subsequent integration-preparation commit, whose SHA
is reported in the handoff. It does not supersede the candidate's evidence identity.

Deliverables: [six-surface crosswalk](../../beta-ux-integration-contract.md) and
[Beta UX Integration Checklist](../../beta-ux-integration-checklist.md).
They map stable contracts and inspected canonical workstreams, distinguish existing
APIs from unmounted/server-only projections, and identify required integration files.
All canonical acceptance cases remain open for their integration owners.

The adapter audit found that sample construction is isolated, live failures never
substitute fixtures, and layouts can be retained. Integration still requires
source-specific adapters and component prop/action wiring because current components
use concrete Goal/Task/Outcome types and own several reads/writes. This is not a
claim that canonical data can replace the sample with a URL-only change.

Only two runtime changes were made: remove the blanket MyFactory claim from every
preview execution, and show upcoming commitments as unavailable when the Daily
Brief cannot be read. The sample's recorded MyFactory milestone remains explicitly
illustrative. No route, authority, schema or backend contract was invented.

Test changes update the affected delegation assertion, extend the existing outage
journey to cover Brief uncertainty, and allow an explicit evidence output directory.
README and evidence changes provide classification and handoff links. This limited
file spread supports review, verification and preservation rather than a new UX tranche.

## Supplemental validation

Supplemental command logs have trailing terminal whitespace normalized; original
qualification logs remain byte-identical.

- [Focused owner tests](integration-owner-tests.log): 12 passed across two files.
- [Typecheck/governance](integration-typecheck.log): both workspaces passed;
  unchanged Builder check reused its cache.
- [Production build](integration-build.log): both workspaces passed; unchanged
  Builder build reused its cache. Eve compiled and typechecked the updated source.
- [Affected browser journeys](integration-browser.log): 4 passed, two journeys at
  1440×1000 and 390×844. Sample journey and partial-outage/expired-session/
  stale-decision/feedback-retry journey; Brief outage assertion included.
- [Supplemental accessibility scans](integration-accessibility.jsonl): 14 scans,
  zero violations under the existing axe rules. Not a formal certification.
- [Preservation manifest](integration-preservation.json): 37 original evidence
  files compared byte-for-byte against the accepted candidate, including all
  27 PNGs, original logs, browser report, accessibility scans and source manifest.
  The original dossier README alone was intentionally updated as requested.
- `git diff --check`: passed. Temporary synthetic-auth server stopped after tests.

Browser checks used the existing isolated loopback production server, synthetic
owner auth and fixtures/intercepted APIs; no real provider/database credentials.
Supplemental images/report went to `/tmp/myeve-beta-integration-preparation`, not
the accepted evidence directory. These checks do not qualify real database
persistence, agent continuation, provider receipts or protected verification.

Reproduce the affected browser subset after building and starting the existing
`apps/eve/test/owner/local-server.cjs` harness:

```sh
MYEVE_OWNER_EVIDENCE_DIR=/tmp/myeve-beta-integration-preparation \
  npm exec --workspace=eve-agent playwright -- test \
  -c test/owner/playwright.config.ts --grep 'new owner through|partial data'
```

Use a fresh output directory for each reproduction. Stop the harness afterwards.
No canonical backend workstream, migration, production action, merge or deployment
was modified/performed. Live E2E remains NOT YET QUALIFIED.
