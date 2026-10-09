# Checkpoint B — persistent agent home

Status: PARTIAL. Existing agent identities now have an operational home. This does not qualify real Software Engineer, Researcher or Personal Shopper execution.

Implemented: same-owner retained Work/Result references, current owner-decision need, recent task activity, routines and conversations. Agent identity remains separate from Factory producer identity. Legacy primary-agent threads without an agent ID remain visible only to the owner's primary agent. Instructions/model policy are collapsed under Advanced. Failed reads show an error/retry, not Idle. Routine execution remains disabled and is labeled Waiting. Lists are bounded at 10 Works and 20 conversations/tasks/routines; existing history/search retains older data.

Existing Duplicate now copies no capability grants. It retains safe configuration, uses createAgent for a fresh identity, and does not copy Memory, Work, approvals or credentials. UI explains capability review on the copy.

DETERMINISTIC: 12 PostgreSQL assertions exercise canonical home composition, cross-owner denial, real createAgent/duplicateAgent, fresh identity and absent copied grants/Work/history/routines. Neon HTTP is adapted to real local PostgreSQL transactions for these tests. Four production-build browser scenarios qualify desktop and 390px home, keyboard Advanced disclosure, 2 scoped WCAG scans, auth and outage recovery. The agent-list bootstrap is controlled; home endpoints and Work/Result reads use the actual application and PostgreSQL. Typecheck, governance and production build pass.

CONNECTED/LIVE: NOT_RUN. Natural manage_agent remains fail-closed in baseline; do not claim conversational specialist creation is qualified. Engineering Work is still selected/owned by canonical Sofie and produced by MyFactory; a role label is not evidence of a separate persistent Software Engineer identity. Existing scope guards and capability policy are preserved. These are remaining mission acceptance items.

Operational validation: inspect authenticated agent-home read failures and mismatched same-owner associations after adoption. Presentation rollback leaves canonical identity, Work and routine data unchanged. New copies require capability setup; existing agents keep their grants.
