# Product / Pluto final Consolidation handoff

**Handoff: READY. Product source candidate only; assembled private-alpha readiness remains PARTIAL.** Feature scope is frozen. After commit, push and exact remote verification, this workstream is read-only unless Consolidation reports a concrete compatibility defect. No merge, deployment, cloud admission, paid operation, publication or production schema activation is authorized by this package.

## Source and adoption

| Pin | Exact value |
| --- | --- |
| Product branch | `codex/agent-native-work-experience` |
| Starting MyEve canonical main | `2b22e387c053ba0631efc27c2e8f8a99fff1055e` |
| Fetched and remotely verified canonical main / adoption base | `d75091eb333a531fa91ed9d39e273948aa9d0eaf` |
| Accepted functional checkpoint | `a1cbd0c77ce3150f4730a7f81a0d0145077fe130` |
| Accepted visual checkpoint / final implementation | `d3e4af20c51e6f5e9b1205d83e51e362f523af5b` |
| Final Product package SHA | The commit containing this package, reported exactly with its remote verification in the final handoff message. Resolve with `git log -1 --format=%H -- docs/product/consolidation-handoff/adoption-manifest.json`. |
| Starting Relay main | `a61f0ef697b02cf22da72ff2904c584d7faa026a` |
| Starting MyFactory main | `c0b4c1155a6a98f91375163443938042e6a0be10` |

The visual checkpoint contains the functional checkpoint. No reconciliation changes were required. Main is already an ancestor, incorporated by the previously accepted merge `ac56e5a6397a707c41a6882ac7752523a870aa49`; this handoff does not merge it again. Relay/MyFactory pins above are retained source baselines, not new remote attestations in this documentation-only handoff.

The [semantic adoption manifest](adoption-manifest.json) enumerates every implementation path by adoption unit and its intent. The [complete changed-path inventory](changed-paths.tsv) contains the Product delta against adoption-base main plus every documentation file in this final package. Accepted source blobs have Git object IDs; handoff documents are identified by their containing commit to avoid self-referential hashes. The [initial-baseline inventory](initial-baseline-changes.tsv) lists the full net initial-main→accepted-implementation delta. The [canonical carry inventory](canonical-carry.tsv) identifies initial-main→adoption-base changes that belong to canonical history, not this Product implementation. Some paths occur in both canonical carry and Product deltas; preserve both semantics. The full final initial-baseline inventory is the initial-baseline list plus the handoff paths in the manifest.

Adopt semantically against Consolidation's current source. In particular, retain canonical publication/custody/verification behavior and source association while taking the Product presentation and lifecycle changes. Evidence/history files are not runtime changes. No unfinished Fabric/cloud implementation is imported. Capsules keep existing canonical contracts; this package contains no replacement implementation or new Capsules qualification.

## Qualified scope and explicit limits

