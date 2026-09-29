# Q37 private-alpha consumer continuation

Local consumer qualification **PASS** against reconstructed MyFactory `925530a6ba8764df6a7b8637192fe32edcbaff97`. [Independent read-only review](INDEPENDENT_REVIEW.md) **PASS** on pushed candidate `5b0033ba880cf45d4c69ab79385df129e19bedbb`; this follow-up changes documentation/evidence only. [Beta Integration handoff](BETA_HANDOFF.md) is ready; the [minimum real-provider envelope](REAL_PROVIDER.md) is prepared and unexecuted. Real provider **NOT_RUN**. This is the current Q37 consumer dossier; older producer pins and reports remain historical only.

Consumer baseline: `7bbf296f40ba61031f6e757b0d62929c3c95378d`, verified before creating `codex/q37-private-alpha-continuation` and immediately pushing that exact baseline. Producer remote: `origin/codex/private-alpha-myfactory` in `jaydubya818/MyFactory`, fetched and verified at the exact reconstructed SHA. Lost `efe9e856` was not used as source. Producer source was read-only.

## Change and scope

No production consumer adaptation was necessary: the existing strict V2 adapter accepts the reconstructed producer without weakening admission, spend accounting, routing, or custody. Added an executable exact-source consumer crosswalk. Four existing integration fixtures now wait for PostgreSQL connections to close instead of forcing their database drop. The reproduced teardown race occurred after successful assertions and caused `57P01` on a closing client; final reruns exit zero. These edits affect test qualification only. No production source, registered migration, governance classification, or historical evidence changed.

## Protocol crosswalk

| Producer contract | Consumer enforcement | Fresh evidence |
| --- | --- | --- |
| PREPARE immutable V2 plan and exact configuration | `factorySpendPlanSchema`, `LiveFactoryAdapter.prepare`, retained preparation intent | `crosswalk.json`, `connected.json` |
| START exact Work/generation/request/run identity | `FactoryWriterStore`, `FactoryWorkDriver`, PostgreSQL CAS and writer fence | `gate-b.json`, `connected.json` |
| READ authenticated V2 ledger | Strict parser recomputes totals, slots, reserves, UNKNOWN; exact attempt binding and monotonic history | `crosswalk.json`, `connected.json` |
| STOP retains uncertainty until quiescence | STOPPING blocks native admission; terminal tombstone rejects delayed START | `gate-b.json`, `connected.json` |
| Completion reserve and maximum operations | Full plan before admission; productive allowance excludes completion; exhausted slots deny restart | `crosswalk.json`, `connected.json` |
| Signed Gate C result | Exact FactoryVersion, signature, returned bytes, replay/conflict/stale admission | `gate-c.log`, current producer journey in `connected.json` |
| Candidate handoff and protected verification | Immutable Git bytes in consumer custody; independent Docker verifier; Factory PASS cannot substitute | `gate-b.json`, `connected.json` |
| Factory → native repair | Factory quiescence first, then normal new native admission; failed repair stays FAILED, passing repair stays PARTIAL | `gate-b.json`, `connected.json` |
| Routing and Current Truth | Backend intent selects DIRECT/HUMAN before PREPARE; qualified PRODUCE only; UNKNOWN remains visible after terminal execution | `connected.json`, `route-admission.log`, `worker-projection.log` |

Gate C's standalone golden is an explicitly historical protocol regression. The connected run obtains newly signed results from `925530a6`; the historical golden is not being represented as current producer execution.

## Fresh qualification

| Check | Result |
| --- | --- |
| Exact producer source, SQLite v8, consumer lineage and parser/admission crosswalk | PASS (`crosswalk.json`) |
| Installed Codex CLI 0.157.0 with client tool search | 16 connected checks; 3 client-search outputs; 3 separate read-only completions |
| Gate B | 23 PASS; SQL races, eight SIGKILL boundaries, exactly-once dispatch, restricted roles |
| Gate C | 47 PASS; replay, conflict, process recovery, custody, restricted roles |
| Full application, PostgreSQL admission enabled | 1,586 PASS / 40 gated skips (`app-postgres.log`) |
| Root/security | 151 PASS (`root.log`) |
| Producer regression, independently rerun | 134 PASS / 1 opt-in skip (`producer-regression.log`); installed CLI covered by consumer connected journey |
| Migration validation and lineage | 57 unchanged; fresh/populated upgrade, rollback, tamper rejection, canonical/feature lineage, legacy receipts PASS |
| Routing, Work context, protected verifier, native completion, projection | PASS, separate integration logs |
| Typecheck, capabilities, routing/governance | PASS; 659 classified sources, UNKNOWN=0 |
| Production webpack build | PASS; no deployment |

