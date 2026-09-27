# Production beta routing correction

Supersedes the routing qualification claim in candidate `662b80de0bb394a460c41f58df57ee41cb2bf6a6`. The independent reviewer correctly found that its `betaRoute` function had only unit-test callers. That candidate qualified a policy contract, not production route selection. The reviewed terminal-receipt baseline `21973e5` remains unchanged in behavior.

## Production path

The existing server-reviewed Factory configuration now includes `routing.intent` and optional `routing.boundedOperationQualified` (default false). Intent is bound to the exact owner, Work objective, repository and protected criteria through the existing NativeRouteAuthority scope check. It is not accepted from the model or HTTP action input. Missing intent fails closed to UNSUPPORTED/HUMAN. A production profile must explicitly declare PRODUCE; no existing profile is silently upgraded.

`FactoryWorkDriver.start` calls `FactoryRouteAuthority.assess`, which applies the beta policy before any repository snapshot acquisition, Factory PREPARE or writer admission. Investigation/planning select DIRECT. Separately qualified bounded operations select DIRECT when writer/budget/scope permit. Unsupported, approval, judgment and unclassified work select HUMAN. Substantial production selects MYFACTORY only when the existing provider, scope, writer and budget qualification allows it.

DIRECT/HUMAN are retained in the existing canonical routing decision as proposals, with no Factory preparation and no route Run. Selection alone does not execute tools or grant authority: DIRECT effects still require existing action admission. Conflicting current proposals are preserved and rejected, not overwritten. Current Truth observes the same persisted decision. Existing Factory attempts retain their immutable configuration hash and exact-attempt recovery; do not edit historical preparation records to retrofit a new configuration.

The canonical admission snapshot stays unchanged and strict: `read` strips the policy selection from `assess`. No migrations or shared admission schemas changed. Only the two owned Factory routing/driver fingerprints were refreshed; unrelated entries and classifications changed zero.

## Qualification

The connected regression runs the actual production driver and PostgreSQL proposal store for eight backend policy cases, including absent classification and replay. Every non-production case asserts no source acquisition, Factory adapter call, preparation or writer Run. The same test then exercises real d956 producer transport, SQLite, Git, signatures, protected Docker verification, failure/repair, lost response, autonomous restarted worker, STOPPING/quiescence and historical FAILED/CANCELLED receipts.

Final results and hashes are retained alongside this report. Earlier populated-upgrade, M1, root/security, producer and immutable-migration qualification in the [runtime dossier](../2026-09-27-live-readiness/REPORT.md) remains applicable; the producer and those implementations did not change.

Live MyFactory remains NOT READY / NOT_RUN. Production route selection is locally qualified; paid execution still requires the spend-enforcing runtime described in the [blocked envelope](../2026-09-27-live-readiness/LIVE-ENVELOPE.md). No live execution or external publication occurred.

Final reruns: connected **13 PASS** (eight backend intent cases); Gate B **23 PASS**; Gate C **47 PASS**; application **1555 PASS / 40 environment-gated skips**; root/security **151 PASS**; typecheck/governance **PASS, UNKNOWN=0**; migrations **57 PASS, zero changed bytes**; webpack **PASS**. Connected safety counters and non-production Factory preparations/writer Runs are all zero. [Machine-readable summary](qualification-summary.json), [connected evidence](connected.json), [source hashes](source-hashes.json), [artifact hashes](artifact-hashes.json).
