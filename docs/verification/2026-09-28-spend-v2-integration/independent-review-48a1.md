# Independent read-only successor review

Producer pin: `48a1e3aa8bf40480c1ce9c8042980f3d23860441`.
Reviewed frozen source: `/private/tmp/q37-v2-review-48a1` created from exact git archive.

The three reproduced ad23 defects are corrected: exact-attempt conditional fences no longer mutate a newer generation; restart/terminal resource checks include completion process groups; mandatory productive/completion evidence is scoped to current exact attempt. Independent focused producer run passed 22/22 tests (log `/private/tmp/q37-v2-review-48a1-focused.log`). No additional source defect was established in this successor correction.

Additional independent qualification used `/private/tmp/q37-v2-review-process-qualification.mjs`, with output `/private/tmp/q37-v2-review-process-qualification.json`. Results: 10 IPC-barrier-synchronized races each for final productive and completion slots with zero over-admissions; 10 races each for UNKNOWN/cancel/fence versus reservation with zero post-hold dispatches; real writer SIGKILL after persisted reservation, dispatch, completion reservation and settlement, followed by new ledger connection/recovery, preserved all slots and unresolved liability and did not regress settlement. Both reservation-before-hold and hold-before-reservation interleavings were observed. No provider request was made. All disposable databases and subprocesses were cleaned up.

The committed successor itself contains real subprocess productive-slot racing and real completion-child liveness tests. Its existing ledger process-loss cases still simulate recoverUnknown within one process; the independent script above supplies the missing actual process-crash and synchronized race evidence. Producer owner is adding committed matrix coverage separately.

Historical protocol limitation remains explicit: terminal READ of an older request returns immutable old terminal identity plus current Work-wide ledger header. Its strict MyEve adapter currently requires ledger generation/request equal requested historical identity and will reject that old HTTP read. The producer regression deliberately asserts the newer ledger generation. No current writer is fenced by this read after the fix. Historical custody already retained in MyEve is not altered. Final integration review should determine whether historical HTTP reads are intended to be supported or documented as unavailable through the current adapter.

This is a local correction/process qualification report, not a final committed two-repository integration approval or paid/live authorization. Final producer/consumer pins and latest connected qualification remain pending.