| Capability | Status | Qualification boundary |
| --- | --- | --- |
| Unified Work Thread | PARTIAL | Retained controlled Work→Current Truth→Result/Proof→exact decision→same conversation passes. Natural productive browser E2E remains NOT_RUN. |
| Work Inbox | PASS | Deterministic canonical engineering scope; Needs You, Working, Monitoring, Completed and truthful Waiting; completion independent of conversation archival. |
| Persistent Agents | PASS profile/home; productive autonomy PARTIAL | Owner-approved profile lifecycle, appearance, zero-grant copies, policy display, owned Work/Routines/history and truthful status. Agent ≠ Environment ≠ Harness. |
| Routine deterministic lifecycle | PASS | Controlled natural SDK proposal, explicit harness approval, existing persistence/scheduler, same-trigger exactly-one occurrence, Result, last/next, conditional notification, pause/reviewed resume/stop. |
| Routine recovery | PASS | Deterministic new store/worker identity, expired-claim recovery and stale-completion fencing. Physical shutdown and CLOUD recovery not tested. |
| Today/Inbox | PASS | Implemented deterministic Work/responsibility scope, canonical non-Work owner attention and unavailable/reconnect states. Recently completed does not invent an owner absence interval. |
| Rooms/Groups | PARTIAL | Bounded domain/repository and sample UI; proposed SQL only in isolated PostgreSQL. No production membership API or activated shared schema. |
| Relay Group coordination | PARTIAL | Canonical Relay schema/correlation contracts with distinct fixture identities; no new live Group round-trip. |
| Designer→Engineer→Reviewer→Sofie | PASS deterministic domain; live NOT_RUN | Canonical references, artifacts, correlated handoffs and synthesis/Needs You; four fixture identities, not real productive agents. |
| Natural browser→productive Work→Result | NOT_RUN | WAITING_FOR_CANONICAL_STAGING_COMPOSITION. |
| Cloud/background execution | NOT_RUN | Six real CLOUD gates below. Infrastructure readiness is not productive execution evidence. |
| General Routine release | DISABLED | `apps/eve/lib/routine-release.ts`: `ROUTINE_RELEASE.enabled=false`, `MUST_REMAIN_DISABLED`. |

The earlier blanket `WAITING_FOR_CANONICAL_Q37` label is STALE. Historical evidence retains historical labels; the current dependencies are specific. Combined natural browser Routine creation/trigger, full productive Group delegation, full email/research/proactive natural journeys, distinct-trigger coalescing/non-overlap, expiry/max-run limits, productive specialist autonomy and real peers remain incomplete or unqualified. Same-trigger deduplication is not a claim of cross-trigger serialization. The fourth canonical publication choice is **Reject candidate**, not a newly implemented “Ask for changes” execution path; follow-up stays in the conversation. No historical independent-review FAIL becomes PASS because the Product UI is qualified.

## Exact staging consumer contract

**WAITING_FOR_CANONICAL_STAGING_COMPOSITION** is the remaining dependency for `natural browser → productive Work → Result`. The execution owner confirmed that its dedicated Sofie qualification runtime exposes a fixed authenticated diagnostic and denies model resolution; it does not yet qualify this natural path. Missing composition is hosted canonical engineering/Factory configuration and source loading, router admission, the existing Codex harness through a metered deterministic model boundary, custody into FactoryWorkDriver, independent verification, durable Result/Proof, and the authenticated Eve browser/tool path. Product must consume that composition, not build another executor or fabricate browser events.

The composed runtime must satisfy the following existing consumer contracts:

1. Authenticate the owner and preserve the actual agent, session and conversation origin. The existing authoring/tool path retains canonical Work. `readWorkThread` authorizes `web_chat_threads.owner_id` and joins `context_assemblies` to `agent_runs` on owner/agent/session/thread, then owner-scoped personal `engineering_work` via the retained `engineering-work:<id>` source reference. Model prose, pasted Work IDs and forked transcripts are not association authority.
2. Serve `GET /api/work-thread?threadId=…&offset=…` with owner authentication and `cache-control: no-store`. Existing response: `{works: [{projection, admission, continuations, associatedAt}], nextOffset}`. Each entry uses `CanonicalBetaWork.projection`; ten results per page. Preserve `projection.workId`, `workVersion`, `workGeneration`, `status`, `activity`, `nextStep`, `lifecycle`, `control`, `attention`, `latestResult`, `nativeResult`, verification and source references. Admission includes `status`, `reason`, `work_version`, `work_generation`, `current`; a stale admission is not current authority. Types remain canonical imports, not a duplicated Product schema.
3. Return the current exact Result/Proof, candidate and verified tree through the existing projection and `OwnerPublication.view`. `GET /api/beta/owner-decision?workId=…` supplies the binding and authoritative readback. `POST /api/beta/owner-decision` uses `{workId, bindingHash, previousId, action, confirmed:true}` with existing `open_pr`, `push_branch`, `keep_private`, `reject` semantics and server idempotency/stale-binding rejection. No Product publication backend, merge or acceptance authority is added.
4. Preserve the same owner/agent/conversation and, when applicable, reviewed Routine version and occurrence origin across dispatch, retries and completion. An occurrence must reconcile to the same canonical Work/request. Return Result and delivery through canonical stores; quiet checks remain history under existing notification policy. Missing Routine→Work/origin integration belongs to canonical execution composition, not a Product queue.
5. Expose a canonical admitted environment binding and observed lifecycle when available. ONLINE, SELECTED, BOUND, profile capability, session availability and readback fixtures cannot alone mean Working in cloud. Until a consumable registry/binding projection exists, retain unavailable/Waiting status. Waiting for Mac and Waiting for cloud must follow canonical reasons; never silently fall back to local execution.
6. Cancellation/recovery remains pending until authoritative terminal/current-generation readback. Polling/reconnect cannot dispatch, approve or retry Work. Stale Results/claims cannot enable a new decision. Preserve same-conversation continuation using the existing composer.

