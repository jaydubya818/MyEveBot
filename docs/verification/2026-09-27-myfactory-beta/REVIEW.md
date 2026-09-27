# Gate B candidate review and beta integration scope

Reviewed candidate: `be090db93b35c8edb9f38a3cac1344a2289c49bc`. This is a fresh source/evidence audit by the implementation owner as explicitly permitted by the fast-track request; it is not a separate person's approval.

The registered 0056 migration checksum is `dc4a908d6f3abd665824cb249459df850a92ff7c4346fded461a2061ba72b2bc`. All committed Gate B source and evidence hashes match. The migration remains immutable.

Inspected the existing Work-lock/one-open-Run admission, native-session guards, durable UNKNOWN dispatch claim, terminal quiescence requirements, immutable candidate/historical custody, protected verifier lease/recovery and final native agent-binding predicate, native repair, 23 integration checks, seven race pairs, eight SIGKILL boundaries, and actual M1/Gate C evidence. Recorded zero safety violations apply to the bounded synthetic qualification. Documentation correctly says local PASS and live NOT READY/NOT_RUN.

No applied migration correction is required by this review. The local transport contract correctly requires terminal tombstones that reject delayed dispatch; a signed result, elapsed deadline or an absent process alone cannot release authority.

## Gaps to complete for the requested beta mission

1. The synthetic harness preknows producer WorkOrder/attempt identity. Real `fcd8afd` JobManager creates and starts an attempt together. Add prepare/readback before exact dispatch so MyEve durably binds the complete producer snapshot before any execution.
2. Implement the actual authenticated connection transport and durable producer dispatch/stop/recovery using existing storage events, JobManager and Gate C result protocol. Keep the old unqualified divergent producer protocol out of this baseline.
3. Connect a deterministic server-qualified Factory router, durable reconciliation driver and existing Work/Chat/operator surfaces. A model cannot supply provider qualification or remote quiescence.
4. Qualify the connected local journey and independent Q37 publication/Relay/learning contracts. Live credentials/effects remain separate explicit dependencies.

MyEve remains on `codex/digital-worker-integration`. Producer implementation uses isolated `codex/digital-worker-factory` from the qualified `fcd8afd6fbaa2b9045b9e9700608d546edf011a9`; the older divergent MyFactory checkout and producer-attestation owner worktree remain unchanged. Native M1 architecture is frozen; local fallback compatibility remains required. Live execution is not authorized by this local mission.
