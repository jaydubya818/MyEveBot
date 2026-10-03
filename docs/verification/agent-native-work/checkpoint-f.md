# Checkpoint F — Relay product view and persistent Group boundary

Status: PARTIAL. Persistent Groups and real Group execution are NOT_QUALIFIED.

## Implemented

Agent collaboration now reads existing owner-scoped Relay request metadata and groups records by their retained conversation correlation. Concise status is visible; sender/request identifiers remain under expandable Proof of handoff. Requests without correlation remain individual requests. Private message bodies, Memory, encrypted credentials and response payloads are not selected. The existing private-owner/partner restriction is preserved.

This view does not create Groups, fabricate participating agents, send messages, authorize capability use or claim a verified Result from transport status. Persistent Groups stay explicitly unavailable. The prepared schema and identity/handoff contract is in docs/product/schema-proposals/agent-groups.md. No migration number allocated; no protected implementation copied.

## Qualification

- 14 deterministic PostgreSQL assertions: same-owner correlation, identical correlation IDs in different owners remain isolated, payload/credential exclusion, missing owner and uncorrelated request behavior.
- Four production-build Playwright cases at desktop/390px; two scoped accessibility scans; collapsed Proof, keyboard expansion, auth and outage/retry covered.
- Browser populated view uses deterministic metadata fixtures. Actual local API authentication/empty read also checked. No live Relay delivery or agent execution.
- Typecheck/governance/build pass; screenshots output/playwright/agent-native/{desktop,390px}-collaboration.png.

## Remaining gates

The existing connection maps one local_agent_id per owner. Independent Group member identities require canonical registry/adapter integration; substituting Sofie for every sender is invalid. Durable Group objective/membership/revision/audit and bounded Result handoff remain unimplemented. Shared schema proposal awaits canonical ownership. Researcher → Relay → Software Engineer → Sofie LIVE is NOT_RUN. Independently deployed MyEve A/B, Muse and GrokBots remain NOT_RUN until their real authenticated endpoints and scopes are available.