Consumer entry points are `apps/eve/lib/product/work-thread.ts`, `work-state.ts`, `work-inbox.ts`, `agent-home.ts`, `responsibilities.ts`; their `/api/work-thread`, `/api/work-inbox?offset=…`, `/api/agents/[id]/home`, `/api/responsibilities` routes; and the existing canonical projection/publication services. P0 hooks are region **Work in this conversation**, `data-thread-id`, `data-work-id`, `data-result-id`, `data-work-inbox`, `data-live-agent-card`, `data-responsibilities=today|inbox`, **Proof of Work / Advanced**, **Needs You — owner decision**, **Review decision**, **Confirm decision**.

After assembly, qualify real authenticated browser natural input through admission and a controlled provider behind the canonical model boundary to new Work and Result in the same conversation, then all read/decision/reconnect/isolation regressions at desktop and 390px. Controlled SDK authoring and retained-Result browser tests are separate existing slices, not proof of that combined path. Keep deterministic, connected and live evidence separate.

## Fabric, Relay and MyFactory dependencies

| Owner / dependency | Required integration; no duplicated authority |
| --- | --- |
| Environment Fabric — WAITING_FOR_CANONICAL_ENVIRONMENT_FABRIC | Consume MyFactory `packages/contracts/src/environment.ts` / `@factory/contracts/environment` after canonical distribution. `environmentSummary` is safe metadata, not execution qualification. Supervisor `apps/supervisor/src/environment-router.ts` owns WorkRequirements, EnvironmentAuthority, EnvironmentQualification and EnvironmentBinding; it is not a browser API. Authenticated registry/read projection, admitted binding and origin linkage still need integration. |
| Cloud — WAITING_FOR_CLOUD_EXECUTION_QUALIFICATION | CloudPrepareRequest / `MYFACTORY_EXECUTION_V2` in `packages/contracts/src/cloud-execution.ts` uses exact repository/commit/tree, request, Work/generation, deadline and spend. Software production is not a generic research/email Routine contract; do not create synthetic repository Work. |
| MyFactory | Preserve governed production, writer authority, candidate custody, independent verification orchestration and exact Result/Proof inputs. MyEve `apps/eve/lib/engineering/factory-transport.ts` owns backend transport/auth; no browser credentials or alternate provider dispatch. |
| Relay — WAITING_FOR_DISTINCT_RELAY_IDENTITIES | Reuse canonical peerMessageDraft/envelopeSchema/projectPeerMessageResult, correlation and grants at send/receive. Existing `myeve_relay_connections` is one local identity/credential per owner, insufficient for independently registered Group members. Do not impersonate all members as Sofie or create another messaging plane. |
| Groups — WAITING_FOR_GROUP_SCHEMA_INTEGRATION | Accept and allocate the bounded Group aggregate/audit under shared-schema ownership, then connect production persistence/API/reference authorization and real member identity mapping. Product does not activate it in this handoff. |

