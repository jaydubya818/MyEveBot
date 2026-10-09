# MyEve / Sofie local product acceptance

**Decision: NO-GO. Comprehensive qualification remains incomplete.**

Tested canonical `88370d0662c7824445b59779a8b8e8b21abfa10b` on September 20, 2026 using Sarah / Ava. The actual UI exposed release blockers even though the unit, contract and governance checks pass. No product code was changed to make tests pass.

[Reproduction instructions](REPRODUCE.md) · [All 251 requested sections](COVERAGE.md) · [Machine-readable coverage and original requirements](coverage.json) · [Evidence directory](evidence/) · [Source excerpts at the tested SHA](source/)

## Release blockers

| ID | Priority | Finding | Reproduction and evidence |
|---|---|---|---|
| F1 | P1 | Mobile navigation cannot be opened reliably by tapping its trigger. | At390×844 on Goals, the closed sidebar’s icon row overflows its256px width. Offscreen icons intercept Open threads. Playwright reports the intercept; screenshot shows stray icons. Keyboard focus+Enter works as a diagnostic workaround. [Failure](evidence/mobile-goals.txt), [screenshot](evidence/mobile-current.png). Source: `app/chat.tsx:1221`. |
| F2 | P1 | Chat attachment does not become a durable File. | Attach `atlas-notes.txt`, send it, open Files. Transcript contains the file marker but Files API returns `[]` and UI says No files yet. `sendDraft()` passes a data URL directly to the runtime and never calls the existing `persistChatUpload()` helper. No storage readiness error protects this path. Model interpretation is separately blocked. [Evidence](evidence/files-and-result.txt), [screenshot](evidence/files-after-upload.png). Source: `app/chat.tsx:2098`, `lib/chat-file-client.ts:80`. |
| F3 | P1 | Backup verification accepts duplicate ZIP entries. | Upload valid bounded synthetic archive with duplicate entry:200 verification success, contrary to fail-closed requirement. JSZip normalizes entries before the validator examines `zip.files`, losing duplicates. [Matrix](evidence/archive-security-ui.txt), [generator](harness/archive-cases.py). Source: `lib/owner-data.ts:252`. |
| F4 | P1 | Backup verification accepts secret-bearing data. | Add a synthetic `password` field and regenerate checksums:200 verification success. The export-side secret-field check is not applied to imported verification content. This used a fake marker, not a real credential; restore remains disabled. [Matrix](evidence/archive-security-ui.txt). Source: `lib/owner-data.ts:94`, `:117`, `:251`. |

These are four distinct defects, not four failed attempts to configure unavailable providers. None was fixed during this acceptance run.

## Additional findings

| ID | Priority | Finding | Evidence |
|---|---|---|---|
| F5 | P2 | Confirmed owner Profile reset is offered but returns409 because the write path is not qualified for autonomous execution. The generation stays1. Confirmation/cancel exists, but the action cannot complete even against the empty local profile. | [UI confirmation](evidence/computer-share-reset.txt), [server response](evidence/server.log), `app/api/computer-profiles/route.ts:62`. |
| F6 | P2 | Sarah/Ava identity leaks Sofie copy in Results and Skills; Ava’s initial greeting refers to “his tools” and “him.” | [Results](evidence/files-and-result.txt), [initial chat](evidence/chat-initial.txt), [settings](evidence/manage-content.json). |
| F7 | P2 | Agent Archive acts without confirmation and leaves a blank detail area even while other Agents remain. | [Lifecycle](evidence/agent-lifecycle.txt), [settled state](evidence/roles-founder-expanded.txt), `components/agents-panel.tsx:126`. |
| F8 | P2 | Chat’s Limited mode banner claims everything else is available despite model authentication failure. | [Screenshot](evidence/chat-model-failure.png). System’s more detailed readiness view does identify missing services. |
| F9 | P2 | Computer includes an unnamed icon button. Axe classifies this as critical for accessible button naming. | [Desktop axe](evidence/axe-desktop.txt), [accessibility tree](evidence/computer-current.txt). |
| F10 | P3 | Phone briefly appears before settings readiness settles, then disappears; directly loading `/manage/phone` falls back to Getting started. | [Mobile navigation](evidence/mobile-destinations-rest.txt), [route inspection](evidence/settings-final-inspect.txt). |
| F11 | Gap | Relay metadata is absent from the archive’s17 domains. Restore/import is deliberately unimplemented. Files are metadata/reference-only; there is no binary backup. | [Archive audit](evidence/populated-archive-audit.json), [backup UI](evidence/backup-populated-current.txt). |

The compression-ratio rejection test passed with a bounded5MB payload. The validator invokes JSZip CRC loading before its post-load size checks; this is a static resource-exhaustion concern, not a claimed successful unbounded archive-bomb exploit.

