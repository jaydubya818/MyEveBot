# Canonical beta integration — Phase 2

**Overall: PARTIAL. Canonical local context/admission/Result contracts are qualified; authenticated execution mounting is blocked pending approval. This is not a live beta release.**

Branch: `codex/myeve-beta-integration`
Worktree: `/Users/jaywest/.codex/worktrees/myeve-beta-integration/Myeve`
Phase 1 input: `deab11efdbefe7356a1d3146493070aca532945c`
Candidate SHA: the commit containing this dossier; the final report gives the literal SHA. No self-referential commit hash is embedded.

This is the sole current integration dossier. [Phase 1](phase1-report.md) and the four source dossiers remain historical qualification. Phase 1 fixture completion does not establish Phase 2 canonical completion.

## Frozen inputs

| Input | Exact SHA | Treatment |
| --- | --- | --- |
| Canonical shared Digital Worker | `b15905f273b7a1c62f1a840de92ab6caa78f21dd` | Adopt shared Work/admission/model/context/candidate/verification/Result infrastructure and canonical 0001–0057 migrations |
| Published main | `d64f2f96003818b2f51341b54a2edd6f426a0dae` | Preserve unrelated baseline behavior; no main merge |
| Beta experience | `105aeb75aeb8b01a3bcba09395f32dc1ac0c7c0d` | Persisted UX retained and extended |
| Total Recall + Learning | `b5b3179e8f7ec61d9a30eb7c24e8bce760bfdcdf` | Bounded scoped retrieval, provenance/correction and governed learning retained |
| Universal Inbox | `cf199431588d7bc0e95dd24a7d06b63d3b3cd2bb` | Durable owner/action/response contracts retained |
| Goals + Proactive Work | `838af27722a500e4e02ae980d71e7541e5575f54` | Goal/Task state, canonical Work/Result adapter and dependency adapters retained |
| Final Capsules | PENDING | Boundary prepared; no import or activation |
| Spend-qualified Q37/MyFactory | PENDING | Boundary prepared; no dispatch or activation |

The initial audit selected 39874790. Final read-only audit found its newer locally qualified successor b15905f, committed during this run. Its shared Current Truth projections and spend validator are adopted; its Factory transport/dispatch remain unactivated. Migration bytes are unchanged. [Latest source audit and upstream evidence](phase2/latest-canonical-source/adoption.json). The large file count is the selected canonical shared-infrastructure dependency closure plus its regression fixtures, not a parallel implementation. [Per-file source adoption](phase2/source-adoption.json), [governance review](phase2/governance-adoption.json), [component boundaries](phase2/component-boundaries.md).

## Migration reconciliation

**PASS locally:** canonical 0001–0057 are byte-identical to the frozen shared input. Reserved old beta numbers 0058–0061 are absent from the active chain. The chain has 62 files and ends at 0066:

| New number | Content |
| --- | --- |
| 0062 | Published Relay delegations; exact former published 0040 DDL |
| 0063 | Beta product-plane schema; duplicate canonical Work/Knowledge/Result prerequisites removed |
| 0064 | Exact former beta 0059 completion fencing |
| 0065 | Exact former beta 0061 Result supersession fencing |
| 0066 | Additive admission-attempt, retained decision, continuation and source-receipt tables; PUBLIC privileges revoked |

Former beta 0060 is superseded by exact canonical 0041. Old files and the applied Phase 1 ledger are preserved under [phase1-migrations](phase2/phase1-migrations) and [phase1-local-ledger.json](phase2/phase1-local-ledger.json). The original disposable `myeve_beta_qualification` database was not rewritten. Its incompatible ledger is rejected before mutation. Fresh databases and upgrades from canonical 0057 passed, including unchanged prefix timestamps/checksums and no-op replay.

[Exact reconciliation table and checksums](phase2/migration-reconciliation.json), [allocation audit](phase2/allocation.json), [migration test result](phase2/migration-tests.json). No production/deployment ledger was inspected or changed; this is not authorization to apply the rebased chain to an unknown database.

## Qualified behavior

- Goal→Task creates one paused canonical Work under concurrency. Goal state grants no execution authority. Missing provider/configuration denies admission with zero provider dispatch.
- `CanonicalBetaWork.admit` requires exact owner/version/generation, current canonical route assessment and a retained current budgeted admission conversation. The canonical admission contract is used unchanged.
- `MYEVE_WORK_RECALL_ENABLED=true` adds at most eight items / 6,000 characters of data-only Recall to the real canonical conversation/native model wrappers before input-size and budget checks. Controlled provider input included corrected Friday, excluded superseded Monday and another Work's private Sunday fact, and retained provenance. No phase override or fake budget was used.
- A reused model-step reference with changed Recall content is denied before dispatch, preserving the original attribution receipt; a fresh step uses the correction. [Replay check](phase2/recall-replay.json).
- **PRODUCTION CONTEXT PATH: PASS. LIVE MODEL: NOT_RUN.** The provider and pricing fixture is controlled; recorded fixture usage is not live spend qualification.
- Canonical DirectDevelopmentStore custody, DirectVerificationDriver and NativeResultStore produced an immutable candidate/evidence-bound Result. Verification artifacts explicitly identify the controlled local fixture. The Result is **PARTIAL** even when local checks pass; Task/Goal completion and Ready remain withheld.
- The unmounted retained Work-response consumer passed duplicate and stale-generation tests. It records eligibility only; Work control, route admission and writer authority do not change.
- The existing operations monitor now invokes the local bounded GoalScheduleAdapter sweep. Six concurrent due wakes produced one paused Work; future dependencies stayed blocked. External event ingestion remains unmounted.
- Today and Daily Brief read persisted Goals/Tasks, active Work, decisions, Results and Memory/learning changes. Proof exposes candidate, evidence references, artifact references, digest, canonical route and limitations. Controlled verification is labeled. No external-source events are fabricated.
- Result feedback creates a candidate; evaluation/promotion remain explicit. Promoted repository learning was consumed in later comparable Work through the same canonical model wrapper after real process loss. Work-only learning remains scoped.

