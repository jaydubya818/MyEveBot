# Beta UX Integration Checklist

**READY FOR INTEGRATION — UI/API-contract qualified**

**LIVE DESIGN-PARTNER E2E — NOT YET QUALIFIED**

Accepted candidate: `ed0f6b5dad0e3a131a9f5332139e627245cbd4e8` on
`codex/beta-product-experience`; baseline `d64f2f9`.
Dependencies and exact field ownership are in the
[integration crosswalk](beta-ux-integration-contract.md). All cases below remain
**open for canonical integration**; previous fixture passes do not check them off.

For each case, record backend/UI SHAs, contract version, environment, authenticated
owner scope, source record IDs/revisions, observed response and UI result. Keep
credentials out of evidence. Run adapter cases first; repeat relevant journeys
against durable authenticated canonical services for live qualification.

| ID | Exact input / action | Acceptance result |
| --- | --- | --- |
| A01 | Replace sample reads with S/E/G canonical adapters; inspect all live page requests and reload | No sample IDs, `exampleSnapshot`, preview storage or fabricated fields supply live content; preview remains explicit and produces zero live mutations |
| A02 | Return an unsupported contract version, missing required identity/evidence array, and unknown enum in separate responses | Invalid records become source-unavailable; unknown supported-shape states display Unknown, never successful/running; unaffected resources remain usable |
| A03 | Give Goal, engineering Work, Run and Result the same unqualified ID | Source-qualified selection, links and evidence lookup resolve the intended entity; no cross-type join |
| A04 | Read as owner A, then request owner B's known IDs and artifacts | Backend denies cross-owner reads/writes; UI reveals no cached B content. Missing/expired session offers sign-in and no actionable stale decisions |
| A05 | Return empty success, delayed read, 404 capability, 503, timeout and aborted navigation separately | Empty/loading/unavailable stay distinct; no sample substitution or unhandled render; successful independent sections remain visible |
| A06 | Exhaust Today cursor, brief event cursor and brief current-Goal cursor independently; supply truncated detail | No duplicates/omissions at cursor boundaries, bounded totals labeled; raw brief timestamp cursor precision preserved and fixed since/until retained |
| W01 | Load Goal → Task → engineering Work with exact source references, then an unlinked task/run | All drill-downs keep identity and context; orphan history remains accessible without duplication in aggregate Work |
| W02 | Load draft/no admission, PROPOSED route, ADMITTED queued run, current productive run, verifying candidate, accepted Work | Each state retains its real phase. Proposed/admitted does not imply running; verification does not imply acceptance |
| W03 | Supply a historical RUNNING run with stale generation, expired deadline, missing custody, then ambiguous custody | No active productive run advertised; retained history and reasons remain visible; no inferred retry or admission |
| W04 | Set paused, human, stopping, cancelled, superseded, failed and unknown states; keep an older completed run | Correct control/terminal reason appears; old completion never overrides current Work; stopping is not confirmed stopped |
| W05 | Supply G completedTasks=requiredTasks but completedOutcomes<requiredOutcomes; then truncated/zero-task goal | Task counts and outcome counts remain distinct; no Goal-success claim or invented overall percent; truncation visible |
| W06 | Save first Work through the appropriate canonical source; fail response after durable write and retry same intent | Backend idempotency returns one record; form survives failure; saving does not bypass admission; discussion opens referenced unsent draft |
| D01 | Load MYFACTORY PROPOSED, preparation-only, dispatched/no receipt, authenticated receipt, and fenced terminal receipt | UI labels each observed stage; no receipt/custody assumed from intent; terminal receipt remains history without restoring authority |
| D02 | Load DIRECT admitted Work and native run, then plain Sofie conversation with no Work route | Direct Work uses routing/current run provenance; conversation alone never becomes admitted Work or MyFactory delegation |
| D03 | Load RELAY WAITING, UNKNOWN, DENIED, ATTACH, DUPLICATE; revoke grant/change Work generation before readback | Only valid current binding attaches advisory reply; duplicate adds no progress; expired/revoked/mismatched response cannot be success or writer authority |
| D04 | Omit providerId, Factory version, receipt, candidate producer and direct writer session independently | Unknown/missing labels remain accurate; no fixture name, zero identity or inferred provider fills the gaps |
| P01 | Open Result for a run outside the recent list while another run has passing checks | Exact run/candidate/revision evidence is fetched; unrelated evidence never appears, including during loading/navigation |
| P02 | For one candidate provide PASS, FAIL, UNKNOWN, STALE, NOT_RUN evidence; change criteriaVersion, base, profile or candidate | Backend-current binding controls verification; stale/missing/failed evidence cannot produce independent-verification success |
| P03 | Return producer executor/external/human/trusted-verifier or engineering protected-supervisor with its actual schema | Preserve source vocabulary and authority; producer label alone is insufficient. Human criteria and deterministic criteria retain their distinct evidence requirements |
| P04 | Return proof PARTIAL with passing local checks and native completion phase COMPLETE; omit publication/CI/review/acceptance | UI retains PARTIAL/local completion and limitations; never reports fully accepted or publicly delivered success |
| P05 | Return ResultVersion history plus latestResult reference and nativeResult.current=false | Exact selected revision remains inspectable; stale result is labeled; summary/latest pointer does not replace full Result/evidence |
| P06 | Fetch artifact successfully, then denied/expired/not found; provide event reference without reader | Only authorized content is downloadable; unavailable content has explicit fallback; no invented event URL or successful download claim |
| N01 | S approval with exact bindingHash; I action with itemId/actionId/actionBinding/expectedRevision; change binding before submit | Correct source handles action; stale/expired decision fails closed, refresh required, no optimistic approval or duplicate response |
| N02 | E publication attention bound to candidate/version/revision; then text-only pendingDecisions or missing binding | Exact backend decision contract required; informational strings never become executable approval buttons |
| N03 | G owner choice through attention snapshot; replay old revision after resolving, then page I Needs You | Resolved choice cannot revive; only current source action is actionable; all cursor pages preserve decisions and source ownership |
| N04 | Submit valid I response returning PENDING; later DELIVERED or CANCELLED | Receipt status remains distinct from executed Work. Necessary judgment and avoidable coordination retain source classifications |
| R01 | Fail browser read while backend execution continues; refresh | Report connection uncertainty, never execution failure/stoppage; refresh performs reads only |
| R02 | Return unknown publication effect, stale repository observation, unknown model usage or unresolved writer custody | Display reconciliation reason and source-permitted next step; no auto-resend, automatic repair, reclaimed budget or safe-retry claim |
| R03 | Fail mutation before confirmation; repeat click while pending; change Work version before retry | One in-flight UI write; intent retained; current backend binding rechecked and conflict surfaced; no guessed replacement token |
| B01 | Read G brief with events exactly at since/until and multiple cursor pages | Fixed-window source semantics preserved (G is since-exclusive/until-inclusive); source IDs deduplicate; all intended changes accessible |
| B02 | Return empty completed/upcoming lists, then fail the brief source | Empty success says none recorded; failure says unavailable, including upcoming commitments; no fabricated summary |
| B03 | Supply RESULT_RECEIVED success and blocked Result events in newBlockers | Only actual blocker semantics are labeled new blockers; a received successful Result is not a blocker by array membership |
| B04 | Supply scheduled dependency dueAt, routine's confirmed next run, and missing scheduling source | Commitment time and scheduled execution time remain distinct; missing source stays unconfirmed; timezone comes from schedule owner |
| B05 | Supply scoped knowledge correction/change source, then no change feed or inaccessible source | Only source-backed changes in the window appear; missing feed retains Knowledge link and unavailable explanation, never “nothing changed” |
| F01 | Save helpful/unhelpful rating, refresh, fail next save and retry | Confirmed rating persists to exact Result; failed save never announces success; no memory or policy changes |
| F02 | Correct Work/Result in Sofie | Exact source/revision/evidence context reaches unsent composer; no auto-send and no false durable learning confirmation |
| F03 | Submit L feedback with exact Work/version/target/scope/eventId; repeat event then stale revision | Authenticated source records once, stale binding fails; no implicit conversion from S thumb rating or E advisory draft |
| F04 | Read CANDIDATE, EVALUATING, PROMOTED, REJECTED, SUPERSEDED, ROLLED_BACK; separately E DRAFT_UNVERIFIED | Status/evidence/history explicit; only confirmed promoted and scoped consumer behavior counts as learning; rollback disables learned behavior; advisory draft grants nothing |
| U01 | Run canonical Today → first Work → route → Needs You → Result → proof → feedback → next-day Brief on desktop and 390px | No horizontal overflow, usable controls, keyboard/focus/announcements and loading/error/empty/success states; no new accessibility regressions |
| E01 | Repeat U01 with real owner session, durable database, actual admitted provider, authenticated receipts and protected verification | Save reload/persistence and exact Work/Result/evidence lineage; qualify each DIRECT/MYFACTORY/RELAY path separately, including recovery. Fixture/model-blocked runs cannot satisfy this case |

Integration completion requires agreed canonical endpoint mounts and source versions,
all applicable cases with evidence, and explicit exclusions for unavailable providers.
Live qualification requires E01 plus real delivery/continuation evidence for the claimed
scope. Neither a documentation commit nor adapter-only tests close that gate.

This checklist authorizes no migration, merge, deployment, provider dispatch or
production approval. Those remain backend/integration-owner workstreams.
