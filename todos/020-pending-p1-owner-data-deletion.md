---
status: pending
priority: p1
issue_id: "020"
tags: [data-ownership, deletion, connections, audit]
dependencies: ["017", "018", "019"]
---

# Audited deletion and connector revocation

Implement dependency-aware domain deletion plans for Conversations, Memory, Knowledge, Goals, Runs, Skills, and Finance. Require explicit confirmation, verify local and supported remote deletion, distinguish disconnect from provider revocation, report unverifiable revocation honestly, and issue durable audit receipts. Add delete-all only after domain deletion is qualified.
