# Review correction: retain terminal Factory receipts

Supersedes candidate `065eca2ccdcd047b01ae3cff0b34a87c95947ad2` for the terminal receipt driver path. Current candidate is the commit containing this report. Producer remains `d9564beef41590c3700069ec340d926db23b7ba7`.

The independent read-only reviewer found a valid gap: the driver reconciled terminal quiescence and then returned before reading signed FAILED/CANCELLED results. This safely fenced the writer but omitted the producer's terminal envelope from durable historical Gate C storage.

The driver now reconciles quiescence first, processes the terminal result through the existing authenticated Gate C receive/attest/integrity/admission pipeline, and only then returns the terminal outcome with receipt status. STALE or rejected historical receipts do not enter candidate custody or protected verification. Receipt acceptance cannot grant writer authority or undo the terminal fence. Current successful output still requires ADMITTED status before custody. No migration or protocol change was needed.

## Qualification

- Connected fixture: **12 checks PASS**. Real pinned producer signs both FAILED and CANCELLED results. Each receipt is retained exactly once; a reconstructed driver rereads identical receipt/provenance/envelope bytes. Both writer Runs remain terminal/fenced, candidate workspaces and verification jobs remain zero, readiness remains false. [Exact receipt IDs and envelope hashes](connected.json).
- Gate B: **23 checks PASS**, including concurrency, restart, stale fences and native repair.
- Gate C: **47 checks PASS**, including authentication, rejected/conflicting/stale receipts, replay and historical preservation.
- Application regression: **1554 PASS / 40 environment-gated skips**.
- Typecheck and governance: **PASS, UNKNOWN=0**.
- Webpack production build: **PASS**. Existing Turbopack dependency-symlink limitation remains unchanged.
- Applied migrations/registration changed: **0**. 0056 and 0057 retain their qualified checksums.
- Unrelated governance entries/classifications changed: **0**. Only the actual driver fingerprint changed.

The original [core dossier](../2026-09-27-myfactory-beta/REPORT.md) and [expanded local Q37 dossier](../2026-09-27-q37-local-composition/REPORT.md) remain immutable historical records. Their unaffected qualifications and live limitations still apply. This follow-up records the corrected source and rerun evidence separately.

**Live MyFactory = NOT READY / NOT_RUN.** No live execution, GitHub publication, Relay action, production change or other-worktree write occurred. The corrected committed candidate is returned to the read-only reviewer; independent review is not self-certified.

0056 SHA256: `dc4a908d6f3abd665824cb249459df850a92ff7c4346fded461a2061ba72b2bc`.

0057 SHA256: `787b26a37700c890d0cee38ab47bb2b5e51c24cd70a28568f98d7d009072f057`.
