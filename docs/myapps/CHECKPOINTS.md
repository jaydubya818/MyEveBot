# MyApps checkpoint evidence

## A–C: contracts, registry and typed runtime

Status: PARTIAL for the mission; implemented reference contracts pass.

Canonical source pins and architecture rationale: [FOUNDATION.md](FOUNDATION.md).
MyEve checkpoint: `815380f80163d716798124e5219d1aad554a755b`.
Remote branch verified by `git ls-remote`; hosted run `37891585727` passed on that SHA.
MyFactory, skillz and Relay remain at their source pins with no changes at this checkpoint.

- AppSpec, identity/version/digest, registry, synthetic CRM contract: PASS.
- Owner-isolation, security negatives and SQLite concurrency: PASS, nine tests.
- Strict TypeScript check: PASS using the canonical installed Node types/compiler.
- PostgreSQL: NOT_RUN; the isolated reference uses SQLite.
- Browser, accessibility, Factory builder, independent verifier: NOT_RUN at A.
- Installation/update: PARTIAL; transactional reference tested, integration pending.
- Fresh clone and independent review: NOT_RUN at A.
- Public disclosure self-review: PASS for the changed files; only synthetic data.
- Repository decision: PENDING. MyApps repository created: NO.
- Paid model operations, production deployments/installations, external-alpha
  source/FactoryVersion/tester changes: 0.

## D: isolated owner experience and Sofie fixture

The prototype server binds only loopback. Its login is explicitly a two-owner
synthetic fixture, never production authentication. Generated content cannot
provide HTML, JavaScript, CSS or request routes. All displayed App data is escaped.
API requests require the exact origin and server-issued SameSite HttpOnly fixture
session. Request bodies cannot choose owner, actor or policy.

Run `node packages/myapps/browser/journey.mjs` after canonical `npm ci` and
Playwright browser provisioning. No environment file or production credentials
are loaded. Evidence goes to ignored `output/playwright/myapps/`.

Local results: ten unit/concurrency/resolver tests pass; browser journey passes.
Nine surfaces have screenshots and zero critical/serious axe findings. Checked:
Apps, preview summary, Needs You, Lead Detail, Overview, Pipeline, Follow-ups,
App details and 390px Overview. Keyboard focus and horizontal overflow checked.
UI mutations are read through the agent API; agent changes are visible after
refresh. Notes survive browser reconnect. Cross-owner route, query and Proof
requests return the same generic 404 response. No browser JavaScript errors.
A sidebar contrast failure was corrected before this result.

Preview at this checkpoint is an inspectable candidate summary; interactive
candidate preview and Factory-produced evidence remain G requirements.
Sofie uses a deliberately small deterministic grammar, with NO_MATCH, AMBIGUOUS,
WORK_REQUIRED and APPROVAL_REQUIRED outputs. One transaction binds the turn
receipt and mutation. This qualifies reference routing, not live model behavior.

Independent review, fresh clone and final composed Factory journey remain pending.