## What actually worked

- Created three persistent Goals through real desktop/mobile forms, plus a task and milestone. Reloaded state and canonical API agree. Goal task appears in Review focus.
- Created all six typed Knowledge categories through the supported canonical Knowledge API and exercised their real UI tabs/search/detail. Corrected October1 to October15 while retaining superseded history. Forget required scoped typed confirmation, removed the Preference and recorded an audit receipt. Conversational Knowledge creation/retrieval was not successful because model authentication is absent.
- Created Analyst and Founder / Chief of Staff Agents through real forms. Pause, resume, duplicate and archive persisted. Canonical runtime rejected paused, archived and foreign Agent bindings; primary pause/archive rejected.
- Expanded all displayed Role/Founder disclosures. Researcher, Software architect and Marketing Engineer entry CTAs created Role threads with empty composers; they do not populate a prompt. Founder OS populated a bounded draft. No successful Role execution is claimed. Founder domains honestly remain Unknown.
- Shared Ava’s empty local profile with Analyst and revoked it through the UI. No provider desktop was created.
- Completed a clearly labeled deterministic Run fixture through the canonical completion function. Its durable Result appears in Results and Review; Helpful feedback persisted. Reuse CTAs generated draft prompts. The fixture has zero evidence artifacts and is not research qualification.
- Exercised Approvals with canonical synthetic requests, including real two-tab approve/deny competition and double-click. Exactly one decision won; the loser received409. Control Center rendered eight synthetic Run states and Pause reached durable paused state. No live worker resume is claimed.
- Generated daily/weekly persisted review checkpoints. Repeated generation reused the period checkpoint. In-app daily delivery settings persisted at09:15 America/Los_Angeles, displayed the next PDT occurrence, and were disabled again. No external delivery occurred.
- Dark theme persisted reload; Light selected; System restored.
- Exported initial and populated backups;35 independent SHA-256 checks passed in each. Populated archive has three Goals, one milestone/task, six remaining Knowledge records, four Agents including archived copy, eight synthetic Runs, one Result and three approval records. It includes incomplete Run state and honest provider portability limitations.
- Forced Owner Data inventory503 and recovered through Retry without losing settings navigation. A real stop of only the isolated PostgreSQL cluster yielded a sanitized Goals503; after restoring the cluster on55473, Try again recovered the same records.

## Environment and qualification limits

At the start, local `main`, `origin/main`, and a fresh remote `refs/heads/main` check all matched the required SHA. Testing used a `git archive` export at `/tmp/myeve-acceptance-88370d0`, not the dirty working branch. The six source files central to the findings were rehashed against the requested git object with exact matches ([verification](evidence/source-verification.json)). Installed dependencies were reused through symlinks; the tested product source remained the frozen archive. The original checkout had unrelated changes and advanced to another commit during the run; these changes were not reverted or included in the acceptance source.

PostgreSQL17 ran in `/tmp/myeve-acceptance-88370d0-pg`, dedicated port55473, database `postgres`, with migrations0001–0030. The harness adapts Neon’s HTTP SQL transport to this local PostgreSQL server. It permits only localhost:55473 database targets and blocks other external fetch destinations. It does not replace application authorization, state logic, tools or model outputs. The first outage-test restart omitted the port option and briefly started this same isolated cluster on5432; the app stayed configured for55473 and never connected there. Correcting the port restored service.

The app ran at localhost:3073 with a scrubbed environment and Sarah/Ava identity. The headed browser used1440×900 and390×844 viewports. Local Next development mode does not enforce production web authentication, so production anonymous HTTP/login behavior is **not qualified** by this run. Auth unit/contract tests are supplementary evidence only.

No valid AI Gateway key was available. The available OIDC token was expired. Canonical chat reached the runtime but failed with “AI Gateway received no credentials.” Consequently, conversational planning, successful model/tool work, Goal→Knowledge→Result reasoning, preference/contradiction behavior and research evidence remain blocked. No simulated response is presented as an Agent success.

Automatic approval review rejected the attempted `vercel env pull` because it would download the entire development environment, potentially including unrelated database/provider secrets. It did not run. A model-only credential, or explicit authorization for that broader temporary credential retrieval, is still needed. No user response was received to the pending authentication choice.

Orgo, Blob/private Skills, Composio/connected apps, Supermemory and external delivery were unconfigured. No real messages, OAuth connections, provider desktops or sandboxes were created. Routine activation is disabled by canonical governance. The user attachments contain three text work orders but no actual reference screenshots, so image-to-image regression comparison was impossible.

## Automated checks (supplementary)

