Superseded by [V2 integration](../2026-09-28-spend-v2-integration/REPORT.md) after producer ownership was resolved. This preparation record retains the state observed before V2 handoff.

# Spend safety consumer preparation — producer ownership conflict

This is an **uncommitted consumer preparation checkpoint**, not a qualified V2 integration or a live envelope. Consumer base: `14eff2e24f4a083f6f6f9563f044c3f86e92ed35`. MyFactory remains unchanged at local candidate `8f5e3774129b5f9f4b1c9655ffbbb531cd20fa0f`; canonical producer remains d9564be. No paid call occurred.

## Ownership conflict

The sole producer task initially confirmed ownership and proposed WORK_LEDGER_V2. It subsequently reported: “Latest direct user instruction freezes MyFactory producer at 8f5e3774129b5f9f4b1c9655ffbbb531cd20fa0f and says STOP.” It explicitly confirmed it had implemented no V2 code. A question is pending with the user to resume that owner or transfer producer implementation ownership. This task did not edit the producer or treat proposed fields as an implemented contract.

## Prepared consumer changes

- Preserve V1 read/STOP interpretation, deny new paid starts without reviewed V2.
- Carry a backend-reviewed complete productive/completion operation plan in PREPARE; no model or public action chooses it.
- Independently validate exact plan arithmetic, protected completion dollars/slots, operation counts, immutable history and UNKNOWN exposure.
- Reject unavailable pricing/accounting/authority, exhausted operations or lost completion capacity before writer admission and START.
- Expose protected completion reserve and paid-operation limits through existing Current Truth.
- Confirm an absent native provider qualification prevents separately paid Work-bound Sofie/native model calls before pricing lookup, reservation or provider access.

The V2 READ field names and authority/phase enums remain **provisional until the producer implementation exists**. Unit fixtures validate the intended consumer behavior only. No integration PASS is claimed for that proposed wire format. No new consumer ledger or migration was introduced. Four changed Q37 executor fingerprints were refreshed; all unrelated inventory bytes and old negative evidence remain unchanged.

## Checks completed

| Check | Result / scope |
| --- | --- |
| Application / M1 | 1,583 PASS / 40 environment-gated skips; includes task-owned PostgreSQL admission checks |
| Root/security | 151 PASS |
| TypeScript / capability / routing | PASS |
| Governance | PASS; 659 classified, UNKNOWN=0 |
| Migration validation | PASS; 57 files, unchanged |
| Gate B | 23 PASS; PostgreSQL concurrency/restart and protected Docker verification |
| Gate C | 47 PASS; receipt lineage/concurrency/restart |
| Canonical connected journey | 14 PASS; unchanged d956 zero-cost fixture, real local transport/SQLite/Git/signatures/PostgreSQL/Docker |
| Webpack production build | PASS |
| Corrected producer spend / V2 connected journey | NOT_RUN — producer implementation absent |
| Independent review | NOT_RUN |
| Replacement live-envelope dry run | NOT_RUN |
| Real provider / Live MyFactory | NOT_RUN |

The canonical connected journey still covers Factory candidate custody, independent verification, new native repair, and synthetic GitHub/CI/review/Relay/learning continuation. It is not V2 spend qualification. The existing Turbopack dependency-symlink limitation remains documented; dependency layout was not modified.

## Resume procedure

Resolve producer ownership first. Obtain the exact implemented V2 source and contract, adapt this prepared parser/tests to those bytes, then run the old defect scenarios against the corrected ledger/gateway, including real concurrent and process-loss tests. Exercise actual connected productive-to-completion orchestration. Requalify affected consumer journeys, commit complete producer/consumer candidates, obtain independent read-only review, and only then calculate and dry-run a new envelope. Do not reuse the prior $1.90 example as authority.

No corrected safety counter or ready status is inferred from the passing consumer mocks. Existing bounded canonical writer/dispatch/authority/false-Ready counters remain zero. Old failing evidence at `2026-09-27-real-provider-preflight` remains byte-for-byte unchanged.
