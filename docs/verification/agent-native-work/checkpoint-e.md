# Checkpoint E — Today / Inbox responsibility progress

Status: PARTIAL overall; the scoped read projection is deterministically qualified.

Today now shows the responsible persistent agent, retained check status/summary, next scheduled time in its stored timezone, and an honest waiting state while execution is disabled. Inbox reads existing completed Run delivery records. Quiet condition checks remain in history without becoming Inbox notifications. Read endpoints enforce owner scope and omit foreign-owner thread links. They create no Work, schedule, approval, notification or execution authority.

Product pages now keep seven primary destinations in a persistent desktop rail. Mobile uses an accessible Menu with Escape/focus return; More retains secondary destinations. Existing MyEve colors, controls and typography remain.

## Evidence

- 27 PostgreSQL assertions in routine-condition.integration.mjs, including conditional results plus Today/Inbox projection and cross-owner isolation.
- Six production-build Playwright scenarios at 1440px and 390px; real authenticated /api/responsibilities and PostgreSQL records. Unrelated bootstrap feeds are mocked.
- Four scoped accessibility scans: zero violations. Mobile Menu open/Escape/focus and no horizontal overflow pass.
- Typecheck, source governance and production build pass.
- Screenshots: output/playwright/agent-native/{desktop,390px}-{today,inbox}-responsibilities.png, visually inspected.
- Fixture seeded through existing Routine review/ExecutionStore/retained-check APIs. Model/provider calls: 0. See seed-responsibilities.mjs. Category: DETERMINISTIC with connected local database/API; not LIVE.

## Limitations

Bounded recent views show 20 responsibilities and 10 notification records. Existing management/history remains available. This is not a complete all-channel Inbox adapter or a live autonomous agent demonstration. Cloud and real recurring execution remain unqualified. Existing Goal, Work, Result and Needs You services retain their own canonical authority.