| Check | Result | Evidence |
|---|---|---|
| TypeScript, capability registry, Skill routing, executor governance | PASS;135 capability definitions,99 authored tools,515 classified sources, UNKNOWN=0. Routing50/57 rank one. | [Log](evidence/typecheck.log) |
| Vitest |591 tests in86 files passed | [Log](evidence/unit-tests.log) |
| Node contract suite |134 passed | [Log](evidence/contract-tests.log) |
| Database integrations |8 passed,2 failed/blocked | [Log](evidence/database-integration.log) |
| Execution reliability integration |All reported groups passed, using deterministic model/provider fixtures against isolated real PostgreSQL | [Log](evidence/execution-integration.log) |
| Desktop axe |Eight scanned destinations had no violations; Computer unnamed button fails. This is not a full accessibility pass. | [Log](evidence/axe-desktop.txt) |
| Mobile axe |Incomplete; several navigation timeouts and loader-only snapshots. Do not count these as passes. | [Log](evidence/axe-mobile.txt) |

The database integration failures were scoped-memory without `SUPERMEMORY_API_KEY`, and a computer-session fixture failing the newer active Run/ComputerSession/BrowserSession/provider binding requirement. They were not hidden or weakened. The execution integration covers exact approvals, expiry, recipient/account changes, one-use handles, crash receipt recovery without resend, owner/stale controller fences, optional delivery, Run Now races, revoked grants and immutable history. These remain deterministic tests, not successful UI/provider journeys.

Automation selector mistakes and cold-compilation timeouts are retained as raw evidence but are not automatically counted as product defects. `page-error-recovery.txt` contains several unsettled snapshots and is not a seven-surface recovery pass. The first populated UI download wait timed out although the server returned200; the archive saved for independent analysis was subsequently retrieved through the same canonical endpoint. File chooser automation initially attached twice; the duplicate was removed before the one-file send and is not reported as an app defect.

## Manage inventory

“Exercised” describes the actual work, not complete feature qualification. All19 stable visible menu items were opened on desktop and mobile; Phone is included as a transient twentieth item. Provider setup states are explicitly partial.

| Section | Menu item | Route | Rendered | Exercised | Result / notes |
|---|---|---|---|---|---|
| General | Getting started | `/manage/getting-started` | Yes, desktop/mobile | Setup cards; all five Try once | PARTIAL—drafts verified; execution model-blocked |
| General | Briefs & reviews | `/manage/review-delivery` | Yes | Save daily cadence/timezone, reload, disable | PARTIAL—external delivery unavailable |
| General | System | `/manage/system` | Yes | Readiness/diagnostics | PARTIAL—unconfigured providers |
| General | Appearance | `/manage/appearance` | Yes | Dark persistence, Light, restore System | PASS for theme/identity display |
| General | Your data | `/manage/data` | Yes | Export, verify/adversarial archives, correction, Forget, failure/retry | FAIL—duplicate/secret archive validation |
| General | Agents | `/manage/agents` | Yes | Shared Agent/Role surface and lifecycle | PARTIAL—archive UX defect; model-blocked |
| Automations | Reminders | `/manage/reminders` | Yes | Empty state and creation guidance | PARTIAL—model creation unavailable |
| Automations | Triggers | `/manage/triggers` | Yes | Empty state/authority guidance | PARTIAL—external provider required |
| Channels | Slack | `/manage/slack` | Yes | Setup state | PARTIAL—EXTERNAL PROVIDER REQUIRED |
| Channels | iMessage | `/manage/imessage` | Yes | Pairing/shared-number setup state | PARTIAL—EXTERNAL PROVIDER REQUIRED |
| Channels | Phone (transient) | `/manage/phone` | Briefly | Direct route checked | FAIL / visibility gap—falls back to Getting started |
| Knowledge & tools | Memory | `/manage/memory` | Yes | Setup/typed Knowledge distinction | PARTIAL—EXTERNAL PROVIDER REQUIRED |
| Knowledge & tools | Connections | `/manage/connections` | Yes | Setup and no accounts | PARTIAL—EXTERNAL PROVIDER REQUIRED |
| Knowledge & tools | Skills | `/manage/skills` | Yes |79 packaged Skills, source/assignment/quality views | PARTIAL—EXTERNAL PROVIDER REQUIRED for private content; identity drift |
| Operations | Routines | `/manage/routines` | Yes | Filters/readiness/disabled execution | PARTIAL—canonical execution disabled |
| Operations | Relay | `/manage/relay` | Yes | Disabled/unconfigured state | PARTIAL—EXTERNAL PROVIDER REQUIRED |
| Operations | Control Center | `/manage/control` | Yes | Synthetic Run cards, Pause, Cancel request | PARTIAL—real worker resume not qualified |
| Operations | Approvals | `/manage/approvals` | Yes | Exact approve/deny, double click, two-tab race | PASS for tested decisions; full state matrix partial |
| Operations | Activity | `/manage/activity` | Yes | Audited work/empty and fixture state | PARTIAL—no complete real provider lifecycle |
| Operations | Finance | `/manage/finance` | Yes | Empty receipts/copy | PARTIAL—no populated receipt flow; export flags legacy owner scope |