[Canonical controlled journey](phase2/canonical-journey.json), [scheduler](phase2/scheduler.json). The complete requested Golden Journey remains **PARTIAL**: canonical local Result semantics deliberately prevent the requested completed-Goal ending, and the active Work admission/continuation UI remains unmounted pending review. [Phase 1 fixture replay](phase2/golden.json) is regression evidence only.

## Verification

Local PostgreSQL 17 ran on loopback 55489 with `myeve_beta_phase2` and temporary qualification databases. No deployment DATABASE_URL, paid model, hosted provider, GitHub publication, Factory or Capsule was used. Goal/Inbox runtime transactions retain restricted database roles.

- Application and root tests, TypeScript/capability/skill/executor governance and production build: see [final checks](phase2/final-checks.json).
- Fresh chain, canonical 0057 upgrade, no-op replay and incompatible Phase 1 ledger rejection: PASS.
- Canonical context/admission/Result/learning and continuation fixture: PASS within the stated controlled scope.
- Goal PostgreSQL suite: 19 checks, including seven process-loss checkpoints and concurrent schedule/manual continuation.
- Memory/Learning and Recall integration PostgreSQL suites: [results](phase2/regressions/recall).
- Inbox PostgreSQL suite: [11 checks](phase2/regressions/inbox/postgres.json), including RLS, 16 concurrent source replays and 16 owner-response retries.
- Integrated recovery: [eight SIGKILL checkpoints](phase2/recovery.json) across Memory, Goal, Work, Inbox, answer, delivery, Result and promotion, plus fresh-process canonical learning reuse.
- [Adversarial checks](phase2/adversarial.json): cancellation/Result and supersession/ingestion races, owner boundaries and unretained-signal denial.
- [Authenticated UI](phase2/browser-journey.json), including [final-build server restart](phase2/browser-final-restart.json): signed login, Goal/Task/paused Work creation, retained Goal decision response, canonical Proof, feedback candidate, evaluation and explicit promotion. Admission/provider execution and canonical Work-response UI are not claimed as covered.
- [Desktop/390px audit](phase2/browser-audit.json): 18 scans, zero axe WCAG A/AA violations, no horizontal overflow and no unavailable sections. [390px canonical Proof screenshot](../../../output/playwright/beta-integration/phase2/390-3.png) and [desktop Today screenshot](../../../output/playwright/beta-integration/phase2/1440-0.png). [Fault-state checks](phase2/browser-states.json) cover outage, session loss, late private response exclusion and recovery.

Observed safety counts remain zero: duplicate Work, false Task/Goal completion, Memory/Learning/Inbox/Goal-derived authority expansion, cross-owner disclosure, stale-response continuation, false Ready and avoidable product coordination debt. Counts are local measurements, not claims about unrun production paths.

## Remaining gates and stop reason

Automatic approval review rejected active tool registration and Work control/admission/continuation/event mounting because they affect available tools and execution eligibility. The precise two-tool and owner-endpoint scope has been presented for approval; no reply was received during qualification. The safer alternative keeps both imported tools disabled in registry metadata **and in their dynamic resolvers**. Primary-owner dogfood denial is tested. The unmounted adapters are concrete and reviewable.

Approval is required to finish that rejected wiring. It does not authorize live spend, publication, deployment, Factory or Capsules. See [exact seams and remaining actions](phase2/component-boundaries.md). All independent local work described above is completed. The task-owned browser, app listener and PostgreSQL server were stopped; qualification databases and evidence were preserved. Final frozen Capsule and spend-qualified Q37 SHAs remain separately pending.

## Reproduction

From `apps/eve`, with the task-owned disposable PostgreSQL cluster on 55489:

```sh
node --import tsx test/beta-integration/qualification.mjs
node --import tsx test/beta-integration/canonical-journey.mjs
node --import tsx test/beta-integration/migrations.mjs
node --import tsx test/beta-integration/recovery.mjs
node --import tsx test/beta-integration/adversarial.mjs
npm test
npm run typecheck
npm run build
```

`scheduler.mjs` additionally expects the named browser Goal created through the UI. Browser qualification uses the production build on localhost:3099 with `MYEVE_BETA_MODE=qualification`, `MYEVE_BETA_DATABASE_URL=postgresql://postgres@127.0.0.1:55489/myeve_beta_phase2`, and temporary local owner/password/session-secret values. The beta gate rejects production Vercel, non-loopback and non-qualification database names. No merge, push or deployment is part of this candidate.
