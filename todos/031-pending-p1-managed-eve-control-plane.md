---
status: pending
priority: p1
issue_id: "031"
tags: [managed-eve, beta, isolation, operations]
dependencies: ["017"]
---

# Managed isolated Eve for first beta

The first external owner must get a working Eve operated by MyEve, without creating a Vercel account. Keep the existing BYO Builder as an advanced path. See `docs/federation/managed-eve-first-beta.md` for the release contract.

- [x] Define the per-environment registry and legal lifecycle transitions; reject duplicate tester/project reservations and activation without source, health, and budget evidence.
- [ ] Connect the registry to operator-authenticated, idempotent Vercel project, dedicated Neon database, Blob store, credential, and Agent provisioning. Test failed-stage recovery and no shared store or secret between two Eves.
- [ ] Pin source SHA and migrations for single-environment upgrades, with verified backup, health check, and rollback.
- [ ] Monitor project/deployment/database/Relay health and failures; enforce a per-project AI Gateway budget and configure a platform-spend pause procedure. Show unknown usage as unknown.
- [ ] Verify the existing owner-facing archive download and hash check on a hosted isolated Eve. State exclusions and portability honestly; do not promise restore before work order 019.
- [ ] Implement pause, signed/exported-data handoff, Relay revocation, credential cleanup, exact project/database/Blob deletion, and a non-secret deletion receipt. Rehearse on a disposable environment.
- [ ] Run a clean-room first-user setup, both-way Relay communication, governed Knowledge sharing, private denial, and revocation. Complete tester-host MyFactory acceptance separately.

Do not issue the external owner's Relay invitation or send the beta packet until the managed Eve URL, owner export, isolation, and hosted communication gates pass.