## Top-level inventory

| Destination | Route | Desktop / mobile | Result |
|---|---|---|---|
| Chat | `/chat` | Visited / visited | Model authentication failure; file persistence defect |
| Goals | `/goals` | Populated / populated | Creation/task/milestone persistence works; mobile drawer fails |
| Knowledge | `/knowledge` | Populated / visited | Typed API-backed records, correction and Forget work; conversational use blocked |
| Results | `/results` | Populated / populated | Fixture Result/feedback/draft actions work; no real research evidence |
| Computer | `/computer` | Visited / visited | Share/revoke work; reset blocked; live provider unavailable |
| Agents | `/agents` | Populated / populated | Persistent Agent management and Role catalog; archive UX fails |
| Review | `/review` | Populated / populated | Deterministic focus/checkpoints/Result visible |
| Channels | `/channels` | Visited / visited | Setup required; connected history and real delivery unavailable |
| Files | `/files` | Visited / visited | FAIL—submitted chat attachment absent |
| Manage | `/manage` | Visited / visited | Complete observed menu inventory above; provider actions partial |

[Final sweep](evidence/final-navigation.txt) and [settled follow-up](evidence/final-navigation-settled.txt). Earlier desktop/mobile screenshots also remain in evidence. Some earlier screenshots captured loading transitions; the follow-up corrects the landing-page `/` versus `/chat` distinction and mobile Manage index readiness. Cold development compilation also caused an initial Computer wait to time out.

## Primary action inventory

| Action | Observed outcome |
|---|---|
| Create first Goal / New goal | Durable UI-created state; mobile create also succeeded |
| Generate brief / Generate review | Checkpoint persisted; repeat reused same period checkpoint |
| Create Agent / Edit configuration | Analyst and Founder saved; broad invalid-input matrix incomplete |
| Pause / Resume / Duplicate / Archive Agent | Persisted; Archive lacks confirmation and loses selection |
| Open Agent | Control inspected; successful Agent conversation model-blocked |
| Use Role | Three representative Role threads created; execution not submitted |
| Create Agent from Role | Founder coordinator prefill and save; other Role variants not all tested |
| Use Founder OS | Bounded draft, asks for missing business context |
| Profiles / Activity | Both rendered; no live sessions |
| Share / Revoke | Local grant changed and revoked |
| Reset profile | Cancel works; confirmation returns409, no reset |
| Set up Email / Slack / iMessage / Delivery settings | Setup destinations inspected; no credentials entered or external sends |
| Search connected history | Unavailable without connection |
| Go to chat | Empty Files navigation exercised |
| Try once (all five) | Draft only; no routine silently created |
| Result Accept / Request changes | Feedback mutation and revision draft; settled Helpful confirmed |
| Result Run again / Save as skill / Make routine | Drafts with appropriate review/cadence boundaries; no execution |
| Routine Run Now / Recover | Disabled or absent in empty canonical UI; deterministic integration only |
| Approve / Deny | One accepted decision; duplicate/racing mutation409 |
| Run Pause | Durable paused checkpoint visible |
| Run Cancel | Request exercised; full cancellation/provider cessation not claimed |
| Resume in chat / Retry in chat | Offered on fixture cards; actual worker execution not qualified |
| Download / Verify backup | Valid checksum flow plus two fail-open cases |
| Correct / Forget Knowledge | Supersession and scoped confirmed delete with receipts |
| Sign out, full thread rename/pin/delete, every sort/control edge case | Not comprehensively exercised; no blanket all-buttons pass |

## Release next step

Fix F1–F4 first, then resolve the owner reset path, accessible button name, archive confirmation/selection and identity/readiness copy. Rerun on the resulting canonical SHA with model-only authentication and isolated provider fixtures/accounts where needed. Complete the unqualified behavior/security/mobile cases in the251-section ledger. Do not use the green automated suites as approval to ship this UI.

Raw evidence intentionally includes failed harness attempts, so use the specific successful/failed observations identified in this report and coverage ledger. Product defects are separated from missing providers, unimplemented features, absent reference screenshots and incomplete tests.

## Teardown

The dedicated acceptance browser, Next server on3073 and PostgreSQL cluster on55473 were stopped after evidence capture. Other development servers were left untouched. The frozen source, cluster data and final synthetic database dump are retained for reproduction. No shared environment was downloaded and no product fixes were applied.
