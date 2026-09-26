# Browser and restart observations

Real local Next/Eve app, isolated PostgreSQL fixture, `http://localhost:3108`. Existing application password login succeeded (HTTP 200) and the authenticated cookie was used for Work and Chat. External network requests were disabled and no model credentials were loaded.

| Observation | Result |
| --- | --- |
| Desktop login and saved Work objective/criteria/ceiling | PASS |
| Work → Chat; choose Work via selector; Chat → exact Work | PASS |
| Selected Work badge: Waiting for admission / no route | PASS |
| 390 × 844 Chat | clientWidth 390, scrollWidth 390 — no horizontal overflow |
| 390 × 844 Work | clientWidth 375, scrollWidth 375 (scrollbar) — no horizontal overflow |
| Candidate/evidence/spend uncertainty/PARTIAL/recovery UI | NOT RUN in this fixture |

Screenshots: [desktop Work](browser/desktop-work.png), [desktop Chat](browser/desktop-chat.png), [mobile Work](browser/mobile-work.png), [mobile Chat](browser/mobile-chat.png).

The offline server process 31763 was terminated with SIGTERM and restarted as 37380. Reload retained authentication and recovered the same Work ID, version 2, generation 2, objective, criteria, $1.30 ceiling and Waiting for admission state from PostgreSQL. [Before](browser/work-before-restart.txt), [after](browser/work-after-restart.txt), [screenshot](browser/desktop-work-after-restart.png). This proves only offline saved-Work/app continuity. It does not prove model/effect replay or a fresh Sofie conversation. Selected Work context is explicitly cleared on reload by current UI behavior.

Separately, the fresh native-host integration uses actual SIGKILL before and after model-result custody. Unsettled reservations stay fenced, settled results replay, and the retained call count remains one. The verifier integration checks one claimant, expired-lease fencing and retained exact-evidence reconciliation. These are service/process regression evidence, not substitutes for authenticated chat/session/application/verifier continuity during the required journey.

Cleanup: the temporary browser tab was closed, viewport override reset, and both task-owned UI server instances stopped. The existing PostgreSQL server was not stopped. Isolated database `golden_auth_127447eb80f3` remains for review; no production database was used. Fixture qualification expires after one hour and cannot be reused as a production qualification or silently renewed.