Inspected dependency checkpoints (not imported): Fabric MyFactory `fc8c26f4fb8190d938247a855b2bc7711bf3c677`; Cloud MyFactory `faf93359a4c54daaf3e0b713a601366db02ba8d6`; later inspected Fabric MyEve `d156f07fc62f5519beb2c481679b8a0902bbf79c`; Cloud MyEve `a7e63c3a4c061f24059ac1c597893a6cc0ba30dc`. These are evidence pins, not assertions that independently advancing branches are still at those SHAs. See the [received Fabric handoff](../../verification/agent-native-work/environment-fabric-owner-handoff.md), [consumer crosswalk](../environment-fabric-product-contract.md) and [dependency audit](../current-product-dependencies.md). HEADLESS requires no session provider; TMUX/CMUX observation grants no execution authority; `session.browser` is not agent browser capability.

Existing Alpha transport and evidence are preserved, not promoted into a new Group qualification. Actual distinct-agent Group delivery/synthesis, second independently deployed MyEve, Muse and GrokBots remain NOT_RUN. External peers use generic Relay federation once real identity/endpoint/auth/owner scope exists.

The six real CLOUD gates are all **NOT_RUN**: natural Work; Routine; browser-off Routine; Mac-off Routine; Result/Proof return; cancellation/recovery. Only qualified owner-provided implementation and evidence can close them. General Routine release remains disabled even if deterministic UI or routing tests pass.

## Migration and integration impact

**Zero numbered/runtime migrations added or modified by the Product delta. Zero production Group schema allocations or activations.** Agent Look reuses existing `avatar_config` JSON. Existing agents, Work, Routine, occurrence, reminder, delivery and Relay stores are reused.

The exact unallocated proposal is [agent-groups.sql](../schema-proposals/agent-groups.sql), with its [integration rationale](../schema-proposals/agent-groups.md): `agent_groups(owner_id,id,version,document)` has owner/id primary key, positive version, a JSON object below 65,536 bytes and matching owner/id/version checks; `agent_group_audit(owner_id,group_id,version,event,created_at)` has owner/group/version primary key and Group foreign key. Domain rules bound membership to 2–12 with one coordinator and retained references/handoffs to 100. CAS and audit are qualified only in task-owned isolated PostgreSQL. Canonical content, Memory, Work, Results, capabilities and Relay transport remain separate. The production repository/API is not activated. No shared migration number is reserved here.

Routine distinct-trigger overlap/coalescing and cross-device owner last-seen semantics remain shared integration/schema proposals. Do not claim “completed while away” from an invented cursor or activate the Group proposal to finish adoption.

**Known Git conflicts with pinned current main: none.** Main is an ancestor and has zero main-only commits. This is an ancestry check against `d75091e`, not a merge rehearsal with unpublished candidates. Semantic reconciliation hotspots after assembly are: canonical publication projection/readback and embedded decision UI; Current Truth status derivation; owner scope and context-origin joins; existing Routine execution-store/types, admission/review, runner and reminder invalidation; agent policy/profile updates; shared owner navigation/Today; registry inventory; environment/origin projections; and proposed Group identity/schema. No Product delta touches `apps/eve/lib/engineering/` or `apps/eve/lib/beta-integration/`; existing Routine helper edits are explicitly inventoried and must not be overlooked as “UI-only.” Re-evaluate conflicts against any later canonical SHA. Preserve failed independent-review evidence and never infer owner acceptance from CI success.

## Qualification and requalification

All new Product evidence is **DETERMINISTIC**. Local real PostgreSQL/authenticated routes do not make it CONNECTED external-peer or LIVE qualification. The accepted implementation is unchanged by this documentation-only final package; application suites were not rerun merely to produce this handoff.

