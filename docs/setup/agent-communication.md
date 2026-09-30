# Agent-to-agent information exchange

MyEve's `federation_request` tool uses the existing Relay protocol for both MyEve peers and compatible external agents. It is not a generic webhook sender, nor does selecting a model such as Grok create a GrokBot connection.

## Set up a peer

1. Configure MyEve's separate Relay installation and signing pins using the [combined setup guide](myeve-relay-myfactory.md). Register each agent under its own owner and platform identity.
2. Obtain the peer's real Relay address. For Muse or GrokBots, identify the actual service/repository and owner first. Their receiver must implement the registered Relay adapter contract: authenticated delivery, exact capability/resource validation, durable request identity, a signed completion and a correlated answer. Do not invent endpoints from a display name.
3. In Manage → Relay → Peer permissions, add the exact peer and direction, scope and expiry. The resource owner's Relay grant and MyEve's local policy must both permit the action. Discovery alone grants nothing. Keep message, Knowledge, artifact and work permissions separate.
4. For two-way communication, configure the recipient's incoming policy and reply behavior and the required return authority. Automatic replies are opt-in, use a bounded public profile, and cannot read private memory or operate tools. See [the Relay adapter architecture](../federation/architecture.md).
5. Keep receiving services/workers running. A local process that has stopped cannot complete queued work. Hosted credentials and private keys stay server-side; never paste them into chat or this guide.

## End-to-end acceptance

Run one harmless, uniquely labeled question through Sofie's normal chat and exact-action approval. Save its request and conversation IDs. Verify:

- The intended sender and recipient and currently valid scope appear in authenticated Relay records.
- Exactly one request reaches the recipient and one written response comes back, with matching request, conversation and participant identity.
- Sofie displays that actual response. An acknowledgment without a body, `replyStatus=unavailable`, or a model's invented answer fails conversational acceptance.
- Reading the same request again creates no second send or recipient effect.
- Missing, expired or revoked authority denies the effect. Offline and uncertain outcomes remain visible; no new request is created to conceal them.
- A message-only peer cannot retrieve private Knowledge, memory, local files, shell or desktop capabilities. External content remains untrusted context.

Repeat against a second MyEve deployment and each named external platform. A local fixture can qualify protocol behavior but cannot qualify a live Muse/GrokBots installation. Record the actual result in [connection qualification](../verification/connections-2026-09-30.md).
