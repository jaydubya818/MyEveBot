# Source selection and ownership

> 2026-09-29 integration update: accepted Beta `52b3891a2685307cbb50bba97680070700df4cc0` now supplies the integrated components. This source remains unassembled; earlier waiting labels describe this branch, not missing upstream delivery. See [current consolidation crosswalk](CONSOLIDATION-52b3891a.md). Canonical Result/Proof/Golden Journey stay PARTIAL; live providers NOT_RUN.

Remote refs fetched and checked 2026-09-28 (America/Los_Angeles).

| Source | SHA | Decision |
| --- | --- | --- |
| MyEve origin/main | d64f2f96003818b2f51341b54a2edd6f426a0dae | Latest remote-durable compatible product baseline |
| Beta Product Experience | 105aeb75aeb8b01a3bcba09395f32dc1ac0c7c0d | Four source commits reused unchanged; 13 focused tests rerun |
| Expansion checkpoint | cdd7f2cd725eb2b58254a08328c7e34af79ade06 | Pushed; ls-remote equals HEAD |
| Canonical frozen integration | 7f86aca06c2cfd007bd54c1c256bf75fc3aaa5a9 | Local-only; includes canonical execution activation, excluded |
| Observed beta successor | 9ef5a95076add91edd694acdc3b6f8fbbc4f5f2e | Local-only; Factory changes and Capsules excluded |
| Digital Worker | 7bbf296f40ba61031f6e757b0d62929c3c95378d | Protected consumer owner; not imported |
| MyFactory origin/main | 8c5de7794ffa377420ef5dcdbda44aa9fa2328b8 | Reference only |
| MyFactory durable successor | 925530a6ba8764df6a7b8637192fe32edcbaff97 | Producer owner still owns qualification; not imported |
| Relay origin/main | 1da025e4dc234acdc1e6546c4770ccf733611967 | Reference only |

No existing remote branch/tag contained frozen beta integration when inspected. The product baseline therefore starts at durable main and preserves the qualified product-only source via cherry-picks. It deliberately does not import local execution, migration, producer or candidate custody changes. Original source evidence stays historical; it is not new-branch qualification.

Only the expansion worktree is writable for implementation. Protected paths: agent execution/tools, lib/engineering, lib/beta-integration, migrations, database schema, executor inventory, provider verification. No new migration allocation. Other worktree status and source relationships were read only; refs were fetched, no checkout/reset/merge was performed there.

Prepared Capsule source `3331721f6335829a52b0b0d7fd8f7deca402d79d` is present at `origin/codex/portable-sofie-capsules` (ls-remote verified). This is the prepared source, not authorization to import the protected canonical owner’s later local activation.