The connected provider sends predetermined responses only. Its 13 requests span separate Works: three completed four-operation journeys plus one UNKNOWN fault injection. Each successful Work allows three productive requests and one protected completion, at a fixture ceiling of $1.35 and full per-operation reserve of $0.336864. This is not a real-provider authorization or commercial price qualification.

Migration lineage: MyFactory SQLite v8 SHA-256 `0994004a2a89c2264423e969fc3b97ef609f8d0fb437e9dcf6ea6203309cbeb3`; MyEve 0001–0057 unchanged from the durable baseline. 0056: `dc4a908d6f3abd665824cb249459df850a92ff7c4346fded461a2061ba72b2bc`; 0057: `787b26a37700c890d0cee38ab47bb2b5e51c24cd70a28568f98d7d009072f057`. The crosswalk also checks every protected historical evidence hash from the prior lineage manifest.

## Safety and limitations

Fresh fixture counters: concurrent writers **0**, duplicate dispatches **0**, unauthenticated admissions **0**, false Ready **0**, stale writer mutations **0**, lost historical custody **0**, Factory-granted authority **0**, post-UNKNOWN admissions **0**, completion starvation **0**, calls beyond operation limit **0**, ceiling violations **0**, reserve theft **0**, duplicate operations **0**. These are scoped assertions from `connected.json`, `gate-b.json`, `gate-c.log`, and `crosswalk.json`, not claims about unexecuted live behavior.

The optional offline `factory-writer-history` restore was NOT_RUN: its old external dump is unavailable. Its invocation failed before database access; no result from that test is claimed. Fresh populated-state preservation, migration lineage and the 57-file byte comparison passed independently. Initial teardown failures are retained in `connected.log` and `connected-rerun.log`; `connected-final.log` is the final passing run. The historical dump gap is not a new product requirement or private-alpha launch gate.

For two trusted owners, billing classification is non-blocking. Resource/spend safeguards remain mandatory. The real-provider loader is present but not wired into default producer startup; execution stays DISABLED outside the loopback fixture. No Keychain credential was read, no real model call occurred, and no live enablement, deployment, merge, or publication occurred. GitHub/CI/review and Relay composition remain local synthetic contracts. Durable learning drafts and scoped advisory reuse pass; production learning promotion is not implemented. Results remain PARTIAL or FAILED, never Ready solely from Factory evidence.

## Reproduction

Use Node 24, dependencies matching the repository lockfile, Docker images `postgres:17-alpine`, `node:24-alpine`, `node:22-bookworm`, and a disposable loopback PostgreSQL cluster on ports 55479 and 55442. Tests never load an application `.env`. The PostgreSQL cluster needs local test roles `postgres`, `q37_admin`, and `myeve_test`; no production database is used.

```sh
MYFACTORY_SOURCE_ROOT=/absolute/clean/reconstructed/MyFactory node --import tsx apps/eve/test/factory-private-alpha.integration.mjs
MYFACTORY_SOURCE_ROOT=/absolute/clean/reconstructed/MyFactory FACTORY_SPEND_FIXTURE=1 FACTORY_INSTALLED_CLI=1 FACTORY_ENVELOPE_DRY_RUN=1 FACTORY_BETA_EVIDENCE=/absolute/output/connected.json node --import tsx apps/eve/test/factory-live.integration.mjs
node --import tsx apps/eve/test/factory-writer.integration.mjs
node --import tsx apps/eve/test/factory-receipt.integration.mjs
ADMISSION_CONTEXT_TEST_POSTGRES=1 npm test --workspace=eve-agent
npm test
npm run db:migrations:check
npm run typecheck --workspace=eve-agent
npm exec --workspace=eve-agent -- next build --webpack
```

Do not replace the clean producer checkout with an unreviewed source tree. The crosswalk enforces its exact SHA and rejects dirty source. Runtime FactoryVersion still binds source and configuration separately; a Git SHA alone grants no authority.
