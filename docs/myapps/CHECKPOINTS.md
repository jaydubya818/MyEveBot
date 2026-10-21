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

## E–I: composed deterministic creation, verification, installation and update

MyFactory E/F checkpoint `cf31a9d2865c3a4c478c55b6229212ab449a34ca` passed
hosted run `37893432840`. The hardened controller checkpoint
`d779b997ed4296c8a54dec8b9a5df01fe29f5123` passed hosted run `37894541802`;
the exact remote SHA was verified. It binds independent Work admission to exact
AppDigest, its actual Factory commit and trusted MyEve runtime source bytes.

The G/H/I implementation has passed local qualification:

- 17 MyEve contract/runtime/resolver/concurrency/fault tests; strict package build.
- 19 affected MyFactory builder/preview/verifier/Result tests, including existing
  tests, exact candidate admission, substitution, signature mismatch, interrupted
  build UNKNOWN across restart, revocation and durable generation fencing.
- Actual canonical WorkStore and all 80 canonical migrations on disposable
  PostgreSQL 17; duplicate Work delivery converges and paused Work is denied.
- Owner request fixture produces an inspectable AppSpec. A new canonical Work
  admits an exact candidate. Separate verifier, canonical signed Result, private
  synthetic preview and explicit browser installation are exercised together.
- Human CRM changes are visible through typed agent queries; Sofie changes are
  visible in the UI. Lead Sources update creates new Work, exact-base successor,
  new verification/Proof/preview and explicit approval. v1 and data stay intact.
- Browser verifies real forms, stages, notes, spend, follow-up, search, disabled
  state, refresh, narrow viewport and generic second-owner query/action/Proof
  denial. A response dropped after a committed action is safely retried once.
- Nine critical UI surfaces have zero serious/critical axe findings and exact
  screenshot comparisons on the same OS/Chromium. Update approval has its own
  composed-journey screenshot comparison. This does not claim manual assistive
  technology qualification or cross-platform pixel equality.
- Injected storage failure after the version write rolls back installation and
  approval; restart/retry preserves lead data and installs the exact successor.
- Local 100-lead registry/resolver/query/action p95 measurements are below 1 ms;
  browser load/navigation/agent-refresh measurements are recorded separately.
  These are synthetic reference timings, not a production SLO.

All new code remains in the isolated reference package, existing Factory builder
extension, narrow CI workflows and documentation. Formatting expands earlier
compact reference files for readability; no production application is refactored.
Public disclosure self-review found only synthetic owners/data and public source
pins. No credentials, production IDs or private evidence paths are committed.

Repository decision: KEEP IN EXISTING REPOS. No MyApps repository/service created.
Paid model operations, production deployments/installations, external-alpha
changes, grants, publication and marketplace payments remain 0. Automatic
installation/update/publication/repair and unrestricted access remain disabled.

Final fresh-clone and hosted qualification of the G/H/I commit are run after this
commit. Independent architecture/security review remains pending; a separate
verifier is not a substitute for review of the implementation itself. Do not
claim final foundation PASS until the final qualification report resolves it.