| Evidence | Result / scope | Reference |
| --- | --- | --- |
| Final application unit suite | 1,997 pass; 94 environment-gated skipped, not counted as pass | [log](../../verification/agent-native-work/visual-ia-unit.log) |
| Type/registry/governance | PASS; 760 classified; UNKNOWN=0; release disabled | [log](../../verification/agent-native-work/visual-ia-typecheck.log) |
| Production build | PASS | [log](../../verification/agent-native-work/visual-ia-build.log) |
| Functional PostgreSQL checkpoint | 113 checks across six scripts: authoring 19, Groups 25, Routine journey 18, conditions 27, Inbox 12, agent home 12 | [report](../../verification/agent-native-work/product-continuation.md) |
| Final visual/profile PostgreSQL checks | Authoring 22 and agent home 15; overlapping updated scopes, do not add to 113 as unique checks | [authoring](../../verification/agent-native-work/visual-ia-authoring.log), [home](../../verification/agent-native-work/visual-ia-agent-home.log) |
| P0 Playwright | 50 passed in one final full run, including 12 visual and two navigation/owner-attention cases; full natural productive mission PARTIAL | [authoritative final log](../../verification/agent-native-work/visual-ia-full-playwright.log) |
| Visual regression | 32 light/dark × desktop/390px × eight surface baselines; compared in normal mode, 0.5% pixel tolerance | [qualification and linked screenshots](../../verification/agent-native-work/visual-ia-qualification.md), [SHA-256 inventory](visual-baselines.tsv) |
| Desktop / 390px | PASS implemented deterministic scope at 1440×1000 and 390×844; collapsed mobile navigation, no horizontal overflow | Final browser/visual evidence above |
| Accessibility | PASS scoped automated WCAG 2 A/AA and 2.1 AA axe and tested keyboard flows; not full manual certification | `apps/eve/test/agent-native/visual-ia.spec.ts` and existing P0 specs |

The eight visual surfaces are Today, Live Agent Card, agent home/profile, specialist creation, Room, Room Needs You, explicitly fixture Routine Monitoring, and inline Work/Result/Needs You. Room and Routine layout fixtures do not prove real Group or released Routine behavior. Agent-list/chat bootstrap is controlled; browser save-failure is controlled and real appearance persistence is separately tested. Representative images received visual inspection.

**These are assembly baselines requiring requalification, not an obligation to adopt obsolete screenshots.** Consolidation should compare against them, review intentional UI changes, regenerate affected baselines only after review, then run normal comparison plus accessibility/interaction checks on the assembled runtime. Keep the old evidence pinned to its source; do not relabel it as new assembly evidence. Earlier non-baseline screenshots and JSON reports are historical; the final 50-case log above is authoritative for this accepted checkpoint.

Harness requirements: reviewed local canonical engineering configuration and captured publication fixtures, task-owned disposable PostgreSQL on loopback port 55509/database `myeve_beta_publication`, production preview on localhost:3198 and the controlled worker. This is not a clean-clone standalone suite. Reuse `apps/eve/test/publication/harness.mjs`, its controlled worker and `test/agent-native/seed-responsibilities.mjs`; inspect test setup before running. From `apps/eve`, use `npx playwright test -c test/agent-native/playwright.config.ts --reporter=list` with `MYEVE_PUBLICATION_TEST_DATABASE` and `MYEVE_ENGINEERING_CONFIG` pointing to that approved local fixture setup. PostgreSQL integration scripts also use `MYEVE_PRODUCT_TEST_DATABASE`. Never fall back to paid/live providers because fixtures are missing. General release stays false.

Run `python3 docs/product/consolidation-handoff/verify.py` to validate package inventories, source ancestry, visual hashes, release gate and documentation-only final delta. This verifies handoff integrity; it does not rerun Product E2E. The final remote receipt is obtained by comparing local HEAD to `git ls-remote origin refs/heads/codex/agent-native-work-experience` after push.

Consolidation owns assembly and its resulting qualification. Product is now a frozen, reviewable source candidate and will remain read-only except for a concrete compatibility defect reported by Consolidation.
