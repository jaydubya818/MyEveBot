# Sofie enterprise consumer — isolated readiness

The `mission_control` tool uses the existing Eve tool loader, owner session, primary Agent resolution, Action Gateway, durable Action receipts and canonical MissionControl service command envelope. There is no new Mission lifecycle, accounting ledger or Result store.

The tool recommends MissionControl for multi-workstream software initiatives requiring enterprise governance. Its description preserves Sofie Native direct/multi-agent work and MyFactory bounded repository work. This checkpoint invokes deterministic tool inputs, not a paid language model or an unqualified natural-language classifier.

## Boundaries

Disabled unless feature `missioncontrol-readiness` and `MYEVE_MISSIONCONTROL_MODE=ISOLATED_DETERMINISTIC` are explicitly configured. Only loopback HTTP is allowed. Configuration binds the synthetic MyEve owner to one MissionControl operator, tenant, project, connection and dedicated application key. Destination, identity and key are never model inputs. No production endpoint, owner JWT, worker key or administrative operation is available.

Both current and initiating principals must be the configured owner from `myeve-web-session`; guests, child sessions, roles and non-primary Agents are denied. This tests execution of a verified session context; browser authentication/session issuance is a separate qualification item. Canonical MyEve ingress remains responsible for issuing and revoking sessions.

Sofie proposes an inspectable zero-budget draft, presents its exact digest and Needs You, and submits only after the owner approves that digest through canonical MissionControl authentication. The application cannot perform that owner decision. Inspection before admission and after revocation is read-only with respect to Mission/proposal state; service-command audit receipts remain canonical.

The consumer validates response schema, application/owner/project/connection identity, proposal and Plan bindings, content digest and one-minute observation window. Local HTTP assumes a trusted isolated host; the content digest is not an offline signature or production TLS qualification. Gateway receipt sanitization is preserved: a redacted or truncated response fails exact-response validation rather than being passed off as original Proof.

Completed Action replays are revalidated after the gateway returns. Expired or altered observations require a new read-only inspection; original mutations and UNKNOWN Actions are never automatically redispatched. Lost submission acknowledgment is reconciled by `enterprise.inspect` then `enterprise.read`, leaving the canonical UNKNOWN Action for its existing review flow.

## Qualification and ownership

Run unit contracts with `node --import tsx --test apps/eve/test/missioncontrol-consumer.test.mjs`. Run the composed fixture with `MISSIONCONTROL_SOURCE_ROOT` pointing at the exact pinned source, and `MC_COMPATIBILITY_CONVEX_BINARY` pointing at the checksum-qualified local backend. `apps/eve/test/missioncontrol-consumer.integration.mjs` starts fresh PostgreSQL and Convex stores, invokes the actual tool/Action Gateway and deletes both stores. It does not load environment files or call models.

Golden Journey owns canonical Mission isolation/grants, the execution runner and browser evidence. This branch owns the inactive MyEve consumer; the readiness branch owns only the narrow MissionControl app projection. Do not adopt Golden Journey's unqualified working tree or replace existing MyFactory Result consumption.

Completed enterprise Result consumption is now an additive isolated candidate described in SOFIE_COMPLETED_RESULT.md. It uses actual deterministic hybrid execution evidence through the canonical runner. Composed browser and release-gate qualification still belongs to Golden Journey. Factory success, a handoff reference or an eligible WorkOrder gate alone cannot establish enterprise completion. Do not seed a fake completed Result to close this item.

Production integration NOT_RUN; paid model operations 0; external-alpha changes 0; executable production grants 0. No dependency merge or deployment is part of this checkpoint. Retention-lock enforcement remains open; exact private runtime distribution is accepted and closed.
