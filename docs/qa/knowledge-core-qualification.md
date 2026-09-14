# Knowledge Core qualification

Qualified from Phase 4 commit `2118f23c89ac91e2d062dfde00c950e17f9c3ab1` on branch `feat/knowledge-provenance-core`.

## Isolation

- Shared `neondb` was inspected read-only and was not mutated.
- It contained migrations `0001` through `0009_scoped_memory_context.sql`; `0011` was absent.
- Migration and seed qualification used a disposable local PostgreSQL database only.
- Clean isolated order: `0001` through `0008`, then `0011_knowledge_provenance_core.sql`.
- The repository migration checker accepts the intentionally reserved `0009`/`0010` gap.
- Phase 9A has no schema or code dependency on `0010`. Migration `0011` references only `goals` from `0003` and `agents` from `0008`.

## Results

- Repository unit tests: 64 passed.
- TypeScript: Eve and Builder passed.
- Migration validation: 9 ordered files passed.
- Isolated schema: Source, Fact, Observation, Hypothesis, Decision, Commitment, Preference, Insight, Relationship, provenance, contradiction relation, Goal link, and supersession passed.
- Security: cross-owner Goal, Agent origin, and Source provenance links were rejected by composite foreign keys.
- Constraints: confidence, typed statuses, preference fields, relationship predicates, and one-successor supersession passed.
- Capability registry: 78 definitions and 55 tools, complete.
- Builder manifest: 77 prunable files, complete.
- Dependency audit: 0 vulnerabilities.
- Eve production build: passed.
- Builder production build: passed.
- Diff/whitespace audit: passed.
- Browser: desktop and mobile Knowledge list/detail, tabs, text search, status filter, Decision rationale, Fact detail, provenance, Goal link, empty/error states, and supersession history passed with deterministic isolated fixtures.

## Deferred external proof

The committed Neon integration suite is not claimed as executed. Running it requires an isolated Neon database or branch because the production repository adapter uses Neon HTTP rather than local PostgreSQL TCP. No external resource was created.
