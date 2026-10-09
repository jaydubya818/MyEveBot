# Private-alpha launch — current status

Hosted activation and canonical-main integration completed; the full real-provider Sofie journey is NOT READY. No real model operation, launch Work, live Result, or publication was performed by this launch workflow. Billing remains non-blocking.

Current evidence: [activation](activation.json), [source manifest](source-manifest.json), [deployed health](deployed-health.json), [qualification](qualification.json), [protected backup/restore](backup-recovery.json). The earlier worker connection evidence is a synthetic provider run, not a real journey.

MyEve production runs exact 6cfb0ccbf217c5f931c42a2ecf76ec1f29644350. Canonical main and the installed local worker are 7f337efbfa0ad5096ab0f58b34c631d52468fcd6; its only additional runtime change is local exact-Work approval fencing. Relay main/deployment remain a61f0ef697b02cf22da72ff2904c584d7faa026a. MyFactory main and persistent installed source are 33fd5c97fdafbf740c92261b52b0d9b76a46ecd6. All updates were verified fast-forwards; milestone tags remain unchanged ancestors.

Production settings enable the explicit alpha queue and narrow tool discovery. Hosted Factory requests are owner/revision/repository/budget-bound intents; the unchanged canonical local driver owns actual admission, writer custody, UNKNOWN fencing and verification. The real local worker additionally requires an exact owner-approved Work ID/version/generation. Stop/takeover remain available. Publication is absent from the scoped local client. No runtime approval variables have been set.

Database migration 0073 repairs missing PostgreSQL SET membership for the existing restricted Goal/Inbox roles. A fresh protected backup was fully restored first, the defect reproduced with a non-superuser, role isolation checked, and migration/idempotency qualified. Production Work and Needs You now load normally. The service screen passes five included checks; optional browser and connected apps are excluded. This does not qualify provider authentication, real Memory recall, a 390px layout, two owners, or a live Result.

Provider Keychain item remains absent: service `com.myeve.myfactory.q37`, account `openai-provider`. The owner must provision the API key in the password field, never in chat or an environment file. Only the qualified provider loader may resolve its value.

A separate implementation gap was found during final boundary review: selected-Work Sofie chat still uses the native-only conversation model and channel gate. The hosted queue/discovery tests do not qualify that path. Its canonical budgeted composition must be finished before the full Golden Journey can be approved; do not route around common-ledger accounting or enable the native executor in production. See [continuation](continuation.md).
