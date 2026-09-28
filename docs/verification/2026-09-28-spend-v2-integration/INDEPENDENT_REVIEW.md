# Independent exact-pair review — PASS for local qualification

Reviewed consumer: **`8b55e1924e6f3ed462c331d9e6aa5ea19845de00`**, branch `codex/digital-worker-integration`, `/Users/jaywest/.codex/worktrees/digital-worker-integration/Myeve`.

Reviewed producer: **`efe9e856f8fffbdb785497444a08d39e54d8f78d`**, `/private/tmp/myfactory-spend-producer`.

Both checkouts were clean when inspected. This review covers these exact commits and the consumer delta from `14eff2e24f4a083f6f6f9563f044c3f86e92ed35`. It does not grant paid/live authorization or qualify a future real-provider backend configuration.

## Verdict

**PASS — no actionable findings in the submitted local integration tranche.** The three defects reproduced against `ad23f325` are corrected. Exact-attempt authority fencing protects newer generations from historical reads/stops; every recorded productive and completion process participates in recovery/quiescence checks; historical operations cannot satisfy a new attempt's mandatory productive or completion phase. Historical counters and negative evidence remain preserved.

The V2 consumer accepts the actual producer contract and independently validates accounting arithmetic, operation/phase counts, full reservation equality, protected completion reserve, UNKNOWN exposure, immutable plan fields and historical operation continuity. The PREPARE plan is bound to reviewed configuration and retained before writer admission. UNKNOWN, incomplete accounting, exhausted slots, unavailable completion reserve and stale qualification fail closed before a new paid start. V1 readback remains non-authoritative for paid admission. No second Work/Run/ledger/authority architecture was added.

Client-executed tool search is explicitly distinguished from hosted/unspecified search. Every Responses request surrounding local tool lookup still consumes a metered operation and uses the same reserve/dispatch guards. The installed CLI fixture asserts an actual matching `tool_search_output`, executes the local patch, receives its productive final response, then starts a separate read-only completion child. Predetermined responses and synthetic usage are identified as such; the evidence does not claim model quality or commercial settlement.

## Independent checks performed

- Read the final consumer runtime/test-helper/dry-run changes and final producer client-search correction, plus the producer's exact-attempt/process recovery corrections.
- Independently reran final consumer spend/beta tests at the reviewed commit using the native config loader and disabled cache: **44/44 PASS**. Log: `/private/tmp/q37-v2-final-consumer-focused.log`.
- Independently reran final producer gateway/review/ledger/process-matrix tests at `efe9e856`: **29/29 PASS**. Log: `/private/tmp/q37-v2-review-efe9-focused.log`.
- Earlier independent process qualification against the unchanged corrected ledger used **50 synchronized subprocess races and four actual SIGKILL checkpoints**, preserving exposure/slots with zero post-hold dispatches. The final producer also contains committed IPC/SIGKILL coverage; it was included in the 29-test final run.
- Verified all **10 qualified consumer source hashes** match committed bytes and all **71 protected migration/evidence hashes** match the lineage dossier.
- Compared migrations **0001–0055** directly with canonical `7bf276493eb2b3206a50eea0c4c9c262b7396014`: zero differences. The current tranche changes no migration 0001–0057 or preserved V1 preflight file. Migration 0056 remains `dc4a908d6f3abd665824cb249459df850a92ff7c4346fded461a2061ba72b2bc`; 0057 remains `787b26a37700c890d0cee38ab47bb2b5e51c24cd70a28568f98d7d009072f057`.
- Compared governance inventory against consumer base: exactly five owned `sha256` field updates, no entry additions/removals/reclassification/reason changes, and zero unrelated entry changes. Included governance output reports **659 classified / UNKNOWN=0**.
- Independently computed producer source identity: `e22a763392777c6f2e2c7ed5d78ddd028e0572cb36c28f5f8a0da83c4d6f9f03`, matching final connected evidence. Recomputed configuration digest and FactoryVersion from that evidence: both match.

## Exact-pair connected evidence reviewed

`docs/verification/2026-09-28-spend-v2-integration/efe9-envelope-dry-run.json` records **16 passing checks**, **three actual client search outputs**, **three separate completion executions**, and **13 aggregate scripted provider calls across separate test Works**. Each completed Work uses **three productive operations plus one completion operation**. The success case uses the producer Docker verifier and MyEve's protected independent verifier; deliberate producer false-PASS behavior is confined to negative independent-verifier cases. Factory-to-native repair, lost dispatch responses, STOP/fencing, UNKNOWN retention and replay are represented in the connected/local gate evidence.

The exact envelope evidence binds FactoryVersion **`cfb1521974b00b6e06370fb8050db499859ca1a03b91cd3b9e88663a8439cfa1`**, configuration digest **`231825a383ba4a74fdbe8803cca3a1089b2a25d701ac58d0ec81391c43cd3b69`**, model `gpt-5.4-mini-2026-03-17`, full 400,000-token input reservation, 8,192-token output cap, **336,864 microUSD per operation**, one protected completion slot/reserve, **four maximum operations**, and **1,350,000 microUSD Work ceiling**. The complete plan requires 1,347,456 microUSD and fits with 2,544 microUSD margin. Aggregate fixture calls do not extend the single-Work limit.

Reviewed included logs substantiate application/M1 **1,586 PASS / 40 gated skips**, root/security **151 PASS**, Gate B **23 PASS**, Gate C **47 PASS**, producer **133 PASS / one opt-in skip**, typecheck, 57-migration validation, governance and webpack production build. This review inspected that full evidence and reran the focused checks above; it did not independently rerun every full-suite or Docker journey. The existing Turbopack symlink limitation remains documented. Raw captured logs were not normalized or modified.

## Limits and remaining dependency

**Real provider qualification: PENDING. Live MyFactory: NOT_RUN / NOT READY.** The producer's connected mode defaults to DISABLED and currently permits only injected loopback LOCAL_SPEND_FIXTURE execution. A standalone HTTPS-capable gateway is not an installed real connected backend. The dedicated project/service identity, approved gateway-only secret reference and producer-owned real backend configuration remain required. A credential alone must not enable or relabel the fixture path. No credential, paid call, external publication, merge or deployment was used during this review.

The documented historical-read limitation remains: after a later Work generation exists, a historical producer request returns its old terminal identity alongside current Work-wide accounting; the strict consumer adapter rejects that mismatched historical HTTP read. This fails closed and does not change current authority or erase immutable custody already retained in MyEve. It is not a claimed historical HTTP replay capability of this bounded single-attempt profile.

Results correctly remain PARTIAL, and local GitHub/CI/Relay/learning evidence is not represented as external production completion. The exact-pair local review is complete. A documentation-only follow-up may record this review and its inspected pins without changing reviewed runtime bytes; any runtime/protocol or real-provider configuration change needs its own affected qualification.
