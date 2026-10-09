# Checkpoint A — unified Work observation and owner decision

Status: PARTIAL. Implemented and deterministically qualified conversation composition. Full natural-request → specialist → productive Work progression in this new surface is NOT_RUN. No claim of complete mission readiness.

## Implementation

`/api/work-thread` reads authenticated, retained context associations through same-owner thread, agent-run, agent and Work joins. It ignores client chat payloads, pasted IDs and forked history. Bounded pages (10 Works) preserve earlier Work. Chat renders the canonical projection, Result and full Current Truth disclosure and embeds the existing OwnerCandidateDecision. It does not create another approval, dispatch Work or copy execution authority into the composer. Existing per-turn selection and completed-session behavior are unchanged.

Publication remains its own current-candidate authority check. An inactive/fenced writer does not prevent a retained verified Result from being reviewed. The publication service validates exact Work, Result, version, generation, signed candidate custody and tree. Evidence-reference deduplication is presentation-only. Publication and owner acceptance remain separate.

Failures retain the last read observation but hide decision controls until refresh succeeds. Reads abort on unmount; reconnect/visibility refreshes authoritative state. Unsaved conversations have no Work card.

## Evidence

* DETERMINISTIC: 8 PostgreSQL adapter checks: retained projection, fork isolation, both cross-owner directions, deduplication, pagination, mismatched-session rejection.
* DETERMINISTIC: 27 existing conversation/session/Work-binding unit regressions.
* DETERMINISTIC: canonical publication contract regression suite, exact output in publication.log.
* DETERMINISTIC: 12 production-build Playwright scenarios run chat → retained Result → all four exact decisions and reload, auth/fork boundaries and failed-read recovery at 1440×1000 and 390×844. Work/publication endpoints and PostgreSQL are real; unrelated chat bootstrap responses and external GitHub transport are controlled. This does not count as natural-request E2E.
* Accessibility: scoped Work component WCAG2A/AA/2.1AA scans, keyboard radio selection and confirmation; screenshots in output/playwright/agent-native.
* Typecheck, executor governance and Next production build: PASS.
* CONNECTED/LIVE: no new live model, publication, peer messaging or cloud execution. NOT_RUN.

## Reproduction / operational scope

This task uses a separate PostgreSQL container `myeve-agent-native-qualification-pg`, loopback 55509, database `myeve_beta_publication`, web 3198, and the canonical `test/publication` controlled worker. The canonical publication fixture currently requires the previously retained Attempt-8 capture and engineering configuration (same prerequisites as the existing suite); it is not a standalone clean-clone fixture. Never point these tests at a live database. Product tests set MYEVE_PRODUCT_TEST_DATABASE / MYEVE_PUBLICATION_TEST_DATABASE explicitly.

No migration, execution backend, producer, routing, Environment Fabric or production deployment change. Monitor the new read-only endpoint for 401/404/503 and Work/Result association mismatch after adoption. Roll back the chat composition if authorization or stale-state regressions appear; persisted Work and decisions are unaffected by presentation rollback.
