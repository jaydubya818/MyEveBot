# Capability matrix — initial source audit

All 959 numbered requirements are indexed below. Status describes source coverage, not new qualification or launch readiness. Repeated requirements share a family assessment; detailed acceptance remains in requirements.json. No live capability is certified by this inventory.

| Section | Capability | Owner | Status | Next step / boundary | Source |
| --- | --- | --- | --- | --- | --- |
| 0 | MISSION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 1 | REPOSITORIES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 2 | WORKTREE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 3 | FIRST: CAPABILITY AUDIT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 4 | PRODUCT PRINCIPLE — HIDE THE MACHINERY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 5 | PRIMARY INFORMATION ARCHITECTURE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 6 | TODAY — OWNER COMMAND CENTER | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 7 | DAILY BRIEF | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 8 | WEEKLY REVIEW | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 9 | SOFIE'S INBOX | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 10 | NEEDS YOU | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 11 | ATTENTION / CORRELATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 12 | FIRST-CLASS EMAIL IDENTITY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 13 | SLACK | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 14 | IMESSAGE / SMS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 15 | PHONE / VOICE | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 16 | AGENT-OWNED IDENTITY | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 17 | COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 18 | LOCAL COMPUTER PAIRING | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 19 | TAKE CONTROL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 20 | SANDBOX BY DEFAULT | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 21 | PERSISTENT SANDBOXES | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 22 | APPROVAL CENTER | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 23 | "NOTHING LEAVES WITHOUT YOU" | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 24 | WORK-SCOPED APPROVALS | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 25 | APPROVAL ONCE PER CAPABILITY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 26 | WORK UX | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 27 | PROOF OF WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 28 | CANDIDATE VS RESULT | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 29 | MYFACTORY AS SOFTWARE ENGINEER | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 30 | MYFACTORY APPROVAL CARD | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 31 | AUTOMATIC VERIFICATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 32 | FILES → ARTIFACT WORKSPACE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 33 | ARTIFACT HISTORY | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 34 | SHARE LINKS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 35 | SOFIE'S TEAM | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 36 | SPECIALIST BUILDER | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 37 | PERSISTENT SPECIALISTS | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 38 | AGENT ROOMS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 39 | DELEGATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 40 | RELAY FEDERATION | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 41 | CONNECTED APPS HUB | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 42 | CAPABILITY MODEL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 43 | PERSISTENT APP SESSIONS | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 44 | PROACTIVE SOFIE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 45 | FOLLOW-UPS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 46 | GOALS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 47 | PLANS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 48 | TASKS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 49 | NO-BABYSITTING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 50 | TOTAL RECALL | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 51 | MEMORY CONTROLS | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 52 | MEMORY TRANSPARENCY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 53 | GOVERNED LEARNING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 54 | LEARNING UX | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 55 | MEASURED IMPROVEMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 56 | MEMORY CAPSULES | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 57 | CAPSULE UX | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 58 | NEW EVE BOOTSTRAP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 59 | ONE-CLICK EVE DEPLOYMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 60 | PRIVATE INSTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 61 | OWNER VS GUEST | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 62 | TWO-OWNER PRIVATE ALPHA | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 63 | SHARED BUSINESS WORKSPACE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 64 | UNIVERSAL SEARCH | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 65 | COMMAND PALETTE | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 66 | DEEP LINKS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 67 | GLOBAL ACTIVITY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 68 | ADVANCED AUDIT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 69 | DESKTOP APP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 70 | MOBILE / PWA | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 71 | PUSH NOTIFICATIONS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 72 | NOTIFICATION PREFERENCES | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 73 | PERSONAL URL / AGENT ADDRESS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 74 | AGENT API | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 75 | WEBHOOKS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 76 | SKILLS CATALOG | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 77 | SKILL CREATION | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 78 | PROCEDURES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 79 | ROLE PACKS | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 80 | MODEL ROUTING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 81 | BRING YOUR OWN KEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 82 | USAGE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 83 | BUDGET CONTROLS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 84 | PAYMENT CAPABILITY | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 85 | FINANCE | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 86 | CALENDAR | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 87 | CONTACTS / PEOPLE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 88 | RELAY AS THE CAPABILITY FABRIC | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 89 | RELAY IDENTITY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 90 | RELAY GRANTS | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 91 | RELAY PRIVATE / SHARED KNOWLEDGE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 92 | RELAY INBOX | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 93 | RELAY DURABLE SESSIONS | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 94 | RELAY COMPUTER | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 95 | RELAY AGENT FEDERATION | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 96 | MYFACTORY ROUTING | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 97 | MYFACTORY PRIVATE-ALPHA INTEGRATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 98 | REAL PROVIDER | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 99 | DURABLE SOURCE RULE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 100 | APPROVAL POLICY MODEL | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 101 | GUEST SAFETY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 102 | APPROVAL CARDS | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 103 | NEEDS YOU CARDS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 104 | RESULT CARDS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 105 | AGENT STATUS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 106 | DELEGATION STATUS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 107 | WORK TIMELINE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 108 | CURRENT TRUTH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 109 | PROVENANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 110 | SEARCH WITH PROVENANCE | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 111 | PERSONAL KNOWLEDGE GRAPH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 112 | BUSINESS KNOWLEDGE GRAPH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 113 | FIRST-RUN EXPERIENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 114 | FIRST WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 115 | PRODUCT COPY | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 116 | DESIGN LANGUAGE | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 117 | TRUST SURFACES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 118 | PRIVATE-ALPHA LAUNCH SCOPE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 119 | POST-ALPHA BACKLOG | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 120 | PRIVATE-ALPHA GOLDEN JOURNEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 121 | RELAY GOLDEN JOURNEY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 122 | EMAIL GOLDEN JOURNEY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 123 | SLACK GOLDEN JOURNEY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 124 | COMPUTER GOLDEN JOURNEY | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 125 | MYFACTORY GOLDEN JOURNEY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 126 | APPROVAL GOLDEN JOURNEY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 127 | WORK-SCOPED GRANT GOLDEN JOURNEY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 128 | SPECIALIST GOLDEN JOURNEY | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 129 | TEAM / ROOM GOLDEN JOURNEY | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 130 | TWO-OWNER GOLDEN JOURNEY | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 131 | CURRENT-TRUTH GOLDEN JOURNEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 132 | LEARNING GOLDEN JOURNEY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 133 | CAPSULE GOLDEN JOURNEY | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 134 | FAILURE / RECOVERY UX | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 135 | SELF-RECOVERY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 136 | HUMAN RECOVERY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 137 | NO DUPLICATE EFFECTS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 138 | AUTHORITY MUST BE CODE-ENFORCED | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 139 | PROMPT-INJECTION DEFENSE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 140 | SECRET HANDLING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 141 | EXTERNAL EFFECT LEDGER | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 142 | APPROVAL AUDIT | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 143 | COMPUTER SECURITY | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 144 | FILE SECURITY | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 145 | KNOWLEDGE SECURITY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 146 | MEMORY SECURITY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 147 | SPECIALIST SECURITY | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 148 | RELAY SECURITY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 149 | MYFACTORY SECURITY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 150 | USAGE / RESOURCE SAFETY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 151 | OWNER CONTROL CENTER | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 152 | PRIVACY CENTER | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 153 | CONNECTION STATUS | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 154 | AGENT HEALTH | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 155 | OFFLINE / DEGRADED MODE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 156 | EMPTY STATES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 157 | LOADING STATES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 158 | ERROR STATES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 159 | ACCESSIBILITY | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 160 | PERFORMANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 161 | OBSERVABILITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 162 | PRODUCT ANALYTICS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 163 | QUALITY / SENTIMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 164 | TIME TO USEFUL RESULT | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 165 | COORDINATION DEBT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 166 | AUTONOMY QUALITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 167 | RESULT QUALITY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 168 | FIRST-WEEK PRIVATE-ALPHA EXPERIENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 169 | BUSINESS-PARTNER ONBOARDING | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 170 | SHARED GOALS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 171 | SHARED NEEDS YOU | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 172 | SHARED RESULTS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 173 | SHARED ARTIFACTS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 174 | OWNER-SPECIFIC PREFERENCES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 175 | ORGANIZATION KNOWLEDGE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 176 | COMPANY PROCEDURES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 177 | OWNER HANDOFF | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 178 | EXTERNAL COLLABORATORS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 179 | PRIVATE-ALPHA DEPLOYMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 180 | DEPLOYMENT SOURCE RULE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 181 | MIGRATION RULE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 182 | CONFIGURATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 183 | SECRETS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 184 | BACKUP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 185 | DATA EXPORT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 186 | DELETION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 187 | RELEASE CHANNEL | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 188 | FEATURE FLAGS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 189 | PRIVATE-ALPHA LAUNCH GATES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 190 | PRIVATE-ALPHA LAUNCH CHECKLIST | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 191 | PRIVATE-ALPHA SMOKE JOURNEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 192 | PRIVATE-ALPHA OBSERVATION PERIOD | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 193 | PRIVATE-ALPHA FEEDBACK LOOP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 194 | BUG REPORTING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 195 | PRODUCT QUALITY DASHBOARD | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 196 | SELF-DIAGNOSTICS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 197 | CAPABILITY FALLBACK | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 198 | ROUTE EXPLANATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 199 | COST / RESOURCE EXPLANATION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 200 | RESULT CONFIDENCE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 201 | EXPLAINABLE BLOCKERS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 202 | WAITING STATES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 203 | AUTOMATIC CONTINUATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 204 | LONG-RUNNING WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 205 | WORK RESUMPTION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 206 | WORK CANCELLATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 207 | WORK PAUSE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 208 | WORK PRIORITY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 209 | WORK QUEUE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 210 | FOCUS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 211 | DEADLINES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 212 | SCHEDULED ROUTINES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 213 | ROUTINE MANAGEMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 214 | EVENT TRIGGERS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 215 | TRIGGER → WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 216 | AUTOMATION SAFETY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 217 | AUTOMATION APPROVAL POLICY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 218 | STANDING GRANTS | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 219 | EXPIRING AUTHORITY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 220 | REVOCATION | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 221 | OWNER OVERRIDE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 222 | CONFLICTING OWNER INSTRUCTIONS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 223 | APPROVAL OWNERSHIP | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 224 | BUSINESS-PARTNER ROLE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 225 | PRIVATE VS SHARED CHAT | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 226 | SHARED SOFIE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 227 | OWNER-SPECIFIC MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 228 | SHARED DECISIONS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 229 | DECISION LOG | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 230 | ORGANIZATION HISTORY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 231 | PROJECT SPACES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 232 | PROJECT MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 233 | PROJECT PROCEDURES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 234 | PROJECT SPECIALISTS | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 235 | PROJECT COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 236 | PROJECT ARTIFACTS | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 237 | RESULT LIBRARY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 238 | WORK HISTORY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 239 | CONVERSATION HISTORY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 240 | CONVERSATION → WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 241 | WORK → CONVERSATION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 242 | MULTI-CHANNEL CONTINUITY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 243 | CHANNEL PREFERENCE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 244 | CHANNEL IDENTITY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 245 | CONTACT VERIFICATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 246 | INBOUND EMAIL SAFETY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 247 | ATTACHMENT SAFETY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 248 | FILE → WORK | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 249 | ARTIFACT → WORK | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 250 | RESULT → FOLLOW-UP WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 251 | AUTONOMOUS REPLANNING | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 252 | REPLAN VISIBILITY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 253 | BLOCKER RESOLUTION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 254 | WAITING FOR PEOPLE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 255 | FOLLOW-UP POLICY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 256 | CALENDAR FOLLOW-UP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 257 | MEETING PREP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 258 | MEETING FOLLOW-UP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 259 | EMAIL TRIAGE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 260 | EMAIL DRAFTING | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 261 | EMAIL AUTO-REPLY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 262 | SLACK TRIAGE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 263 | SLACK GUEST MODE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 264 | AGENT MENTIONS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 265 | @EVERYONE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 266 | SPECIALIST COST AWARENESS | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 267 | SPECIALIST QUALITY | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 268 | SPECIALIST MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 269 | SPECIALIST KNOWLEDGE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 270 | SPECIALIST TOOL POLICY | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 271 | SPECIALIST MODEL POLICY | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 272 | SPECIALIST CREATION BY SOFIE | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 273 | SPECIALIST RETIREMENT | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 274 | ROOM HISTORY | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 275 | ROOM APPROVALS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 276 | ROOM KNOWLEDGE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 277 | RELAY CROSS-EVE REQUEST | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 278 | RELAY CROSS-EVE RESPONSE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 279 | CROSS-EVE KNOWLEDGE EXCHANGE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 280 | CROSS-EVE WORK REQUESTS | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 281 | CROSS-EVE APPROVALS | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 282 | CROSS-EVE TRUST | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 283 | RELAY REVOCATION | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 284 | RELAY OFFLINE BEHAVIOR | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 285 | RELAY DELIVERY IDEMPOTENCY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 286 | RELAY AUDIT | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 287 | MYFACTORY SOFTWARE PRODUCTION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 288 | FACTORY VERSIONING | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 289 | FACTORY REQUEST CONTRACT | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 290 | FACTORY RESULT CONTRACT | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 291 | FACTORY CANDIDATE CUSTODY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 292 | FACTORY VERIFICATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 293 | FACTORY REPAIR | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 294 | FACTORY FAILURE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 295 | FACTORY UNKNOWN | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 296 | FACTORY CANCELLATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 297 | FACTORY EXACTLY-ONCE DISPATCH | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 298 | FACTORY CLIENT TOOLS | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 299 | FACTORY PROVIDER ABSTRACTION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 300 | FACTORY RESOURCE CONTRACT | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 301 | FACTORY PROOF OF WORK | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 302 | FACTORY PUBLICATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 303 | FACTORY PR EXPERIENCE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 304 | FACTORY CI CONTINUATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 305 | FACTORY REVIEW FEEDBACK | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 306 | FACTORY DEPLOYMENT | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 307 | FACTORY LEARNING | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 308 | FACTORY PROJECT MEMORY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 309 | FACTORY ROUTE QUALITY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 310 | DIRECT SOFIE ROUTE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 311 | HUMAN ROUTE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 312 | ROUTE RECOVERY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 313 | ROUTE PROVENANCE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 314 | ROUTE UX | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 315 | PERSONAL COMPUTER VS FACTORY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 316 | COMPUTER APPROVALS | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 317 | BROWSER DOWNLOADS | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 318 | BROWSER UPLOADS | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 319 | COMPUTER CREDENTIALS | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 320 | COMPUTER SESSION ISOLATION | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 321 | COMPUTER SCREEN EVIDENCE | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 322 | COMPUTER TAKEOVER SAFETY | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 323 | APP CONNECTION UX | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 324 | APP DISCONNECTION | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 325 | APP EXPIRY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 326 | APP LEAST PRIVILEGE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 327 | APP PER-WORK AUTHORITY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 328 | APP AUDIT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 329 | EMAIL IDENTITY UX | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 330 | EMAIL SIGNATURE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 331 | EMAIL OWNER REPRESENTATION | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 332 | EMAIL APPROVAL SCOPE | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 333 | EMAIL THREAD MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 334 | EMAIL CONTACT MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 335 | EMAIL ATTACHMENTS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 336 | SLACK IDENTITY UX | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 337 | SLACK CHANNEL POLICY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 338 | SLACK THREAD MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 339 | SLACK APPROVAL | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 340 | IMESSAGE IDENTITY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 341 | IMESSAGE GROUPS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 342 | PHONE IDENTITY | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 343 | VOICE APPROVAL | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 344 | FILES HOME | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 345 | FILE PREVIEW | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 346 | FILE COMMENTS | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 347 | FILE VERSIONING | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 348 | FILE PROVENANCE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 349 | FILE SHARE POLICY | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 350 | ARTIFACT EDITING | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 351 | ARTIFACT COMMENTS → WORK | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 352 | ARTIFACT APPROVAL | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 353 | GENERATED PRESENTATIONS | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 354 | GENERATED SPREADSHEETS | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 355 | GENERATED PDF | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 356 | ARTIFACT SEARCH | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 357 | KNOWLEDGE HOME | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 358 | MEMORY VS KNOWLEDGE UX | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 359 | MEMORY SEARCH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 360 | MEMORY CORRECTION UX | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 361 | MEMORY DELETION UX | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 362 | MEMORY PRIVACY UX | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 363 | KNOWLEDGE INGESTION | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 364 | KNOWLEDGE REFRESH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 365 | KNOWLEDGE CITATIONS | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 366 | KNOWLEDGE CONFLICTS | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 367 | KNOWLEDGE SHARING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 368 | LEARNING CANDIDATES UX | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 369 | LEARNING SCOPE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 370 | LEARNING ROLLBACK | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 371 | LEARNING CONFLICTS | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 372 | LEARNING POISONING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 373 | LEARNING AUTHORITY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 374 | PERSONALIZATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 375 | PERSONALITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 376 | WORKING STYLE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 377 | COMMUNICATION PREFERENCES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 378 | MODEL PREFERENCES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 379 | DEFAULT AUTONOMY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 380 | OWNER INTERRUPTION POLICY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 381 | STATUS UPDATES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 382 | QUIET AUTONOMY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 383 | EXPLICIT NEXT ACTION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 384 | PROGRESS WITHOUT FAKE PERCENTAGES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 385 | RESULT SUMMARIZATION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 386 | RESULT ACTIONS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 387 | RESULT FEEDBACK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 388 | RESULT SHARING | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 389 | RESULT REOPEN | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 390 | RESULT INVALIDATION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 391 | RESULT RELATIONSHIPS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 392 | PROOF OF WORK SUMMARY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 393 | PROOF OF WORK ADVANCED | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 394 | OWNER TRUST MODEL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 395 | "WORKS IN PRIVATE" | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 396 | "YOU CONTROL WHAT LEAVES" | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 397 | "VERIFIED RESULTS" | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 398 | "MEMORY WITH SOURCES" | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 399 | "REVOCABLE ACCESS" | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 400 | PRIVATE-ALPHA PRODUCT HOME | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 401 | GLOBAL NEEDS YOU INDICATOR | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 402 | GLOBAL WORKING INDICATOR | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 403 | QUICK ASK | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 404 | CONTEXTUAL ASK | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 405 | CONTEXTUAL ACTIONS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 406 | ONBOARDING — STEP 1 | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 407 | ONBOARDING — STEP 2 | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 408 | ONBOARDING — STEP 3 | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 409 | ONBOARDING — STEP 4 | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 410 | ONBOARDING — STEP 5 | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 411 | ONBOARDING — STEP 6 | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 412 | ONBOARDING COMPLETION | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 413 | FIRST SUCCESS MOMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 414 | DESIGN PARTNER MODE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 415 | KNOWN LIMITATIONS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 416 | FEATURE MATURITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 417 | FEATURE DISCOVERY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 418 | COMMAND DISCOVERY | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 419 | NATURAL LANGUAGE FIRST | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 420 | COMMANDS AS SHORTCUTS | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 421 | WORK CREATION HEURISTICS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 422 | CONVERSATION ONLY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 423 | WORK INTENT | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 424 | WORK ACCEPTANCE CRITERIA | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 425 | WORK SCOPE CHANGES | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 426 | WORK EVIDENCE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 427 | WORK ARTIFACTS | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 428 | WORK SOURCES | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 429 | WORK DECISIONS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 430 | WORK COST / RESOURCE VIEW | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 431 | WORK ARCHIVE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 432 | GOAL HOME | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 433 | GOAL DETAIL | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 434 | GOAL PROGRESS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 435 | GOAL NEXT ACTION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 436 | GOAL PROACTIVE CONTINUATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 437 | GOAL COMPLETION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 438 | GOAL REOPEN | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 439 | GOAL SHARING | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 440 | GOAL NOTIFICATIONS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 441 | TODAY — WORKING NOW | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 442 | TODAY — WAITING | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 443 | TODAY — NEEDS YOU | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 444 | TODAY — RECENTLY COMPLETED | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 445 | TODAY — UPCOMING | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 446 | TODAY — SUGGESTIONS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 447 | DAILY BRIEF DELIVERY | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 448 | DAILY BRIEF INTERACTION | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 449 | WEEKLY REVIEW DELIVERY | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 450 | UNIVERSAL INBOX SOURCE LABELS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 451 | INBOX TRIAGE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 452 | INBOX THREADING | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 453 | INBOX SEARCH | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 454 | INBOX ARCHIVE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 455 | INBOX SNOOZE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 456 | INBOX → WORK | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 457 | INBOX → NEEDS YOU | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 458 | NEEDS YOU PRIORITY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 459 | NEEDS YOU RESOLUTION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 460 | NEEDS YOU SUPERSESSION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 461 | NEEDS YOU EXPIRY | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 462 | NEEDS YOU MOBILE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 463 | APPROVAL CENTER FILTERS | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 464 | APPROVAL PREVIEW | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 465 | APPROVAL MODIFICATION | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 466 | APPROVAL REPLAY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 467 | APPROVAL REVOCATION | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 468 | APPROVAL HISTORY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 469 | COMPUTER HOME | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 470 | MULTIPLE COMPUTERS | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 471 | COMPUTER SELECTION | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 472 | COMPUTER PAIRING UX | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 473 | COMPUTER REVOCATION | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 474 | COMPUTER FILE TRANSFER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 475 | COMPUTER APP LAUNCH | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 476 | COMPUTER SESSION RECOVERY | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 477 | COMPUTER OBSERVABILITY | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 478 | COMPUTER PROOF OF WORK | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 479 | COMPUTER FAILURE RECOVERY | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 480 | COMPUTER → NEEDS YOU | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 481 | COMPUTER + MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 482 | COMPUTER + FILES | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 483 | COMPUTER + RELAY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 484 | COMPUTER + APPROVAL CENTER | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 485 | LIVE COMPUTER VIEW | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 486 | BROWSER-ONLY FALLBACK | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 487 | UNIVERSAL INBOX + COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 488 | CHANNEL ROUTING | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 489 | CHANNEL HANDOFF | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 490 | CHANNEL-SPECIFIC OUTPUT | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 491 | CHANNEL DELIVERY RECEIPTS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 492 | CHANNEL FAILURE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 493 | CHANNEL PRIVACY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 494 | EMAIL DOMAIN POLICY | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 495 | SLACK CHANNEL AUDIENCE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 496 | MOBILE PUSH ACTIONS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 497 | NOTIFICATION DEDUPLICATION | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 498 | NOTIFICATION ESCALATION | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 499 | DAILY BRIEF MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 500 | DAILY BRIEF LEARNING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 501 | DAILY BRIEF ACTION ITEMS | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 502 | WEEKLY REVIEW LEARNING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 503 | PERSONAL KNOWLEDGE GRAPH UX | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 504 | PEOPLE VIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 505 | COMPANY VIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 506 | DECISION VIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 507 | PROCEDURE VIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 508 | SKILL VIEW | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 509 | ROLE VIEW | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 510 | SPECIALIST PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 511 | SPECIALIST ACTIVITY | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 512 | SPECIALIST RESULT | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 513 | SPECIALIST FAILURE | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 514 | SPECIALIST AVAILABILITY | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 515 | SPECIALIST BUDGET | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 516 | SPECIALIST CREATION UX | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 517 | SPECIALIST CAPABILITY PREVIEW | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 518 | SPECIALIST CAPABILITY EDIT | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 519 | SPECIALIST SHARED BUSINESS ACCESS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 520 | SPECIALIST PRIVATE OWNER ACCESS | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 521 | SPECIALIST RELAY IDENTITY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 522 | ROOM CREATION UX | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 523 | ROOM MEMBERSHIP | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 524 | ROOM FILES | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 525 | ROOM WORK | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 526 | ROOM DECISIONS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 527 | ROOM EXTERNAL EFFECTS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 528 | ROOM MOBILE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 529 | RELAY DIRECTORY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 530 | RELAY CONNECTION REQUEST | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 531 | RELAY CONNECTION REVOCATION | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 532 | RELAY SHARED MEMORY RULE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 533 | RELAY SHARED ARTIFACTS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 534 | RELAY CROSS-ORG FUTURE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 535 | RELAY POLICY ENGINE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 536 | RELAY EVENT STREAM | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 537 | RELAY WEBHOOKS | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 538 | RELAY BROWSER PROVIDER | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 539 | RELAY SANDBOX PROVIDER | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 540 | RELAY GITHUB | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 541 | RELAY GOOGLE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 542 | RELAY SLACK | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 543 | RELAY HEALTH | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 544 | RELAY RECOVERY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 545 | RELAY PERFORMANCE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 546 | RELAY PROVENANCE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 547 | RELAY RESULT NORMALIZATION | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 548 | MYEVE BUILDER | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 549 | BUILDER SIMPLE MODE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 550 | BUILDER ADVANCED MODE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 551 | BUILDER TEMPLATES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 552 | BUILDER ROLE PACK | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 553 | BUILDER CAPSULE | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 554 | BUILDER PROVIDER | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 555 | BUILDER RELAY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 556 | BUILDER FILE STORAGE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 557 | BUILDER MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 558 | BUILDER DATABASE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 559 | BUILDER COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 560 | BUILDER CHANNELS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 561 | BUILDER DEPLOYMENT STATUS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 562 | BUILDER UPDATE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 563 | BUILDER ROLLBACK | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 564 | BUILDER DELETE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 565 | INSTANCE MANAGEMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 566 | INSTANCE URL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 567 | INSTANCE AUTH | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 568 | TWO-OWNER AUTH | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 569 | OWNER INVITE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 570 | OWNER REMOVAL | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 571 | SESSION MANAGEMENT | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 572 | MFA | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 573 | INSTANCE BACKUP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 574 | INSTANCE RESTORE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 575 | INSTANCE EXPORT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 576 | INSTANCE HEALTH CHECK | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 577 | INSTANCE DEGRADED MODE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 578 | INSTANCE UPDATE CHANNEL | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 579 | SOURCE VERSION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 580 | DEPLOYMENT MANIFEST | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 581 | RELEASE NOTES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 582 | OPERATOR RELEASE NOTES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 583 | VERSION COMPATIBILITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 584 | CAPABILITY NEGOTIATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 585 | SAFE UPGRADE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 586 | POST-UPGRADE QUALIFICATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 587 | PRIVATE-ALPHA CI | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 588 | PRIVATE-ALPHA CD | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 589 | STAGING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 590 | FEATURE FLAGS FOR ALPHA | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 591 | OWNER FEATURE CONTROLS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 592 | PRIVATE-ALPHA SUPPORT MODE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 593 | SAFE DIAGNOSTICS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 594 | SUPPORT BUNDLE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 595 | SUPPORT WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 596 | PRODUCT INCIDENTS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 597 | INCIDENT RESULT | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 598 | ERROR TAXONOMY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 599 | ERROR RECOVERY CONTRACT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 600 | RETRY POLICY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 601 | BACKOFF | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 602 | CIRCUIT BREAKING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 603 | UNKNOWN EFFECT POLICY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 604 | EXTERNAL EFFECT RECONCILIATION | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 605 | WORK RECONCILIATION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 606 | RESOURCE CLEANUP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 607 | ORPHAN DETECTION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 608 | OWNER-FACING RECOVERY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 609 | PRODUCT RESILIENCE GOLDEN JOURNEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 610 | PROVIDER FAILURE GOLDEN JOURNEY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 611 | APP FAILURE GOLDEN JOURNEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 612 | RELAY FAILURE GOLDEN JOURNEY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 613 | FACTORY FAILURE GOLDEN JOURNEY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 614 | OWNER DISAPPEARS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 615 | DEADLINE PASSES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 616 | APP RATE LIMIT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 617 | PROVIDER RATE LIMIT | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 618 | FILE STORAGE FAILURE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 619 | DATABASE FAILURE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 620 | MIGRATION FAILURE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 621 | PRIVATE-ALPHA DATA MODEL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 622 | CANONICAL IDENTIFIERS | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 623 | WORK CORRELATION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 624 | GOAL CORRELATION | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 625 | OWNER CORRELATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 626 | SHARED SCOPE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 627 | PROVENANCE MODEL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 628 | RESULT STATUS MODEL | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 629 | WORK STATUS MODEL | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 630 | APPROVAL STATUS MODEL | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 631 | MEMORY STATUS MODEL | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 632 | LEARNING STATUS MODEL | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 633 | CONNECTION STATUS MODEL | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 634 | SPECIALIST STATUS MODEL | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 635 | CAPABILITY STATUS MODEL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 636 | PRODUCT EVENT MODEL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 637 | EVENT DEDUPLICATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 638 | EVENT SUPERSESSION | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 639 | EVENT PRIVACY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 640 | SEARCH INDEXING | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 641 | SEARCH CURRENT TRUTH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 642 | SEARCH RESULT PROVENANCE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 643 | SEARCH FILTERS | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 644 | SEARCH ACTIONS | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 645 | COMMAND PALETTE SEARCH | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 646 | KEYBOARD SHORTCUTS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 647 | MOBILE NAVIGATION | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 648 | MOBILE APPROVAL | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 649 | MOBILE RESULT | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 650 | MOBILE COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 651 | MOBILE FILES | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 652 | MOBILE DAILY BRIEF | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 653 | ACCESSIBILITY — LIVE REGIONS | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 654 | ACCESSIBILITY — APPROVALS | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 655 | ACCESSIBILITY — COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 656 | ACCESSIBILITY — TIMELINES | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 657 | ACCESSIBILITY — STATUS | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 658 | ACCESSIBILITY — MOBILE | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 659 | PERFORMANCE BUDGET | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 660 | TODAY QUERY PERFORMANCE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 661 | INBOX QUERY PERFORMANCE | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 662 | WORK QUERY PERFORMANCE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 663 | MEMORY RETRIEVAL PERFORMANCE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 664 | KNOWLEDGE SEARCH PERFORMANCE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 665 | ACTIVITY PERFORMANCE | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 666 | ARTIFACT PERFORMANCE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 667 | COMPUTER PERFORMANCE | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 668 | SPECIALIST PERFORMANCE | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 669 | FACTORY PERFORMANCE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 670 | RELAY PERFORMANCE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 671 | COST EFFICIENCY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 672 | CONTEXT EFFICIENCY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 673 | MODEL CALL EFFICIENCY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 674 | TOOL CALL EFFICIENCY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 675 | OWNER ATTENTION EFFICIENCY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 676 | PRODUCT DIFFERENTIATOR — OUTCOME OWNERSHIP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 677 | PRODUCT DIFFERENTIATOR — NO BABYSITTING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 678 | PRODUCT DIFFERENTIATOR — VERIFIED RESULTS | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 679 | PRODUCT DIFFERENTIATOR — CURRENT TRUTH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 680 | PRODUCT DIFFERENTIATOR — GOVERNED LEARNING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 681 | PRODUCT DIFFERENTIATOR — RELAY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 682 | PRODUCT DIFFERENTIATOR — MYFACTORY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 683 | PRODUCT DIFFERENTIATOR — PROOF OF WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 684 | PRODUCT DIFFERENTIATOR — PORTABLE EXPERIENCE | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 685 | PRODUCT DIFFERENTIATOR — TWO-PERSON BUSINESS COLLABORATION | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 686 | PRODUCT DIFFERENTIATOR — AGENT NATIVE UI | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 687 | AGENT-NATIVE HOME | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 688 | AGENT-NATIVE WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 689 | AGENT-NATIVE NEEDS YOU | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 690 | AGENT-NATIVE RESULT | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 691 | AGENT-NATIVE TEAM | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 692 | AGENT-NATIVE COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 693 | AGENT-NATIVE FILES | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 694 | AGENT-NATIVE KNOWLEDGE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 695 | AGENT-NATIVE APPROVAL | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 696 | AGENT-NATIVE STATUS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 697 | PRODUCT COPY — SOFIE | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 698 | PRODUCT COPY — SOFTWARE ENGINEER | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 699 | PRODUCT COPY — MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 700 | PRODUCT COPY — RELAY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 701 | PRODUCT COPY — MYFACTORY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 702 | PRODUCT COPY — APPROVAL | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 703 | PRODUCT COPY — BLOCKED | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 704 | PRODUCT COPY — VERIFICATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 705 | PRODUCT COPY — LEARNING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 706 | PRODUCT COPY — CURRENT TRUTH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 707 | PRODUCT COPY — CAPSULE | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 708 | PRODUCT COPY — COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 709 | PRODUCT COPY — SPECIALISTS | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 710 | PRODUCT COPY — USAGE | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 711 | PRODUCT COPY — EXTERNAL EFFECTS | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 712 | PRIVATE-ALPHA FEATURE SET — P0 | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 713 | PRIVATE-ALPHA FEATURE SET — P1 | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 714 | PRIVATE-ALPHA FEATURE SET — P2 | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 715 | PRIVATE-ALPHA FEATURE SET — P3 | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 716 | PLUTO PARITY — CORE MATRIX | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 717 | PLUTO PARITY — PRODUCT QUALITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 718 | PLUTO PARITY — APPROVAL EXPERIENCE | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 719 | PLUTO PARITY — COMPUTER EXPERIENCE | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 720 | PLUTO PARITY — MEMORY EXPERIENCE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 721 | PLUTO PARITY — SPECIALISTS | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 722 | PLUTO PARITY — CHANNELS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 723 | PLUTO PARITY — PRIVATE INSTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 724 | PLUTO PARITY — PROACTIVE WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 725 | PLUTO PARITY — ARTIFACTS | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 726 | PLUTO PARITY — EXTERNAL EFFECT SAFETY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 727 | PLUTO PARITY — AGENT IDENTITY | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 728 | PLUTO PARITY — DEPLOYMENT UX | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 729 | BEYOND PLUTO — GOAL OS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 730 | BEYOND PLUTO — WORK OS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 731 | BEYOND PLUTO — PROOF OF WORK | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 732 | BEYOND PLUTO — MYFACTORY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 733 | BEYOND PLUTO — RELAY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 734 | BEYOND PLUTO — CURRENT TRUTH | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 735 | BEYOND PLUTO — GOVERNED LEARNING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 736 | BEYOND PLUTO — PORTABILITY | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 737 | BEYOND PLUTO — VERIFIED DELEGATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 738 | BEYOND PLUTO — FEDERATION | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 739 | BEYOND PLUTO — COORDINATION DEBT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 740 | BEYOND PLUTO — DIGITAL WORKER MODEL | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 741 | IMPLEMENTATION STRATEGY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 742 | TRANCHE A — CORE UX | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 743 | TRANCHE A — APPROVAL CENTER | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 744 | TRANCHE A — TEAM | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 745 | TRANCHE A — APPS | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 746 | TRANCHE A — GLOBAL SEARCH / COMMAND | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 747 | TRANCHE A — TWO-OWNER UX | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 748 | TRANCHE B — SOFIE INBOX | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 749 | TRANCHE B — EMAIL | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 750 | TRANCHE B — SLACK | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 751 | TRANCHE B — PROACTIVE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 752 | TRANCHE B — DAILY / WEEKLY | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 753 | TRANCHE C — TEAM BUILDER | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 754 | TRANCHE C — ROOMS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 755 | TRANCHE C — RELAY FEDERATION | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 756 | TRANCHE D — COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 757 | TRANCHE D — ARTIFACTS | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 758 | TRANCHE E — CAPSULES | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 759 | TRANCHE E — LEARNING UX | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 760 | TRANCHE F — PHONE | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 761 | TRANCHE F — PAYMENTS | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 762 | TRANCHE F — FINANCE | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 763 | IMPLEMENTATION AUTONOMY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 764 | CROSS-REPO OWNERSHIP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 765 | MIGRATIONS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 766 | README REQUIREMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 767 | EVIDENCE REQUIREMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 768 | SCREENSHOTS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 769 | BROWSER QUALIFICATION | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 770 | ACCESSIBILITY QUALIFICATION | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 771 | TESTING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 772 | SECURITY COUNTERS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 773 | PRODUCT COUNTERS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 774 | PRIVATE-ALPHA LAUNCH COUNTERS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 775 | PRIVATE-ALPHA RELEASE DECISION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 776 | DEFINITION OF DONE — CAPABILITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 777 | DEFINITION OF DONE — PRIVATE ALPHA | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 778 | DEFINITION OF DONE — PLUTO PARITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 779 | DEFINITION OF DONE — BEYOND PLUTO | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 780 | DO NOT REBUILD QUALIFIED SUBSYSTEMS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 781 | CANONICAL SOURCE CANDIDATES | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 782 | LOST SOURCE POLICY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 783 | REMOTE DURABILITY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 784 | SOURCE MANIFEST | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 785 | SUPERSESSION | MYEVE | EXISTS_NEEDS_UX | Expose existing account/capability status honestly | `apps/eve/app/api/connections` |
| 786 | CURRENT TRUTH FOR ENGINEERING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 787 | CURRENT TRUTH FOR PRODUCT | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 788 | FEATURE INVENTORY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 789 | QUALIFICATION INVENTORY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 790 | PRIVATE-ALPHA CONFIGURATION PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 791 | PRIVATE-ALPHA OWNER PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 792 | PRIVATE-ALPHA BUSINESS PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 793 | PRIVATE-ALPHA PROVIDER PROFILE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 794 | PRIVATE-ALPHA RELAY PROFILE | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 795 | PRIVATE-ALPHA MYFACTORY PROFILE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 796 | PRIVATE-ALPHA LEARNING PROFILE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 797 | PRIVATE-ALPHA CAPSULE PROFILE | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 798 | PRIVATE-ALPHA CHANNEL PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 799 | PRIVATE-ALPHA APPROVAL PROFILE | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 800 | PRIVATE-ALPHA NOTIFICATION PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 801 | PRIVATE-ALPHA MEMORY PROFILE | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 802 | PRIVATE-ALPHA COMPUTER PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 803 | PRIVATE-ALPHA TEAM PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 804 | PRIVATE-ALPHA ROOM PROFILE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 805 | PRIVATE-ALPHA ARTIFACT PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 806 | PRIVATE-ALPHA USAGE PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 807 | PRIVATE-ALPHA SUPPORT PROFILE | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 808 | PHASE 0 — AUDIT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 809 | PHASE 1 — AGENT-NATIVE PRODUCT SHELL | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 810 | PHASE 1 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 811 | PHASE 2 — APPROVAL CENTER | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 812 | PHASE 2 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 813 | PHASE 3 — SOFIE INBOX | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 814 | PHASE 3 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 815 | PHASE 4 — TEAM | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 816 | PHASE 4 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 817 | PHASE 5 — COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 818 | PHASE 5 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 819 | PHASE 6 — CHANNELS | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 820 | PHASE 6 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 821 | PHASE 7 — ARTIFACTS | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 822 | PHASE 7 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 823 | PHASE 8 — RELAY TEAM/ROOMS | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 824 | PHASE 8 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 825 | PHASE 9 — PRIVATE BUSINESS COLLABORATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 826 | PHASE 9 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 827 | PHASE 10 — MYFACTORY PRIVATE ALPHA | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 828 | PHASE 10 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 829 | PHASE 11 — CAPSULES | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 830 | PHASE 11 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 831 | PHASE 12 — LEARNING UX | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 832 | PHASE 12 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 833 | PHASE 13 — PRIVATE-ALPHA DEPLOYMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 834 | PHASE 13 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 835 | PHASE 14 — LIVE ALPHA QUALIFICATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 836 | PHASE 14 ACCEPTANCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 837 | PHASE 15 — ITERATE FROM REAL USE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 838 | PRIORITY ORDER | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 839 | DO NOT CHASE FEATURE COUNT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 840 | DO NOT REPLACE MYEVE ARCHITECTURE WITH PLUTO'S | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 841 | DESIGN REVIEW | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 842 | ENGINEERING REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 843 | AUTHORITY REVIEW | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 844 | MEMORY REVIEW | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 845 | NOTIFICATION REVIEW | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 846 | SPECIALIST REVIEW | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 847 | FACTORY REVIEW | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 848 | COMPUTER REVIEW | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 849 | CHANNEL REVIEW | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 850 | POST-ALPHA REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 851 | DOCUMENTATION SET | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 852 | README — MYEVE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 853 | README — RELAY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 854 | README — MYFACTORY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 855 | PRODUCT DOCUMENTATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 856 | OPERATOR DOCUMENTATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 857 | EVIDENCE DOCUMENTATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 858 | STATUS LANGUAGE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 859 | SCREENSHOT EVIDENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 860 | GOLDEN JOURNEY EVIDENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 861 | FAILURE JOURNEY EVIDENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 862 | PERFORMANCE EVIDENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 863 | ACCESSIBILITY EVIDENCE | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 864 | REMOTE SOURCE EVIDENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 865 | WORKTREE CLEANLINESS | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 866 | BRANCH OWNERSHIP | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 867 | REVIEWER MODEL | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 868 | IMPLEMENTER RESPONSE TO REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 869 | REVIEW SCOPE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 870 | REVIEW EVIDENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 871 | PRIVATE-ALPHA SECURITY REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 872 | PRIVATE-ALPHA PRODUCT REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 873 | PRIVATE-ALPHA UX REVIEW | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 874 | PRIVATE-ALPHA RECOVERY REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 875 | PRIVATE-ALPHA DATA REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 876 | PRIVATE-ALPHA DEPLOYMENT REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 877 | LAUNCH READINESS MATRIX | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 878 | LAUNCH BLOCKER POLICY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 879 | LAUNCH WAIVER POLICY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 880 | FEATURE DISABLEMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 881 | DEGRADATION OVER BLOCKING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 882 | PRIVATE-ALPHA RELEASE CANDIDATE | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 883 | RELEASE CANDIDATE INPUTS | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 884 | RELEASE CANDIDATE QUALIFICATION | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 885 | RELEASE CANDIDATE GOLDEN JOURNEY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 886 | RELEASE CANDIDATE NEGATIVE JOURNEY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 887 | RELEASE CANDIDATE SOURCE DURABILITY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 888 | RELEASE CANDIDATE BACKUP | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 889 | RELEASE CANDIDATE ROLLBACK | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 890 | PRIVATE-ALPHA DEPLOYMENT | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 891 | POST-DEPLOY SMOKE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 892 | OWNER A LIVE JOURNEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 893 | OWNER B LIVE JOURNEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 894 | LIVE APPROVAL JOURNEY | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 895 | LIVE RESTART JOURNEY | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 896 | LIVE DAILY BRIEF | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 897 | LIVE NEEDS YOU | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 898 | LIVE MEMORY | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 899 | LIVE SHARED BUSINESS KNOWLEDGE | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 900 | LIVE MYFACTORY | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 901 | LIVE RELAY | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 902 | LIVE COMPUTER | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 903 | LIVE EMAIL | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 904 | LIVE SLACK | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 905 | LIVE SPECIALIST | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 906 | LIVE ROOM | CROSS-SYSTEM | PARTIAL | Private scope UI now; shared membership/authority proposal only | `apps/eve/lib/web-auth.ts` |
| 907 | LIVE CAPSULE | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 908 | LIVE LEARNING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 909 | ALPHA STATUS PAGE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 910 | ALPHA KNOWN ISSUES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 911 | ALPHA FEEDBACK REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 912 | ALPHA PRIORITIZATION | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 913 | ALPHA ITERATION CADENCE | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 914 | ALPHA RELEASE NOTES | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 915 | ALPHA MEMORY REVIEW | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 916 | ALPHA NEEDS YOU REVIEW | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 917 | ALPHA COORDINATION REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 918 | ALPHA RESULT REVIEW | MYEVE | EXISTS_NEEDS_UX | Reuse accepted beta UX; canonical Work integration remains separate | `apps/eve/components/owner` |
| 919 | ALPHA DAILY BRIEF REVIEW | MYEVE | EXISTS_NEEDS_UX | Reuse typed daily and weekly review endpoints | `apps/eve/lib/review-types.ts` |
| 920 | ALPHA PROACTIVE REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 921 | ALPHA TEAM REVIEW | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 922 | ALPHA COMPUTER REVIEW | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 923 | ALPHA CHANNEL REVIEW | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 924 | ALPHA RELAY REVIEW | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 925 | ALPHA FACTORY REVIEW | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 926 | ALPHA LEARNING REVIEW | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 927 | ALPHA CAPSULE REVIEW | MYEVE | EXISTS_NEEDS_INTEGRATION | Await durable final Capsule source; preserve boundary | `docs/beta-ux-integration-contract.md` |
| 928 | ALPHA APPROVAL REVIEW | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 929 | ALPHA EXTERNAL EFFECT REVIEW | MYEVE | EXISTS_NEEDS_UX | Existing exact-action contracts; no broader grants | `apps/eve/lib/approvals.ts` |
| 930 | ALPHA PRIVACY REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 931 | ALPHA BACKUP REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 932 | ALPHA SOURCE DURABILITY REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 933 | ALPHA DEPENDENCY REVIEW | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 934 | ALPHA SECURITY HARDENING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 935 | ALPHA BILLING HARDENING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 936 | ALPHA MULTI-TENANCY HARDENING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 937 | ALPHA ENTERPRISE HARDENING | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 938 | ALPHA PAYMENTS HARDENING | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 939 | ALPHA PHONE HARDENING | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 940 | ALPHA PUBLIC SHARING | CROSS-SYSTEM | POST_ALPHA | Not required for the two-owner alpha | `apps/eve/app/api/finance` |
| 941 | ALPHA API HARDENING | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 942 | ALPHA WEBHOOK HARDENING | CROSS-SYSTEM | PARTIAL | Existing channels; unified canonical correlation boundary pending | `apps/eve/app/api/channels` |
| 943 | ALPHA COMPUTER HARDENING | MYEVE | EXISTS_NEEDS_UX | Reuse existing sessions, viewer and owner controls | `apps/eve/components/computer-workspace.tsx` |
| 944 | ALPHA RELAY HARDENING | RELAY | EXISTS_NEEDS_INTEGRATION | Consume qualified contracts; no Relay changes | `apps/eve/lib/peer-permissions.ts` |
| 945 | ALPHA MYFACTORY HARDENING | CROSS-SYSTEM | EXISTS_NEEDS_INTEGRATION | WAITING_FOR_CANONICAL_Q37; existing contracts only | `apps/eve/lib/engineering` |
| 946 | ALPHA MEMORY HARDENING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 947 | ALPHA LEARNING HARDENING | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 948 | ALPHA ARTIFACT HARDENING | MYEVE | EXISTS_NEEDS_UX | Reuse versioned artifacts and file APIs | `apps/eve/app/api/artifacts` |
| 949 | ALPHA SPECIALIST HARDENING | MYEVE | EXISTS_NEEDS_UX | Use persisted roster and existing builder | `apps/eve/components/agents-panel.tsx` |
| 950 | ALPHA UX HARDENING | MYEVE | EXISTS_NEEDS_UX | Product-only composition and qualification | `apps/eve/components/owner` |
| 951 | PLUTO COMPARISON AFTER ALPHA | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 952 | PRODUCT NORTH STAR | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 953 | SECONDARY NORTH STAR | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 954 | TRUST NORTH STAR | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 955 | LEARNING NORTH STAR | MYEVE | PARTIAL | Reuse owner knowledge; governed learning awaits canonical integration | `apps/eve/lib/owner-knowledge.ts` |
| 956 | COLLABORATION NORTH STAR | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 957 | PRIVATE-ALPHA SUCCESS CRITERIA | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
| 958 | PRIVATE-ALPHA FAILURE SIGNALS | CROSS-SYSTEM | PARTIAL | Acceptance/documentation/qualification requirement; track in phase ledger | `docs/private-alpha/PRIVATE-ALPHA-GAPS.md` |
